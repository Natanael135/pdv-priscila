import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, QueryFilter, Types } from 'mongoose';
import { EstoqueService } from '../estoque/estoque.service';
import { UploadsService } from '../uploads/uploads.service';
import { Venda } from '../vendas/venda.schema';
import { Produto, ProdutoDocument } from './produto.schema';
import { AtualizarProdutoDto, CriarProdutoDto } from './produtos.dto';

export interface FiltroProdutos {
  busca?: string;
  categoria?: string;
  somenteBaixo?: boolean;
  incluirInativos?: boolean;
}

export type OrdemMargem =
  | 'margemPercentual'
  | 'lucroGerado'
  | 'quantidadeVendida'
  | 'nome';

@Injectable()
export class ProdutosService {
  constructor(
    @InjectModel(Produto.name)
    private readonly modelo: Model<ProdutoDocument>,
    @InjectModel(Venda.name)
    private readonly vendas: Model<Venda>,
    private readonly estoque: EstoqueService,
    private readonly uploads: UploadsService,
  ) {}

  async listar(filtro: FiltroProdutos = {}) {
    const query: QueryFilter<ProdutoDocument> = {};

    if (!filtro.incluirInativos) query.ativo = true;
    if (filtro.categoria) query.categoria = filtro.categoria;

    if (filtro.busca?.trim()) {
      const termo = escapar(filtro.busca.trim());
      // o mesmo campo serve para digitar o nome e para bipar o código
      query.$or = [
        { nome: new RegExp(termo, 'i') },
        { codigoBarras: new RegExp(`^${termo}$`, 'i') },
      ];
    }

    if (filtro.somenteBaixo) {
      query.controlaEstoque = true;
      query.$expr = { $lte: ['$estoqueAtual', '$estoqueMinimo'] };
    }

    const produtos = await this.modelo
      .find(query)
      .sort({ nome: 1 })
      .populate('categoria', 'nome cor icone')
      .exec();

    return produtos.map((p) => comSituacao(p));
  }

  async obter(id: string) {
    const produto = await this.modelo
      .findById(id)
      .populate('categoria', 'nome cor icone')
      .exec();

    if (!produto) throw new NotFoundException('Produto não encontrado');
    return comSituacao(produto);
  }

  /**
   * Busca exata — é o que o leitor de código de barras usa.
   *
   * Procura no produto E nas variações: com grade, cada cor/tamanho
   * costuma ter etiqueta própria, e é esse código que vem na peça.
   */
  async porCodigoBarras(codigo: string) {
    const produto = await this.modelo
      .findOne({
        ativo: true,
        $or: [{ codigoBarras: codigo }, { 'variacoes.codigoBarras': codigo }],
      })
      .populate('categoria', 'nome cor icone')
      .exec();

    if (!produto) {
      throw new NotFoundException(`Nenhum produto com o código ${codigo}`);
    }
    return comSituacao(produto);
  }

  async criar(dto: CriarProdutoDto) {
    await this.garantirCodigoLivre(dto.codigoBarras);

    const { estoqueAtual, variacoes, ...resto } = dto;

    /**
     * O produto nasce zerado — inclusive as variações.
     *
     * O saldo inicial entra logo abaixo como MOVIMENTAÇÃO, não como
     * campo gravado direto. Assim o primeiro estoque também tem
     * história (com data, motivo e custo), e o saldo do produto sai
     * somado da grade pelo mesmo caminho que todo o resto usa.
     */
    const produto = await this.modelo.create({
      ...resto,
      estoqueAtual: 0,
      variacoes: (variacoes ?? []).map((v) => ({
        cor: v.cor ?? null,
        tamanho: v.tamanho ?? null,
        codigoBarras: v.codigoBarras ?? null,
        estoqueMinimo: v.estoqueMinimo ?? 0,
        precoVenda: v.precoVenda ?? null,
        ativo: v.ativo ?? true,
        estoqueAtual: 0,
      })),
    });

    if (variacoes?.length) {
      // uma entrada por variação que veio com quantidade
      for (let i = 0; i < variacoes.length; i++) {
        const inicial = variacoes[i].estoqueAtual ?? 0;
        if (inicial <= 0) continue;

        const criada = produto.variacoes[i] as unknown as { _id: Types.ObjectId };

        await this.estoque.movimentar({
          produtoId: produto._id,
          variacaoId: String(criada._id),
          tipo: 'entrada',
          quantidade: inicial,
          custoUnitario: dto.precoCompra,
          motivo: 'Estoque inicial do cadastro',
        });
      }
    } else if (estoqueAtual && estoqueAtual > 0) {
      await this.estoque.movimentar({
        produtoId: produto._id,
        tipo: 'entrada',
        quantidade: estoqueAtual,
        custoUnitario: dto.precoCompra,
        motivo: 'Estoque inicial do cadastro',
      });
    }

    return this.obter(String(produto._id));
  }

