import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';
import { opcoesSchema } from '../common/schema-options';

export type MovimentacaoDocument = HydratedDocument<Movimentacao>;

export const TIPOS_MOVIMENTACAO = [
  'entrada', // compra, reposição
  'saida', // saiu sem ser venda
  'venda',
  'cancelamento', // venda cancelada, produto voltou
  'ajuste', // inventário: a contagem virou o novo saldo
  'perda', // quebra, vencimento, furto
] as const;

export type TipoMovimentacao = (typeof TIPOS_MOVIMENTACAO)[number];

/**
 * Histórico de tudo que mexeu no estoque.
 *
 * Guardamos o saldo antes e depois de cada movimento: quando o estoque
 * do sistema não bate com a prateleira, dá para percorrer a linha do
 * tempo e achar onde desencontrou, em vez de só corrigir no escuro.
 */
@Schema(opcoesSchema)
export class Movimentacao {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Produto', required: true })
  produto: Types.ObjectId;

  @Prop({ type: String, default: null })
  produtoNome: string | null;

  /** id da variação movimentada, quando o produto tem grade */
  @Prop({ type: String, default: null })
  variacao: string | null;

  @Prop({ type: String, default: null })
  variacaoDescricao: string | null;

  @Prop({ type: String, required: true, enum: TIPOS_MOVIMENTACAO })
  tipo: TipoMovimentacao;

  /** sempre positiva; o tipo é que diz a direção */
  @Prop({ required: true })
  quantidade: number;

  @Prop({ required: true })
  estoqueAnterior: number;

  @Prop({ required: true })
  estoqueNovo: number;

  @Prop({ type: Number, default: null })
  custoUnitario: number | null;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Venda', default: null })
  venda: Types.ObjectId | null;

  @Prop({ type: String, default: null })
  motivo: string | null;
}

export const MovimentacaoSchema = SchemaFactory.createForClass(Movimentacao);

MovimentacaoSchema.index({ produto: 1, criadoEm: -1 });
MovimentacaoSchema.index({ criadoEm: -1 });
