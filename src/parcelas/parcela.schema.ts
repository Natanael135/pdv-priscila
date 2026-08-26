import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';
import { opcoesSchema } from '../common/schema-options';
import { FORMAS_PAGAMENTO } from '../vendas/venda.schema';
import type { FormaPagamento } from '../vendas/venda.schema';

export type ParcelaDocument = HydratedDocument<Parcela>;

export const TIPOS_EVENTO = ['criada', 'adiada', 'recebimento'] as const;
export type TipoEventoParcela = (typeof TIPOS_EVENTO)[number];

/**
 * Um acontecimento na vida da parcela.
 *
 * Existe por causa do adiamento: antes, empurrar o vencimento
 * sobrescrevia a data e o combinado anterior sumia. Numa conversa de
 * cobrança é justamente isso que se discute — "mas você disse que
 * pagaria dia 10" — e sem registro a loja não tem como sustentar.
 *
 * Os recebimentos parciais entram aqui pelo mesmo motivo: `valorPago`
 * guarda o total, não quando cada pedaço entrou.
 */
@Schema({ _id: false })
export class EventoParcela {
  @Prop({ type: String, required: true, enum: TIPOS_EVENTO })
  tipo: TipoEventoParcela;

  @Prop({ type: Date, default: Date.now })
  em: Date;

  /** adiamento: de onde saiu */
  @Prop({ type: Date, default: null })
  vencimentoAnterior: Date | null;

  /** adiamento: para onde foi (e a data inicial, no evento 'criada') */
  @Prop({ type: Date, default: null })
  vencimentoNovo: Date | null;

  /** recebimento: quanto entrou nesta vez */
  @Prop({ type: Number, default: null })
  valor: number | null;

  /** recebimento: quanto ainda faltava depois dele */
  @Prop({ type: Number, default: null })
  saldoDepois: number | null;

  @Prop({ type: String, default: null })
  observacao: string | null;
}

export const EventoParcelaSchema = SchemaFactory.createForClass(EventoParcela);

/**
 * Conta a receber: fiado e crédito parcelado.
 *
 * Fica em coleção própria, não embutida na venda, porque a pergunta que
 * mais importa é "quem está me devendo hoje?" — uma busca por data de
 * vencimento atravessando todas as vendas. Embutido, isso viraria um
 * $unwind em cima da coleção inteira toda vez que a tela abrisse.
 */
@Schema(opcoesSchema)
export class Parcela {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Venda', required: true })
  venda: Types.ObjectId;

  @Prop({ required: true })
  vendaNumero: number;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Cliente', default: null })
  cliente: Types.ObjectId | null;

  @Prop({ type: String, default: null })
  clienteNome: string | null;

  @Prop({ type: String, default: null })
  clienteTelefone: string | null;

  /** de onde veio a dívida: 'fiado' (cliente deve) ou 'credito' (maquininha) */
  @Prop({ type: String, required: true, enum: FORMAS_PAGAMENTO })
  forma: FormaPagamento;

  @Prop({ default: 1 })
  numero: number;

  @Prop({ default: 1 })
  totalParcelas: number;

  @Prop({ required: true, min: 0 })
  valor: number;

  @Prop({ required: true })
  vencimento: Date;

  /**
   * O primeiro vencimento combinado, que nunca muda.
   *
   * Dá para deduzir do histórico, mas ter o campo direto deixa a lista
   * de cobranças mostrar "vencia 10/08" sem carregar o histórico
   * inteiro de toda parcela na tela.
   */
  @Prop({ type: Date, default: null })
  vencimentoOriginal: Date | null;

  @Prop({ type: [EventoParcelaSchema], default: [] })
  historico: EventoParcela[];

  @Prop({ default: 0 })
  valorPago: number;

  @Prop({ default: false })
  pago: boolean;

  @Prop({ type: Date, default: null })
  pagoEm: Date | null;
}

export const ParcelaSchema = SchemaFactory.createForClass(Parcela);

ParcelaSchema.index({ pago: 1, vencimento: 1 });
ParcelaSchema.index({ cliente: 1, pago: 1 });
ParcelaSchema.index({ venda: 1 });

/** Quanto ainda falta receber desta parcela. */
ParcelaSchema.virtual('saldo').get(function (this: Parcela) {
  return Math.round((this.valor - this.valorPago) * 100) / 100;
});

/** Já venceu e ainda não foi pago. */
ParcelaSchema.virtual('vencida').get(function (this: Parcela) {
  return !this.pago && this.vencimento < new Date();
});

/** Quantas vezes esta cobrança já foi empurrada. */
ParcelaSchema.virtual('vezesAdiada').get(function (this: Parcela) {
  return (this.historico ?? []).filter((e) => e.tipo === 'adiada').length;
});

/** Dias de atraso (0 quando ainda está no prazo). */
ParcelaSchema.virtual('diasAtraso').get(function (this: Parcela) {
  if (this.pago) return 0;
  const dias = Math.floor(
    (Date.now() - this.vencimento.getTime()) / (1000 * 60 * 60 * 24),
  );
  return dias > 0 ? dias : 0;
});
