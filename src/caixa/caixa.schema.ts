import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { opcoesSchema } from '../common/schema-options';

export type CaixaDocument = HydratedDocument<Caixa>;

/** Sangria (tirou dinheiro) ou suprimento (colocou troco). */
@Schema({ _id: true, timestamps: { createdAt: 'criadoEm', updatedAt: false } })
export class CaixaMovimento {
  @Prop({ type: String, required: true, enum: ['sangria', 'suprimento'] })
  tipo: 'sangria' | 'suprimento';

  @Prop({ required: true, min: 0 })
  valor: number;

  @Prop({ type: String, default: null })
  motivo: string | null;
}

export const CaixaMovimentoSchema = SchemaFactory.createForClass(CaixaMovimento);

@Schema(opcoesSchema)
export class Caixa {
  @Prop({ default: () => new Date() })
  abertoEm: Date;

  @Prop({ type: Date, default: null })
  fechadoEm: Date | null;

  @Prop({ default: 0 })
  valorAbertura: number;

  /** o que a pessoa contou na gaveta */
  @Prop({ type: Number, default: null })
  valorInformado: number | null;

  /** o que o sistema calculou que deveria ter */
  @Prop({ type: Number, default: null })
  valorEsperado: number | null;

  /** informado - esperado: negativo é quebra, positivo é sobra */
  @Prop({ type: Number, default: null })
  diferenca: number | null;

  @Prop({ type: String, default: 'aberto', enum: ['aberto', 'fechado'] })
  status: 'aberto' | 'fechado';

  @Prop({ type: [CaixaMovimentoSchema], default: [] })
  movimentos: CaixaMovimento[];

  @Prop({ type: String, default: null })
  observacao: string | null;
}

export const CaixaSchema = SchemaFactory.createForClass(Caixa);

/**
 * Só pode existir um caixa aberto por vez. O índice parcial faz o banco
 * garantir isso — se dois toques abrirem caixa ao mesmo tempo, o segundo
 * falha em vez de criar caixa duplicado.
 */
CaixaSchema.index(
  { status: 1 },
  { unique: true, partialFilterExpression: { status: 'aberto' } },
);
CaixaSchema.index({ abertoEm: -1 });
