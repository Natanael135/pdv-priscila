import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';
import { opcoesSchema } from '../common/schema-options';

export type MovimentacaoDocument = HydratedDocument<Movimentacao>;

export const TIPOS_MOVIMENTACAO = [
  'entrada', // compra, reposição
  'saida', // saiu sem ser venda
  'venda',
  'cancelamento', // venda cancelada, produto voltou
  'devolucao', // peça tirada de uma venda já feita, voltou para a prateleira
  'ajuste', // inventário: a contagem virou o novo saldo
  'perda', // quebra, vencimento, furto
] as const;

export type TipoMovimentacao = (typeof TIPOS_MOVIMENTACAO)[number];

/**
 * Por que a peça saiu sem virar venda.
 *
 * Lista fechada de propósito. Em texto livre, "quebrou", "quebrado" e
 * "caiu no chão" viram três linhas no relatório, e o que a lojista
 * precisa ver é "defeito: R$ 200 este mês" — um número só, que dá para
 * comparar com o mês passado e decidir se troca de fornecedor.
 */
export const CAUSAS_DE_BAIXA = [
  'defeito', // quebrou, rasgou, veio com defeito
  'avaria', // manchou, mofou, estragou na loja
  'furto',
  'brinde', // deu de presente, mostruário que foi embora
  'uso_loja', // usado na própria loja
  'devolucao_fornecedor', // voltou para quem vendeu
  'outro',
] as const;

export type CausaDeBaixa = (typeof CAUSAS_DE_BAIXA)[number];

/** os tipos que tiram peça sem venda — e por isso têm causa e custam */
export const TIPOS_DE_BAIXA: TipoMovimentacao[] = ['perda', 'saida'];

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

  /**
   * Fornecedor daquela remessa — só faz sentido em entrada.
   *
   * Fica na movimentação, e não só no produto, porque o produto pode
   * trocar de fornecedor: gravar aqui preserva de quem veio CADA
   * compra, que é o que permite comparar preço entre fornecedores ao
   * longo do tempo.
   */
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Fornecedor', default: null })
  fornecedor: Types.ObjectId | null;

  /**
   * A causa, só em perda e saída. É ela que o relatório de prejuízo
   * soma; o `motivo` fica como observação livre ao lado.
   */
  @Prop({ type: String, default: null, enum: [...CAUSAS_DE_BAIXA, null] })
  causa: CausaDeBaixa | null;

  @Prop({ type: String, default: null })
  motivo: string | null;
}

export const MovimentacaoSchema = SchemaFactory.createForClass(Movimentacao);

MovimentacaoSchema.index({ produto: 1, criadoEm: -1 });
MovimentacaoSchema.index({ criadoEm: -1 });
// o relatório de prejuízo filtra por tipo e período
MovimentacaoSchema.index({ tipo: 1, criadoEm: -1 });