  async atualizar(id: string, dto: AtualizarProdutoDto) {
    const atual = await this.modelo.findById(id).exec();
    if (!atual) throw new NotFoundException('Produto não encontrado');

    if (dto.codigoBarras && dto.codigoBarras !== atual.codigoBarras) {
      await this.garantirCodigoLivre(dto.codigoBarras);
    }

    /**
     * Fotos que saíram da galeria vão embora do Cloudinary também.
     *
     * Sem isto, cada troca de imagem deixaria um arquivo órfão lá,
     * consumindo a cota da conta sem nunca mais ser exibido.
     */
    if (dto.fotos) {
      const continuam = new Set(dto.fotos.map((f) => f.publicId));
      const removidas = (atual.fotos ?? []).filter(
        (f) => !continuam.has(f.publicId),
      );

      for (const foto of removidas) await this.uploads.remover(foto.publicId);
    }

    /**
     * Variações: mantém o saldo de quem já existia.
     *
     * O formulário devolve a grade inteira, inclusive o estoque que ele
     * leu ao abrir. Gravar isso de volta apagaria qualquer venda ou
     * entrada ocorrida no meio-tempo — o estoque só pode mudar por
     * movimentação. Aqui a estrutura (cor, tamanho, preço) é atualizada
     * e o saldo é preservado do que está no banco.
     */
    const atualizacao: Record<string, unknown> = { ...dto };

    if (dto.variacoes) {
      const saldoAnterior = new Map(
        (atual.variacoes ?? []).map((v) => [
          String((v as unknown as { _id: Types.ObjectId })._id),
          v.estoqueAtual,
        ]),
      );

      atualizacao.variacoes = dto.variacoes.map((v) => ({
        // reaproveita o _id para o Mongoose entender que é a mesma linha
        ...(v.id ? { _id: new Types.ObjectId(v.id) } : {}),
        cor: v.cor ?? null,
        tamanho: v.tamanho ?? null,
        codigoBarras: v.codigoBarras ?? null,
        estoqueMinimo: v.estoqueMinimo ?? 0,
        precoVenda: v.precoVenda ?? null,
        ativo: v.ativo ?? true,
        estoqueAtual: v.id ? (saldoAnterior.get(v.id) ?? 0) : (v.estoqueAtual ?? 0),
      }));

      // o saldo do produto acompanha a soma da grade
      atualizacao.estoqueAtual = (
        atualizacao.variacoes as { estoqueAtual: number }[]
      ).reduce((s, v) => s + v.estoqueAtual, 0);
    }

    await this.modelo
      .findByIdAndUpdate(id, atualizacao, { returnDocument: 'after' })
      .exec();

    return this.obter(id);
  }

  async desativar(id: string) {
    const produto = await this.modelo
      .findByIdAndUpdate(id, { ativo: false }, { returnDocument: 'after' })
      .exec();

    if (!produto) throw new NotFoundException('Produto não encontrado');
    return this.obter(id);
  }

  async reativar(id: string) {
    const produto = await this.modelo
      .findByIdAndUpdate(id, { ativo: true }, { returnDocument: 'after' })
      .exec();

    if (!produto) throw new NotFoundException('Produto não encontrado');
    return this.obter(id);
  }

  /**
   * Em quantas vendas o produto já apareceu — canceladas incluídas.
   *
   * A venda cancelada continua no histórico e continua apontando para o
   * produto. Contar só as concluídas abria uma brecha: bastava cancelar
   * a venda para o produto virar apagável, e aí o cupom antigo ficava
   * com um item apontando para o vazio.
   */
  async contarVendas(id: string) {
    // A conversão explícita é proposital. Esta consulta já retornou zero
    // em silêncio uma vez, quando os campos de referência do schema
    // estavam registrados como Mixed em vez de ObjectId (`type:` errado
    // no @Prop) e o Mongoose não convertia a string. O schema foi
    // corrigido, mas aqui uma falha silenciosa deixaria apagar produto
    // com histórico de venda — então não dependemos da conversão.
    return this.vendas
      .countDocuments({ 'itens.produto': new Types.ObjectId(id) })
      .exec();
  }

