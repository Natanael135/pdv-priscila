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

  /** logo da loja, usada no comprovante e no topo dos ajustes */
  @Prop({ type: String, default: null })
  logoUrl: string | null;

  /** id no Cloudinary — necessário para apagar a logo antiga ao trocar */
  @Prop({ type: String, default: null })
  logoPublicId: string | null;

  /** desliga os avisos de estoque sem precisar mexer produto por produto */
  @Prop({ default: true })
  alertaEstoque: boolean;

  /**
   * Deixa vender mais do que existe em estoque.
   *
   * Desligado por padrão: estoque negativo quase sempre é erro de
   * digitação, e o saldo errado contamina o valor do estoque e a lista
   * de compras. Quem trabalha com encomenda ou pronta-entrega
   * imprecisa pode ligar e assumir o negativo conscientemente.
   */
  @Prop({ default: false })
  permitirVendaSemEstoque: boolean;

  /** prazo padrão do fiado, em dias, quando a venda não informa outro */
  @Prop({ default: 30 })
  diasFiadoPadrao: number;
}

export const ConfiguracaoSchema = SchemaFactory.createForClass(Configuracao);
