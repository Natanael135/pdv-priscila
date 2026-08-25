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

  @Prop({ default: true })
  ativo: boolean;
}

export const ClienteSchema = SchemaFactory.createForClass(Cliente);

ClienteSchema.index({ nome: 1 });
ClienteSchema.index({ telefone: 1 });