  /**
   * Exclusão definitiva. Só passa se o produto nunca foi vendido —
   * apagar um item com histórico faria o faturamento e o lucro dos
   * meses passados mudarem sozinhos. Nesse caso a resposta explica que
   * o caminho é desativar.
   */
  async excluir(id: string) {
    const produto = await this.modelo.findById(id).exec();
    if (!produto) throw new NotFoundException('Produto não encontrado');

    const vendas = await this.contarVendas(id);
    if (vendas > 0) {
      throw new ConflictException(
        `Este produto já apareceu em ${vendas} venda${vendas > 1 ? 's' : ''}. ` +
          'Apagar deixaria esses cupons com um item apontando para o vazio — ' +
          'desative em vez de excluir.',
      );
    }

    // a galeria inteira some junto com o produto
    for (const foto of produto.fotos ?? []) {
      await this.uploads.remover(foto.publicId);
    }

    // o histórico de estoque não faz sentido sem o produto
    await this.estoque.removerHistoricoDoProduto(id);

    await this.modelo.findByIdAndDelete(id).exec();
  }

  /**
   * Tela de margens: junta o cadastro com o que o produto já rendeu.
   * O quanto vendeu vem das vendas concluídas, item a item.
   */
  async margens(ordem: OrdemMargem = 'margemPercentual') {
    const desempenho = await this.vendas.aggregate<{
      _id: string;
      quantidadeVendida: number;
      faturamento: number;
      lucroGerado: number;
    }>([
      { $match: { status: 'concluida' } },
      { $unwind: '$itens' },
      { $match: { 'itens.produto': { $ne: null } } },
      {
        $group: {
          _id: '$itens.produto',
          quantidadeVendida: { $sum: '$itens.quantidade' },
          faturamento: { $sum: '$itens.total' },
          lucroGerado: {
            $sum: {
              $subtract: [
                '$itens.total',
                { $multiply: ['$itens.quantidade', '$itens.custoUnitario'] },
              ],
            },
          },
        },
      },
    ]);

    const porProduto = new Map(desempenho.map((d) => [String(d._id), d]));

    const produtos = await this.modelo
      .find({ ativo: true })
      .populate('categoria', 'nome cor icone')
      .exec();

    const linhas = produtos.map((p) => {
      const d = porProduto.get(String(p._id));
      return {
        ...comSituacao(p),
        quantidadeVendida: arredondar(d?.quantidadeVendida ?? 0),
        faturamento: arredondar(d?.faturamento ?? 0),
        lucroGerado: arredondar(d?.lucroGerado ?? 0),
      };
    });

    // ordenação em memória: a lista de produtos de uma loja cabe nisso,
    // e evita duas idas ao banco só para ordenar por campo calculado
    linhas.sort((a, b) => {
      if (ordem === 'nome') return a.nome.localeCompare(b.nome, 'pt-BR');
      return Number(b[ordem] ?? 0) - Number(a[ordem] ?? 0);
    });

    return linhas;
  }

  private async garantirCodigoLivre(codigo?: string | null) {
    if (!codigo) return;

    const existente = await this.modelo.findOne({ codigoBarras: codigo }).exec();
    if (existente) {
      throw new BadRequestException(
        `O código ${codigo} já está no produto "${existente.nome}"`,
      );
    }
  }
}

/**
 * Acrescenta a situação do estoque ao que vai para o app. É derivado,
 * então não se guarda no banco: bastaria alguém mudar o mínimo para o
 * valor gravado ficar mentindo.
 */
function comSituacao(produto: ProdutoDocument) {
  const json = produto.toJSON() as unknown as Produto & { id: string };

  const situacaoEstoque = !produto.controlaEstoque
    ? 'ok'
    : produto.estoqueAtual <= 0
      ? 'sem'
      : produto.estoqueAtual <= produto.estoqueMinimo
        ? 'baixo'
        : 'ok';

  return { ...json, situacaoEstoque };
}

function arredondar(n: number) {
  return Math.round(n * 100) / 100;
}

function escapar(texto: string) {
  return texto.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
