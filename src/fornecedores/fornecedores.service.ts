import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, QueryFilter, Types } from 'mongoose';
import { dinheiro } from '../common/margem';
import { Movimentacao } from '../estoque/movimentacao.schema';
import { Produto } from '../produtos/produto.schema';
import { Fornecedor, FornecedorDocument } from './fornecedor.schema';
import {
  AtualizarFornecedorDto,
  CriarFornecedorDto,
} from './fornecedores.dto';

@Injectable()
export class FornecedoresService {
  constructor(
    @InjectModel(Fornecedor.name)
    private readonly modelo: Model<FornecedorDocument>,
    @InjectModel(Produto.name) private readonly produtos: Model<Produto>,
    @InjectModel(Movimentacao.name)
    private readonly movimentacoes: Model<Movimentacao>,
  ) {}

  async listar(busca?: string, incluirInativos = false) {
    const query: QueryFilter<FornecedorDocument> = {};

    if (!incluirInativos) query.ativo = true;

    if (busca?.trim()) {
      const termo = escapar(busca.trim());
      query.$or = [
        { nome: new RegExp(termo, 'i') },
        { contato: new RegExp(termo, 'i') },
        { documento: new RegExp(termo, 'i') },
      ];
    }

    const lista = await this.modelo.find(query).sort({ nome: 1 }).exec();

    /**
     * Quantos produtos cada um fornece.
     *
     * Vem junto na listagem de propósito: é o número que diferencia o
     * fornecedor de verdade daquele cadastrado uma vez e nunca mais
     * usado, e buscar isso tela a tela seria uma consulta por linha.
     */
    const contagem = await this.produtos.aggregate<{
      _id: Types.ObjectId;
      total: number;
    }>([
      { $match: { fornecedor: { $ne: null }, ativo: true } },
      { $group: { _id: '$fornecedor', total: { $sum: 1 } } },
    ]);

    const porFornecedor = new Map(contagem.map((c) => [String(c._id), c.total]));

    return lista.map((f) => ({
      ...f.toJSON(),
      produtos: porFornecedor.get(String(f._id)) ?? 0,
    }));
  }

  async obter(id: string) {
    const fornecedor = await this.modelo.findById(id).exec();
    if (!fornecedor) throw new NotFoundException('Fornecedor não encontrado');
    return fornecedor;
  }

  criar(dto: CriarFornecedorDto) {
    return this.modelo.create(dto);
  }

  async atualizar(id: string, dto: AtualizarFornecedorDto) {
    const doc = await this.modelo
      .findByIdAndUpdate(id, dto, { returnDocument: 'after' })
      .exec();

    if (!doc) throw new NotFoundException('Fornecedor não encontrado');
    return doc;
  }

  async desativar(id: string) {
    return this.atualizar(id, { ativo: false });
  }

  /**
   * Exclusão definitiva — barrada se algum produto ainda aponta para ele.
   *
   * O produto guarda o id, não o nome. Apagar o fornecedor deixaria a
   * ficha do produto dizendo "comprado de" um cadastro que não existe,
   * e a pergunta "onde eu compro isso?" ficaria sem resposta bem na
   * hora de repor.
   */
  async excluir(id: string) {
    const usos = await this.produtos
      .countDocuments({ fornecedor: new Types.ObjectId(id) })
      .exec();

    if (usos > 0) {
      throw new BadRequestException(
        `${usos} produto${usos > 1 ? 's estão ligados' : ' está ligado'} a este ` +
          'fornecedor. Desative em vez de excluir, ou troque o fornecedor deles antes.',
      );
    }

    const doc = await this.modelo.findByIdAndDelete(id).exec();
    if (!doc) throw new NotFoundException('Fornecedor não encontrado');
  }

  /**
   * A ficha do fornecedor: o que se compra dele e quanto já se gastou.
   *
   * O gasto sai das ENTRADAS de estoque, não de um campo digitado: cada
   * reposição já registra quantidade e custo unitário, então o total é
   * consequência do que de fato entrou na loja — e não de alguém
   * lembrar de somar.
   */
  async ficha(id: string) {
    const fornecedor = await this.obter(id);

    const produtos = await this.produtos
      .find({ fornecedor: fornecedor._id })
      .sort({ nome: 1 })
      .exec();

    const idsDosProdutos = produtos.map(
      (p) => (p as unknown as { _id: Types.ObjectId })._id,
    );

    /**
     * Entradas ligadas ao fornecedor.
     *
     * Prioriza o campo gravado na própria movimentação: se a peça foi
     * comprada deste fornecedor naquela vez, é isso que vale, mesmo que
     * o produto tenha trocado de fornecedor depois. Sem esse campo, cai
     * nos produtos que hoje pertencem a ele — aproximação para o que
     * foi registrado antes deste cadastro existir.
     */
    const entradas = await this.movimentacoes
      .find({
        tipo: 'entrada',
        $or: [
          { fornecedor: fornecedor._id },
          {
            fornecedor: null,
            produto: { $in: idsDosProdutos },
          },
        ],
      })
      .sort({ criadoEm: -1 })
      .limit(100)
      .exec();

    const totalComprado = entradas.reduce(
      (s, m) => s + m.quantidade * (m.custoUnitario ?? 0),
      0,
    );

    const pecas = entradas.reduce((s, m) => s + m.quantidade, 0);

    return {
      fornecedor: fornecedor.toJSON(),
      produtos: produtos.map((p) => p.toJSON()),
      compras: {
        total: dinheiro(totalComprado),
        pecas,
        entradas: entradas.length,
        ultima: entradas[0]
          ? (entradas[0] as unknown as { criadoEm: Date }).criadoEm
          : null,
      },
      entradas: entradas.slice(0, 30).map((m) => m.toJSON()),
    };
  }
}

function escapar(texto: string) {
  return texto.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
