import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { opcoesSchema } from '../common/schema-options';

export type FornecedorDocument = HydratedDocument<Fornecedor>;

/**
 * De quem a loja compra.
 *
 * Existe para responder três perguntas que a agenda do celular não
 * responde: de quem veio esta peça, quanto já foi gasto com este
 * fornecedor, e quanto tempo ele costuma levar para entregar.
 *
 * O vínculo com a mercadoria é o que dá valor ao cadastro — ver o
 * campo `fornecedor` no produto e na movimentação de entrada.
 */
@Schema(opcoesSchema)
export class Fornecedor {
  @Prop({ required: true, trim: true })
  nome: string;

  /** quem atende: o vendedor, não a empresa */
  @Prop({ type: String, default: null })
  contato: string | null;

  @Prop({ type: String, default: null })
  telefone: string | null;

  @Prop({ type: String, default: null })
  email: string | null;

  /** CNPJ ou CPF, como vier na nota */
  @Prop({ type: String, default: null })
  documento: string | null;

  @Prop({ type: String, default: null })
  endereco: string | null;

  /**
   * Prazo médio de entrega, em dias.
   *
   * É o que decide quando fazer o pedido: com 15 dias de prazo, esperar
   * o estoque zerar significa duas semanas sem o produto na prateleira.
   */
  @Prop({ type: Number, default: null })
  prazoEntregaDias: number | null;

  @Prop({ type: String, default: null })
  observacoes: string | null;

  @Prop({ default: true })
  ativo: boolean;
}

export const FornecedorSchema = SchemaFactory.createForClass(Fornecedor);

FornecedorSchema.index({ nome: 1 });
FornecedorSchema.index({ ativo: 1, nome: 1 });
