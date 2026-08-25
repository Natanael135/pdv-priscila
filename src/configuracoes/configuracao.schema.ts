import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { opcoesSchema } from '../common/schema-options';

export type ConfiguracaoDocument = HydratedDocument<Configuracao>;

/**
 * Documento único com os ajustes da loja. O service garante que exista
 * só um (padrão singleton), então não há id para o app guardar.
 */
@Schema(opcoesSchema)
export class Configuracao {
  @Prop({ default: 'Minha Loja' })
  nomeLoja: string;

  @Prop({ type: String, default: null })
  telefone: string | null;

  @Prop({ type: String, default: null })
  endereco: string | null;

  /** desliga os avisos de estoque sem precisar mexer produto por produto */
  @Prop({ default: true })
  alertaEstoque: boolean;

  /** prazo padrão do fiado, em dias, quando a venda não informa outro */
  @Prop({ default: 30 })
  diasFiadoPadrao: number;
}

export const ConfiguracaoSchema = SchemaFactory.createForClass(Configuracao);
