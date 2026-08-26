import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';
import { opcoesSchema } from '../common/schema-options';

export type NotificacaoDocument = HydratedDocument<Notificacao>;

export const TIPOS_NOTIFICACAO = [
  'estoque_baixo',
  'sem_estoque',
  'fiado_vencido',
] as const;

export type TipoNotificacao = (typeof TIPOS_NOTIFICACAO)[number];

@Schema(opcoesSchema)
export class Notificacao {
  @Prop({ type: String, required: true, enum: TIPOS_NOTIFICACAO })
  tipo: TipoNotificacao;

  @Prop({ required: true })
  titulo: string;

  @Prop({ required: true })
  mensagem: string;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Produto', default: null })
  produto: Types.ObjectId | null;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Cliente', default: null })
  cliente: Types.ObjectId | null;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Venda', default: null })
  venda: Types.ObjectId | null;

  @Prop({ default: false })
  lida: boolean;

  /**
   * Já entrou num push enviado ao celular.
   *
   * Separado de `lida`: `lida` é a pessoa ter visto na tela do app,
   * `avisado` é o aparelho ter apitado. Sem os dois, ou o aviso sairia
   * de novo a cada disparo, ou abrir o app mataria um push que ainda
   * nem tinha saído.
   */
  @Prop({ default: false })
  avisado: boolean;
}

export const NotificacaoSchema = SchemaFactory.createForClass(Notificacao);

NotificacaoSchema.index({ lida: 1, criadoEm: -1 });

// o disparo do push varre exatamente por estes dois campos
NotificacaoSchema.index({ lida: 1, avisado: 1 });

/**
 * Um aviso pendente por produto e por tipo. Sem isso, cada venda de um
 * produto em falta criaria um aviso novo e a tela viraria uma parede de
 * repetições do mesmo problema.
 */
NotificacaoSchema.index(
  { produto: 1, tipo: 1 },
  {
    unique: true,
    partialFilterExpression: { lida: false, produto: { $type: 'objectId' } },
  },
);
