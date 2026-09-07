import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { opcoesSchema } from '../common/schema-options';

export type ClienteDocument = HydratedDocument<Cliente>;

@Schema(opcoesSchema)
export class Cliente {
  @Prop({ required: true, trim: true })
  nome: string;

  @Prop({ type: String, default: null })
  telefone: string | null;

  @Prop({ type: String, default: null })
  email: string | null;

  @Prop({ type: String, default: null })
  documento: string | null;

  @Prop({ type: String, default: null })
  endereco: string | null;

  @Prop({ type: String, default: null })
  observacoes: string | null;

  /** teto de fiado; 0 = sem limite definido */
  @Prop({ default: 0 })
  limiteFiado: number;

  /**
   * Compra para revender, e por isso leva pelo preço de atacado.
   *
   * A marca fica no CLIENTE, e não na venda: quem revende revende
   * sempre, e ter de lembrar de marcar em cada venda é o mesmo que não
   * ter a tabela — um esquecimento por semana já come a diferença.
   *
   * Só a lojista marca. O cadastro do site não tem este campo, de
   * propósito — ver publico.service.
   */
  @Prop({ default: false })
  revendedor: boolean;

  @Prop({ default: true })
  ativo: boolean;
}

export const ClienteSchema = SchemaFactory.createForClass(Cliente);

ClienteSchema.index({ nome: 1 });
ClienteSchema.index({ telefone: 1 });
