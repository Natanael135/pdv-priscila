import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model, Types } from 'mongoose';
import { NotificacoesService } from '../notificacoes/notificacoes.service';
import {
  Produto,
  ProdutoDocument,
  somarVariacoes,
  Variacao,
} from '../produtos/produto.schema';
import {
  Movimentacao,
  MovimentacaoDocument,
  TipoMovimentacao,
} from './movimentacao.schema';

export interface EntradaMovimentacao {
  produtoId: string | Types.ObjectId;
  /** obrigatório quando o produto tem grade de cor/tamanho */
  variacaoId?: string | null;
  tipo: TipoMovimentacao;
  /** 'ajuste' -> contagem nova; demais -> quanto entrou/saiu */
  quantidade: number;
  custoUnitario?: number | null;
  motivo?: string | null;
  vendaId?: Types.ObjectId | null;
  /** fornecedor da remessa; só usado em entrada */
  fornecedorId?: string | Types.ObjectId | null;
}

@Injectable()
export class EstoqueService {
  constructor(
    @InjectModel(Produto.name)
    private readonly produtos: Model<ProdutoDocument>,
    @InjectModel(Movimentacao.name)
    private readonly movimentacoes: Model<MovimentacaoDocument>,
    private readonly notificacoes: NotificacoesService,
  ) {}

  /**
   * Único caminho por onde o estoque muda. Todo movimento deixa rastro,
   * e os avisos de falta são reavaliados na sequência.
   *
   * Sobre estoque negativo: é PERMITIDO de propósito. Numa loja de
   * verdade a contagem do sistema erra, e travar a venda de um produto
   * que está na mão do cliente seria pior que registrar -1 e corrigir
   * no inventário depois. O saldo negativo aparece em vermelho na tela
   * de estoque justamente para ser percebido e ajustado.
   */
  async movimentar(
    entrada: EntradaMovimentacao,
    session?: ClientSession,
  ): Promise<ProdutoDocument> {
    const produto = await this.produtos
      .findById(entrada.produtoId)
      .session(session ?? null)
      .exec();

    if (!produto) throw new NotFoundException('Produto não encontrado');

    // serviço / produto sem controle: nada a movimentar
    if (!produto.controlaEstoque) return produto;

    const temGrade = (produto.variacoes?.length ?? 0) > 0;

    if (temGrade && !entrada.variacaoId) {
      throw new BadRequestException(
        `"${produto.nome}" tem grade de cor/tamanho. Diga qual variação movimentar.`,
      );
    }

    const quantidade = Math.abs(Number(entrada.quantidade));

    // Onde o saldo vive: na variação, quando há grade; no produto,
    // quando não há. O resto do cálculo é idêntico nos dois casos.
    const variacao = temGrade
      ? produto.variacoes.find(
          (v) => String((v as unknown as { _id: Types.ObjectId })._id) === entrada.variacaoId,
        )
      : null;

    if (temGrade && !variacao) {
      throw new NotFoundException('Variação não encontrada neste produto');
    }

    const anterior = variacao ? variacao.estoqueAtual : produto.estoqueAtual;

    const delta =
      entrada.tipo === 'ajuste'
        ? Number(entrada.quantidade) - anterior
        : entrada.tipo === 'entrada' || entrada.tipo === 'cancelamento'
          ? quantidade
          : -quantidade;

    if (variacao) {
      variacao.estoqueAtual = anterior + delta;
      // o saldo do produto é a soma da grade — ver produto.schema.ts
      produto.estoqueAtual = somarVariacoes(produto.variacoes);
    } else {
      produto.estoqueAtual = anterior + delta;
    }

    await produto.save({ session });

    await this.movimentacoes.create(
      [
        {
          produto: produto._id,
          produtoNome: produto.nome,
          variacao: entrada.variacaoId ?? null,
          variacaoDescricao: variacao ? descreverVariacao(variacao) : null,
          tipo: entrada.tipo,
          quantidade: entrada.tipo === 'ajuste' ? Math.abs(delta) : quantidade,
          estoqueAnterior: anterior,
          estoqueNovo: variacao ? variacao.estoqueAtual : produto.estoqueAtual,
          custoUnitario: entrada.custoUnitario ?? produto.precoCompra,
          venda: entrada.vendaId ?? null,
          /**
           * Só na entrada. Numa saída ou venda o campo não teria
           * sentido — a peça não voltou para o fornecedor —, e gravá-lo
           * ali sujaria o cálculo de quanto foi comprado de cada um.
           */
          fornecedor:
            entrada.tipo === 'entrada' ? (entrada.fornecedorId ?? null) : null,
          motivo: entrada.motivo ?? null,
        },
      ],
      { session, ordered: true },
    );

    await this.notificacoes.avaliarEstoque(produto, session);

    return produto;
  }

  /**
   * Apaga o histórico de um produto excluído.
   *
   * Só é chamado quando o produto some de vez — o que a API só permite
   * para produto que nunca foi vendido. Sem isto, as movimentações
   * ficariam apontando para um produto inexistente e engordando a
   * coleção sem servir para nada.
   */
  async removerHistoricoDoProduto(produtoId: string) {
    await this.movimentacoes.deleteMany({ produto: produtoId }).exec();
  }

  historico(produtoId: string, limite = 50) {
    return this.movimentacoes
      .find({ produto: produtoId })
      .sort({ criadoEm: -1 })
      .limit(limite)
      .exec();
  }

  /** Últimas movimentações de todos os produtos — o "extrato" do estoque. */
  historicoGeral(limite = 100) {
    return this.movimentacoes
      .find()
      .sort({ criadoEm: -1 })
      .limit(limite)
      .exec();
  }

  /** No mínimo ou zerados: a lista de compras da loja. */
  async emFalta() {
    return this.produtos
      .find({
        ativo: true,
        controlaEstoque: true,
        $expr: { $lte: ['$estoqueAtual', '$estoqueMinimo'] },
      })
      .sort({ estoqueAtual: 1, nome: 1 })
      .populate('categoria', 'nome cor icone')
      .exec();
  }

  /** Quanto dinheiro está parado em mercadoria, a preço de custo. */
  async valorDoEstoque() {
    const [r] = await this.produtos.aggregate<{
      valorCusto: number;
      valorVenda: number;
      itens: number;
    }>([
      { $match: { ativo: true, controlaEstoque: true } },
      {
        $group: {
          _id: null,
          valorCusto: {
            $sum: { $multiply: ['$estoqueAtual', '$precoCompra'] },
          },
          valorVenda: {
            $sum: { $multiply: ['$estoqueAtual', '$precoVenda'] },
          },
          itens: { $sum: '$estoqueAtual' },
        },
      },
    ]);

    return {
      valorCusto: arredondar(r?.valorCusto ?? 0),
      valorVenda: arredondar(r?.valorVenda ?? 0),
      lucroPotencial: arredondar((r?.valorVenda ?? 0) - (r?.valorCusto ?? 0)),
      itens: r?.itens ?? 0,
    };
  }
}

function arredondar(n: number) {
  return Math.round(n * 100) / 100;
}

/** "44 · Preto" — mesmo rótulo do virtual da variação. */
function descreverVariacao(v: Variacao): string {
  return [v.tamanho, v.cor].filter(Boolean).join(' · ') || 'Padrão';
}
