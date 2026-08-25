import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { opcoesSchema } from '../common/schema-options';

export type CategoriaDocument = HydratedDocument<Categoria>;

@Schema(opcoesSchema)
export class Categoria {
  @Prop({ required: true, trim: true, unique: true })
  nome: string;

  @Prop({ default: '#6366F1' })
  cor: string;

  /** nome do ícone no @expo/vector-icons (Ionicons) */
  @Prop({ default: 'pricetag' })
  icone: string;

  @Prop({ default: 0 })
  ordem: number;

  @Prop({ default: true })
  ativo: boolean;
}

export const CategoriaSchema = SchemaFactory.createForClass(Categoria);

CategoriaSchema.index({ ordem: 1, nome: 1 });
