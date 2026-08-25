import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model, Types } from 'mongoose';
import { NotificacoesService } from '../notificacoes/notificacoes.service';
import { Produto, ProdutoDocument } from '../produtos/produto.schema';
import {
  Movimentacao,
  MovimentacaoDocument,
  TipoMovimentacao,
} from './movimentacao.schema';

export interface EntradaMovimentacao {
  produtoId: string | Types.ObjectId;
  tipo: TipoMovimentacao;
  /** 'ajuste' -> contagem nova; demais -> quanto entrou/saiu */
  quantidade: number;
  custoUnitario?: number | null;
  motivo?: string | null;
  vendaId?: Types.ObjectId | null;
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

    const anterior = produto.estoqueAtual;
    const quantidade = Math.abs(Number(entrada.quantidade));

    const delta =
      entrada.tipo === 'ajuste'
        ? Number(entrada.quantidade) - anterior
        : entrada.tipo === 'entrada' || entrada.tipo === 'cancelamento'
          ? quantidade
          : -quantidade;

    const atualizado = await this.produtos
      .findByIdAndUpdate(
        produto._id,
        { $inc: { estoqueAtual: delta } },
        { new: true, session },
      )
      .exec();

    await this.movimentacoes.create(
      [
        {
          produto: produto._id,
          produtoNome: produto.nome,
          tipo: entrada.tipo,
          quantidade: entrada.tipo === 'ajuste' ? Math.abs(delta) : quantidade,
          estoqueAnterior: anterior,
          estoqueNovo: atualizado!.estoqueAtual,
          custoUnitario: entrada.custoUnitario ?? produto.precoCompra,
          venda: entrada.vendaId ?? null,
          motivo: entrada.motivo ?? null,
        },
      ],
      { session, ordered: true },
    );

    await this.notificacoes.avaliarEstoque(atualizado!, session);

    return atualizado!;
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
