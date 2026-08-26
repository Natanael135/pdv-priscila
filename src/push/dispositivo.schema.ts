import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { opcoesSchema } from '../common/schema-options';

export type DispositivoDocument = HydratedDocument<Dispositivo>;

/**
 * Um aparelho que aceita receber avisos.
 *
 * O token vem da Expo e identifica a instalação, não a pessoa: se ela
 * desinstalar e instalar de novo, é outro token. Por isso ele é a
 * chave — e some sozinho quando a Expo avisa que morreu (ver
 * PushService.enviar).
 */
@Schema(opcoesSchema)
export class Dispositivo {
  @Prop({ required: true, unique: true })
  token: string;

  @Prop({ type: String, default: null })
  plataforma: string | null;

  /** apelido do aparelho, só para a loja saber qual é qual */
  @Prop({ type: String, default: null })
  nome: string | null;

  @Prop({ type: Date, default: Date.now })
  ultimoUso: Date;
}

export const DispositivoSchema = SchemaFactory.createForClass(Dispositivo);
