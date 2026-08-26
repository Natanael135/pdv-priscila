import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';
import { opcoesSchema } from '../common/schema-options';

export type SessaoPublicaDocument = HydratedDocument<SessaoPublica>;

/**
 * Um navegador que se identificou no catálogo.
 *
 * É o "pré-cadastro" do cliente: nome e WhatsApp, sem senha, como as
 * plataformas de pedido costumam fazer. O token fica guardado no
 * navegador dele e é o que permite pedir de novo e ver o próprio
 * histórico sem digitar tudo outra vez.
 *
 * O token NÃO é uma prova de identidade forte — é uma prova de que é o
 * mesmo navegador. Para valer entre aparelhos seria preciso confirmar
 * o número (código por WhatsApp), o que hoje não existe. Por isso o
 * histórico é filtrado por sessão: sem essa confirmação, ninguém pode
 * digitar o telefone de outra pessoa e ler as compras dela.
 */
@Schema(opcoesSchema)
export class SessaoPublica {
  @Prop({ required: true, unique: true })
  token: string;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Cliente', required: true })
  cliente: Types.ObjectId;

  @Prop({ required: true })
  nome: string;

  @Prop({ required: true })
  telefone: string;

  /** último endereço usado, para não digitar de novo a cada pedido */
  @Prop({ type: String, default: null })
  endereco: string | null;

  @Prop({ type: Date, default: Date.now })
  ultimoUso: Date;
}

export const SessaoPublicaSchema = SchemaFactory.createForClass(SessaoPublica);

SessaoPublicaSchema.index({ cliente: 1 });
