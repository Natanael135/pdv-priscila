import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';
import { dinheiro } from '../common/margem';
import { TABELAS_DE_PRECO } from '../common/precos';
import type { TabelaDePreco } from '../common/precos';
import { opcoesSchema } from '../common/schema-options';

export type VendaDocument = HydratedDocument<Venda>;

export const FORMAS_PAGAMENTO = [
  'dinheiro',
  'pix',
  'debito',
  'credito',
  'transferencia',
  'fiado',
] as const;

export type FormaPagamento = (typeof FORMAS_PAGAMENTO)[number];

/**
 * Item da venda. Fica embutido no documento da venda porque nunca é
 * lido sozinho — quem abre um item quer a venda inteira.
 *
 * produtoNome, precoUnitario e custoUnitario são FOTOGRAFIA do momento
 * da venda. Se o preço do produto mudar amanhã, o faturamento e o lucro
 * de ontem continuam os mesmos. Sem isso, o histórico se reescreve
 * sozinho a cada reajuste.
 */
@Schema({ _id: false })
export class VendaItem {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Produto', default: null })
  produto: Types.ObjectId | null;

  @Prop({ required: true })
  produtoNome: string;

  /** id da variação vendida, quando o produto tem grade */
  @Prop({ type: String, default: null })
  variacao: string | null;

  /** "44 · Preto" — fotografado, para o cupom antigo continuar legível */
  @Prop({ type: String, default: null })
  variacaoDescricao: string | null;

  @Prop({ required: true, min: 0 })
  quantidade: number;

  @Prop({ required: true, min: 0 })
  precoUnitario: number;

  @Prop({ required: true, default: 0, min: 0 })
  custoUnitario: number;

  @Prop({ default: 0, min: 0 })
  desconto: number;

  /** quantidade * precoUnitario - desconto */
  @Prop({ required: true })
  total: number;
}

export const VendaItemSchema = SchemaFactory.createForClass(VendaItem);

/**
 * Pagamento da venda. São vários por venda de propósito: é isto que
 * permite "50 no Pix e 50 no crédito" — duas entradas na lista.
 */
@Schema({ _id: true })
export class Pagamento {
  @Prop({ type: String, required: true, enum: FORMAS_PAGAMENTO })
  forma: FormaPagamento;

  @Prop({ required: true, min: 0 })
  valor: number;

  @Prop({ default: 1, min: 1 })
  parcelas: number;
}

export const PagamentoSchema = SchemaFactory.createForClass(Pagamento);

export const ORIGENS_VENDA = ['balcao', 'catalogo'] as const;
export type OrigemVenda = (typeof ORIGENS_VENDA)[number];

@Schema(opcoesSchema)
export class Venda {
  /** nº do cupom, sequencial e amigável (vem do ContadorService) */
  @Prop({ required: true, unique: true })
  numero: number;

  /**
   * De onde a venda veio.
   *
   * Antes isso só existia como texto na observação ("Pedido #12 do
   * catálogo"), o que serve para ler mas não para filtrar nem somar.
   * Como campo, dá para responder "quanto o site me trouxe este mês?".
   */
  @Prop({ type: String, default: 'balcao', enum: ORIGENS_VENDA })
  origem: OrigemVenda;

  /** pedido que originou esta venda; null nas vendas de balcão */
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Pedido', default: null })
  pedido: Types.ObjectId | null;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Cliente', default: null })
  cliente: Types.ObjectId | null;

  /** guardado junto para a lista não depender de popular o cliente */
  @Prop({ type: String, default: null })
  clienteNome: string | null;

  @Prop({ default: () => new Date() })
  data: Date;

  @Prop({ type: [VendaItemSchema], default: [] })
  itens: VendaItem[];

  @Prop({ type: [PagamentoSchema], default: [] })
  pagamentos: Pagamento[];

  /** soma dos itens, já com o desconto de cada item */
  @Prop({ default: 0 })
  subtotal: number;

  /**
   * Por qual tabela esta venda foi fechada.
   *
   * Fica gravado junto porque o preço do item é fotografia: sem a
   * tabela, olhando a venda de ontem não dá para saber se aqueles R$ 55
   * eram o preço de crédito ou um reajuste que aconteceu depois.
   */
  @Prop({ type: String, default: 'avista', enum: TABELAS_DE_PRECO })
  tabelaPreco: TabelaDePreco;

  /** desconto aplicado no total da venda, em R$ */
  @Prop({ default: 0 })
  desconto: number;

  @Prop({ default: 0 })
  total: number;

  /** custo das mercadorias que saíram */
  @Prop({ default: 0 })
  custoTotal: number;

  /** total - custoTotal (o desconto sai do lucro, como na vida real) */
  @Prop({ default: 0 })
  lucro: number;

  @Prop({ type: String, default: 'concluida', enum: ['concluida', 'cancelada'] })
  status: 'concluida' | 'cancelada';

  /** pago = quitado no ato | parcial = entrada + resto | fiado = tudo a prazo */
  @Prop({ type: String, default: 'pago', enum: ['pago', 'parcial', 'fiado'] })
  situacao: 'pago' | 'parcial' | 'fiado';

  @Prop({ type: String, default: null })
  observacao: string | null;

  @Prop({ type: Date, default: null })
  canceladaEm: Date | null;

  @Prop({ type: String, default: null })
  motivoCancelamento: string | null;
}

export const VendaSchema = SchemaFactory.createForClass(Venda);

VendaSchema.index({ data: -1 });
VendaSchema.index({ cliente: 1, data: -1 });
VendaSchema.index({ status: 1, data: -1 });

// Mongoose 9: pre-hook sem `next`, só async/return.
VendaSchema.pre('save', function () {
  this.lucro = dinheiro(this.total - this.custoTotal);
});
