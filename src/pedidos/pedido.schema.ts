import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';
import { opcoesSchema } from '../common/schema-options';

export type PedidoDocument = HydratedDocument<Pedido>;

export const STATUS_PEDIDO = [
  'novo',
  'aceito',
  'recusado',
  'concluido',
  'cancelado',
] as const;

export type StatusPedido = (typeof STATUS_PEDIDO)[number];

/**
 * Item pedido pelo cliente.
 *
 * Nome, preço e variação ficam fotografados aqui, como na venda: o
 * produto pode mudar de preço entre o pedido e o atendimento, e o que
 * vale é o que o cliente viu na tela quando pediu.
 */
@Schema({ _id: false })
export class ItemPedido {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Produto', required: true })
  produto: Types.ObjectId;

  @Prop({ required: true })
  produtoNome: string;

  @Prop({ type: MongooseSchema.Types.ObjectId, default: null })
  variacao: Types.ObjectId | null;

  @Prop({ type: String, default: null })
  variacaoDescricao: string | null;

  @Prop({ required: true, min: 1 })
  quantidade: number;

  @Prop({ required: true, min: 0 })
  precoUnitario: number;

  @Prop({ required: true, min: 0 })
  total: number;
}

export const ItemPedidoSchema = SchemaFactory.createForClass(ItemPedido);

/**
 * Pedido feito pelo cliente no catálogo online.
 *
 * NÃO é uma venda, e a diferença importa: o pedido é um pedido de
 * reserva. Se ele já baixasse estoque e entrasse no faturamento, um
 * cliente indeciso — ou um trote — mexeria no saldo de mercadoria e no
 * lucro do dia. A venda nasce só quando a loja confirma, e é lá que o
 * estoque se move.
 *
 * O caminho é: novo → aceito → concluído (vira venda). Ou morre em
 * recusado/cancelado sem tocar em nada.
 */
@Schema(opcoesSchema)
export class Pedido {
  /** número curto para falar por WhatsApp: "seu pedido #12" */
  @Prop({ required: true, unique: true })
  numero: number;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Cliente', required: true })
  cliente: Types.ObjectId;

  @Prop({ required: true })
  clienteNome: string;

  @Prop({ type: String, default: null })
  clienteTelefone: string | null;

  /**
   * Sessão do navegador que fez o pedido.
   *
   * É por ela que o histórico do cliente é filtrado, e não pelo id do
   * cliente. Sem verificação do telefone, qualquer um poderia se
   * cadastrar com o número de outra pessoa e ler as compras dela; a
   * sessão prova que é o mesmo navegador, o que o telefone sozinho não
   * prova.
   */
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'SessaoPublica', required: true })
  sessao: Types.ObjectId;

  @Prop({ type: [ItemPedidoSchema], default: [] })
  itens: ItemPedido[];

  @Prop({ required: true, min: 0 })
  total: number;

  /** recado do cliente: ponto de referência, cor preferida, etc. */
  @Prop({ type: String, default: null })
  observacao: string | null;

  @Prop({ type: String, default: 'novo', enum: STATUS_PEDIDO })
  status: StatusPedido;

  /** preenchida quando o pedido vira venda de verdade */
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Venda', default: null })
  venda: Types.ObjectId | null;

  @Prop({ type: String, default: null })
  motivoRecusa: string | null;

  /**
   * Preenchido pelo `timestamps` do schema, não por @Prop.
   * Declarado só para o TypeScript enxergar o campo.
   */
  criadoEm: Date;

  /** quando a loja olhou o pedido — separa "não vi" de "vi e não respondi" */
  @Prop({ type: Date, default: null })
  vistoEm: Date | null;
}

export const PedidoSchema = SchemaFactory.createForClass(Pedido);

PedidoSchema.index({ status: 1, criadoEm: -1 });
PedidoSchema.index({ sessao: 1, criadoEm: -1 });
PedidoSchema.index({ cliente: 1, criadoEm: -1 });

/** Ainda esperando resposta da loja. */
PedidoSchema.virtual('pendente').get(function (this: Pedido) {
  return this.status === 'novo';
});
