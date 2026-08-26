import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';
import { opcoesSchema } from '../common/schema-options';

export type GastoDocument = HydratedDocument<Gasto>;
export type GastoRecorrenteDocument = HydratedDocument<GastoRecorrente>;

export const CATEGORIAS_GASTO = [
  'aluguel',
  'energia',
  'agua',
  'internet',
  'telefone',
  'salario',
  'imposto',
  'transporte',
  'marketing',
  'mercadoria',
  'outros',
] as const;

export type CategoriaGasto = (typeof CATEGORIAS_GASTO)[number];

/**
 * Um gasto que se repete todo mês: aluguel, luz, internet.
 *
 * É um MOLDE, não uma despesa. Guardá-lo como se fosse um gasto único
 * levaria a duas escolhas ruins: ou o aluguel apareceria uma vez só e
 * sumiria do mês seguinte, ou seria preciso cadastrar doze aluguéis por
 * ano na mão. O molde gera o lançamento de cada mês (ver
 * GastosService.gerarDoMes).
 */
@Schema(opcoesSchema)
export class GastoRecorrente {
  @Prop({ required: true, trim: true })
  descricao: string;

  @Prop({ type: String, required: true, enum: CATEGORIAS_GASTO })
  categoria: CategoriaGasto;

  /** valor previsto; o lançamento do mês pode ser corrigido depois */
  @Prop({ required: true, min: 0 })
  valor: number;

  /**
   * Dia do mês em que vence.
   *
   * Limitado a 28 de propósito: dia 30 não existe em fevereiro, e um
   * vencimento que some num mês do ano é pior do que um que cai sempre
   * um pouco antes.
   */
  @Prop({ required: true, min: 1, max: 28 })
  diaDoMes: number;

  @Prop({ default: true })
  ativo: boolean;

  @Prop({ type: String, default: null })
  observacao: string | null;
}

export const GastoRecorrenteSchema =
  SchemaFactory.createForClass(GastoRecorrente);

/**
 * Uma despesa lançada, com data e valor de verdade.
 *
 * Vem do molde recorrente ou é avulsa (a conta do conserto da máquina).
 * É este documento que o dashboard desconta do lucro — o molde sozinho
 * não é dinheiro que saiu.
 */
@Schema(opcoesSchema)
export class Gasto {
  @Prop({ required: true, trim: true })
  descricao: string;

  @Prop({ type: String, required: true, enum: CATEGORIAS_GASTO })
  categoria: CategoriaGasto;

  @Prop({ required: true, min: 0 })
  valor: number;

  /** data de competência: a que decide em qual mês ele pesa */
  @Prop({ required: true })
  data: Date;

  @Prop({ default: false })
  pago: boolean;

  @Prop({ type: Date, default: null })
  pagoEm: Date | null;

  /** de qual molde veio; null = gasto avulso */
  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: 'GastoRecorrente',
    default: null,
  })
  recorrente: Types.ObjectId | null;

  /**
   * Mês de competência (AAAA-MM) quando vem de um molde.
   *
   * É a trava contra duplicar: gerar o mês duas vezes tem de resultar
   * no mesmo lançamento, não em dois aluguéis. Ver o índice abaixo.
   */
  @Prop({ type: String, default: null })
  referencia: string | null;

  @Prop({ type: String, default: null })
  observacao: string | null;
}

export const GastoSchema = SchemaFactory.createForClass(Gasto);

GastoSchema.index({ data: -1 });
GastoSchema.index({ categoria: 1, data: -1 });

/**
 * Um lançamento por molde por mês.
 *
 * Parcial porque só vale para o que veio de molde: gasto avulso pode
 * repetir à vontade (dois fretes no mesmo dia são dois fretes).
 */
GastoSchema.index(
  { recorrente: 1, referencia: 1 },
  {
    unique: true,
    partialFilterExpression: {
      recorrente: { $type: 'objectId' },
      referencia: { $type: 'string' },
    },
  },
);

/** Já venceu e ainda não foi pago. */
GastoSchema.virtual('vencido').get(function (this: Gasto) {
  return !this.pago && this.data < new Date();
});
