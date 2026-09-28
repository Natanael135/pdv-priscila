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

  /**
   * A parte deste valor que é acréscimo do cartão ou do fiado, numa
   * venda que mistura formas: dos 84,21 no cartão, 4,21 são a taxa sobre
   * os 80 que faltavam à vista.
   *
   * Fica no pagamento, e não só na venda, porque é dele: se a peça volta
   * e o cartão é estornado, o acréscimo sai junto com o estorno — e não
   * sobra cobrando de quem pagou o resto em dinheiro.
   */
  @Prop({ default: 0, min: 0 })
  acrescimo: number;
}

export const PagamentoSchema = SchemaFactory.createForClass(Pagamento);

/** Peça que saiu de uma venda já fechada e voltou para o estoque. */
@Schema({ _id: false })
export class ItemDevolvido {
  @Prop({ required: true })
  produtoNome: string;

  @Prop({ type: String, default: null })
  variacaoDescricao: string | null;

  @Prop({ required: true, min: 0 })
  quantidade: number;

  /** quanto aquelas peças valiam na venda, já com o desconto da linha */
  @Prop({ required: true, min: 0 })
  valor: number;
}

export const ItemDevolvidoSchema = SchemaFactory.createForClass(ItemDevolvido);

/** Dinheiro que já tinha entrado e voltou para o cliente numa alteração. */
@Schema({ _id: false })
export class DevolucaoDeValor {
  @Prop({ type: String, required: true, enum: FORMAS_PAGAMENTO })
  forma: FormaPagamento;

  @Prop({ required: true, min: 0 })
  valor: number;
}

export const DevolucaoDeValorSchema =
  SchemaFactory.createForClass(DevolucaoDeValor);

/**
 * Uma alteração feita depois de a venda fechar: peça devolvida ou
 * desconto dado depois.
 *
 * A venda é corrigida no lugar — itens, totais e pagamentos passam a
 * dizer o que de fato ficou, que é o que o faturamento e o comprovante
 * precisam. Este registro guarda o antes e o porquê: sem ele, a venda
 * editada seria indistinguível da original, e a pergunta "essa venda
 * não era de 200?" ficaria sem resposta.
 */
@Schema({ _id: false })
export class EdicaoVenda {
  @Prop({ default: () => new Date() })
  em: Date;

  @Prop({ required: true })
  totalAnterior: number;

  @Prop({ required: true })
  totalNovo: number;

  @Prop({ default: 0 })
  descontoAnterior: number;

  @Prop({ default: 0 })
  descontoNovo: number;

  /** o acréscimo do cartão/fiado encolhe junto com as peças que saem */
  @Prop({ default: 0 })
  acrescimoAnterior: number;

  @Prop({ default: 0 })
  acrescimoNovo: number;

  @Prop({ type: [ItemDevolvidoSchema], default: [] })
  itensDevolvidos: ItemDevolvido[];

  /** quanto saiu da dívida do fiado — não precisou voltar dinheiro */
  @Prop({ default: 0 })
  abatidoDoFiado: number;

  /** o que já tinha sido pago e voltou para o cliente, por forma */
  @Prop({ type: [DevolucaoDeValorSchema], default: [] })
  devolucoes: DevolucaoDeValor[];

  @Prop({ type: String, default: null })
  motivo: string | null;
}

export const EdicaoVendaSchema = SchemaFactory.createForClass(EdicaoVenda);

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

  /**
   * O que a parte paga no cartão ou no fiado somou ao preço à vista,
   * quando a venda mistura formas: 300 em dinheiro e o resto no cartão.
   * É a soma do acréscimo de cada pagamento.
   *
   * Os itens ficam no preço à vista e esta é a linha que a cliente vê no
   * comprovante. Cartão inteiro não usa isto — lá os itens já vão no
   * preço de cartão, como sempre foi.
   */
  @Prop({ default: 0, min: 0 })
  acrescimo: number;

  /** subtotal − desconto + acréscimo */
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

  /** alterações depois de fechada, da mais antiga para a mais nova */
  @Prop({ type: [EdicaoVendaSchema], default: [] })
  edicoes: EdicaoVenda[];
}

export const VendaSchema = SchemaFactory.createForClass(Venda);

VendaSchema.index({ data: -1 });
VendaSchema.index({ cliente: 1, data: -1 });
VendaSchema.index({ status: 1, data: -1 });

// Mongoose 9: pre-hook sem `next`, só async/return.
VendaSchema.pre('save', function () {
  this.lucro = dinheiro(this.total - this.custoTotal);
});
