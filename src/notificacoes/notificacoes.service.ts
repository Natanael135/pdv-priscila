import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model, Types } from 'mongoose';
import { Produto } from '../produtos/produto.schema';
import { Notificacao, NotificacaoDocument } from './notificacao.schema';

@Injectable()
export class NotificacoesService {
  constructor(
    @InjectModel(Notificacao.name)
    private readonly modelo: Model<NotificacaoDocument>,
  ) {}

  listar(incluirLidas = false) {
    const filtro = incluirLidas ? {} : { lida: false };
    return this.modelo.find(filtro).sort({ criadoEm: -1 }).limit(100).exec();
  }

  async contarNaoLidas() {
    return this.modelo.countDocuments({ lida: false }).exec();
  }

  async marcarComoLida(id: string) {
    const doc = await this.modelo
      .findByIdAndUpdate(id, { lida: true }, { new: true })
      .exec();

    if (!doc) throw new NotFoundException('Notificação não encontrada');
    return doc;
  }

  async marcarTodasComoLidas() {
    const r = await this.modelo
      .updateMany({ lida: false }, { lida: true })
      .exec();
    return { atualizadas: r.modifiedCount };
  }

  async excluir(id: string) {
    const doc = await this.modelo.findByIdAndDelete(id).exec();
    if (!doc) throw new NotFoundException('Notificação não encontrada');
  }

  /**
   * Reavalia os avisos de um produto depois que o estoque mexeu.
   *
   * Chamada por quem move estoque (venda, entrada, ajuste). Cuida dos
   * três casos: repôs e o aviso some, acabou e vira "esgotado", está no
   * limite e vira "estoque baixo".
   */
  async avaliarEstoque(produto: Produto & { _id: Types.ObjectId }, session?: ClientSession) {
    if (!produto.controlaEstoque) return;

    const produtoId = produto._id;

    // repôs: os avisos pendentes perdem a razão de existir
    if (produto.estoqueAtual > produto.estoqueMinimo) {
      await this.modelo
        .deleteMany({
          produto: produtoId,
          tipo: { $in: ['estoque_baixo', 'sem_estoque'] },
          lida: false,
        })
        .session(session ?? null)
        .exec();
      return;
    }

    const tipo = produto.estoqueAtual <= 0 ? 'sem_estoque' : 'estoque_baixo';

    // ao zerar, o aviso de "baixo" fica desatualizado
    await this.modelo
      .deleteMany({
        produto: produtoId,
        tipo: { $in: ['estoque_baixo', 'sem_estoque'], $ne: tipo },
        lida: false,
      })
      .session(session ?? null)
      .exec();

    const quantidade = formatarQuantidade(produto.estoqueAtual);
    const minimo = formatarQuantidade(produto.estoqueMinimo);

    // upsert: se o aviso já existe, só atualiza o texto com o número novo
    await this.modelo
      .findOneAndUpdate(
        { produto: produtoId, tipo, lida: false },
        {
          $set: {
            tipo,
            titulo: tipo === 'sem_estoque' ? 'Produto esgotado' : 'Estoque baixo',
            mensagem:
              tipo === 'sem_estoque'
                ? `${produto.nome} acabou. Hora de repor.`
                : `${produto.nome} está com ${quantidade} ${produto.unidade} ` +
                  `(mínimo ${minimo}).`,
            produto: produtoId,
            lida: false,
          },
        },
        { upsert: true, session },
      )
      .exec();
  }

  /** Cria (ou atualiza) o aviso de fiado atrasado de um cliente. */
  async avisarFiadoVencido(params: {
    clienteId: Types.ObjectId;
    clienteNome: string;
    total: number;
    diasAtraso: number;
  }) {
    const valor = params.total.toLocaleString('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    });

    await this.modelo
      .findOneAndUpdate(
        { cliente: params.clienteId, tipo: 'fiado_vencido', lida: false },
        {
          $set: {
            tipo: 'fiado_vencido',
            titulo: 'Fiado vencido',
            mensagem:
              `${params.clienteNome} está com ${valor} em atraso há ` +
              `${params.diasAtraso} dia${params.diasAtraso > 1 ? 's' : ''}.`,
            cliente: params.clienteId,
            lida: false,
          },
        },
        { upsert: true },
      )
      .exec();
  }

  /** Some com o aviso quando o cliente quita o que devia. */
  async limparAvisoDeFiado(clienteId: Types.ObjectId) {
    await this.modelo
      .deleteMany({ cliente: clienteId, tipo: 'fiado_vencido', lida: false })
      .exec();
  }
}

function formatarQuantidade(n: number): string {
  return Number.isInteger(n)
    ? String(n)
    : String(Number(n.toFixed(3))).replace('.', ',');
}
