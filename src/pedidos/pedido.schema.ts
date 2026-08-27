import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';
import { opcoesSchema } from '../common/schema-options';

export type PedidoDocument = HydratedDocument<Pedido>;

export const TIPOS_ENTREGA = ['retirada', 'entrega'] as const;
export type TipoEntrega = (typeof TIPOS_ENTREGA)[number];

/**
 * Como o cliente PRETENDE pagar.
 *
 * É uma declaração de intenção, não um pagamento: quem registra o
 * dinheiro de verdade é a loja, ao fechar a venda. Serve para a loja
 * já levar a maquininha na entrega, ou mandar a chave Pix antes.
 */
export const FORMAS_PAGAMENTO_PEDIDO = [
  'pix',
  'dinheiro',
  'credito',
  'debito',
] as const;

export type FormaPagamentoPedido = (typeof FORMAS_PAGAMENTO_PEDIDO)[number];

/**
 * A vida de um pedido, na ordem em que acontece.
 *
 * Os estados do meio existem para o cliente: sem eles, o pedido some
 * entre "aceito" e "concluído" e a pessoa fica sem saber se a loja
 * esqueceu. "Saiu para entrega" e "pronto para retirada" são o mesmo
 * degrau — qual deles vale depende de como o pedido foi feito.
 */
export const STATUS_PEDIDO = [
  'novo',
  'aceito',
  'preparando',
  'saiu_entrega',
  'pronto_retirada',
  'concluido',
  'recusado',
  'cancelado',
] as const;

export type StatusPedido = (typeof STATUS_PEDIDO)[number];

/** Como cada estado é dito em português — usado em mensagem de erro. */
export const ROTULO_STATUS: Record<StatusPedido, string> = {
  novo: 'novo',
  aceito: 'aceito',
  preparando: 'em preparação',
  saiu_entrega: 'a caminho',
  pronto_retirada: 'pronto para retirada',
  concluido: 'concluído',
  recusado: 'recusado',
  cancelado: 'cancelado',
};

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

  @Prop({ type: String, required: true, enum: TIPOS_ENTREGA, default: 'retirada' })
  entrega: TipoEntrega;

  /**
   * Endereço da entrega — obrigatório quando não é retirada.
   *
   * Texto livre, e não campos separados, de propósito: aqui quem
   * digita é o cliente no celular, e um formulário de CEP, número e
   * complemento faz gente desistir no meio. A loja lê e liga se ficar
   * confuso.
   */
  @Prop({ type: String, default: null })
  endereco: string | null;

  @Prop({
    type: String,
    required: true,
    enum: FORMAS_PAGAMENTO_PEDIDO,
    default: 'pix',
  })
  formaPagamento: FormaPagamentoPedido;

  /**
   * "Preciso de troco para R$ 100" — só faz sentido em dinheiro.
   *
   * Sem isto a loja sai para entregar sem trocado e descobre na porta
   * do cliente.
   */
  @Prop({ type: Number, default: null })
  trocoPara: number | null;

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

/**
 * Para onde este pedido pode ir a partir de onde está.
 *
 * Fica no schema, junto do próprio estado, para a regra não se
 * espalhar: a tela do lojista desenha os botões a partir daqui, e o
 * service valida contra a mesma lista. Duas cópias divergiriam.
 */
/**
 * Exposto no JSON para a tela do lojista não repetir a regra.
 *
 * Virtual em vez de campo: é derivado do estado atual, e gravá-lo
 * criaria a chance de ficar desatualizado em relação a ele.
 */
PedidoSchema.virtual('proximos').get(function (this: Pedido) {
  return proximosEstados(this);
});

export function proximosEstados(pedido: {
  status: StatusPedido;
  entrega: TipoEntrega;
}): StatusPedido[] {
  const entregar = pedido.entrega === 'entrega';

  switch (pedido.status) {
    case 'novo':
      return ['aceito', 'recusado'];
    case 'aceito':
      return ['preparando', 'cancelado'];
    case 'preparando':
      return [entregar ? 'saiu_entrega' : 'pronto_retirada', 'cancelado'];
    case 'saiu_entrega':
    case 'pronto_retirada':
      // 'concluido' não entra aqui: fechar vira VENDA, e isso passa
      // pelo endpoint próprio, com forma de pagamento
      return ['cancelado'];
    default:
      return [];
  }
}
