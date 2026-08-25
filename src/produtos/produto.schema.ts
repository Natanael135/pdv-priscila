import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';
import { camposDeMargem } from '../common/margem';
import { opcoesSchema } from '../common/schema-options';

export type ProdutoDocument = HydratedDocument<Produto>;

@Schema(opcoesSchema)
export class Produto {
  @Prop({ required: true, trim: true })
  nome: string;

  @Prop({ type: String, default: null })
  descricao: string | null;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Categoria', default: null })
  categoria: Types.ObjectId | null;

  /** único quando existe; a maioria dos produtos fica sem (ver índice abaixo) */
  @Prop({ type: String, default: null })
  codigoBarras: string | null;

  @Prop({ type: String, default: null })
  fotoUrl: string | null;

  /** id da imagem no Cloudinary — sem ele não dá para apagar a foto antiga */
  @Prop({ type: String, default: null })
  fotoPublicId: string | null;

  @Prop({ required: true, default: 0, min: 0 })
  precoCompra: number;

  @Prop({ required: true, default: 0, min: 0 })
  precoVenda: number;

  @Prop({ default: 'un' })
  unidade: string;

  @Prop({ default: true })
  controlaEstoque: boolean;

  @Prop({ default: 0 })
  estoqueAtual: number;

  @Prop({ default: 0, min: 0 })
  estoqueMinimo: number;

  @Prop({ default: true })
  ativo: boolean;

  // ─── Derivados ────────────────────────────────────────────────────
  // O Mongo não tem coluna calculada. Estes três são gravados junto
  // para a tela de margens poder ORDENAR por eles (não dá para ordenar
  // por um virtual). Quem os mantém é o hook logo abaixo — nenhum
  // service escreve nesses campos na mão.

  @Prop({ default: 0 })
  lucroUnitario: number;

  /** (venda - compra) / venda * 100 — nunca passa de 100 */
  @Prop({ default: 0 })
  margemPercentual: number;

  /** (venda - compra) / compra * 100 — informativo, pode passar de 100 */
  @Prop({ type: Number, default: null })
  markupPercentual: number | null;
}

export const ProdutoSchema = SchemaFactory.createForClass(Produto);

ProdutoSchema.index({ nome: 'text' });
ProdutoSchema.index({ categoria: 1, ativo: 1 });
ProdutoSchema.index({ margemPercentual: -1 });

/**
 * Código de barras único — mas só entre quem tem código.
 *
 * A tentação aqui é `unique: true, sparse: true`. Não funciona: o sparse
 * ignora apenas documentos onde o campo NÃO EXISTE, e o schema grava
 * `codigoBarras: null` por padrão. Com null explícito, o índice único vê
 * dois nulls como duplicata e recusa o segundo produto sem código — ou
 * seja, quebraria o cadastro da maioria dos itens da loja.
 *
 * O índice parcial resolve: só entram no índice os documentos em que o
 * campo é string de verdade.
 */
ProdutoSchema.index(
  { codigoBarras: 1 },
  { unique: true, partialFilterExpression: { codigoBarras: { $type: 'string' } } },
);

// Recalcula a margem sempre que um dos preços muda — no create...
//
// Nota de versão: no Mongoose 9 os pre-hooks não recebem mais `next`.
// São async/return puros; chamar next() aqui quebra a compilação.
ProdutoSchema.pre('save', function () {
  if (this.isModified('precoCompra') || this.isModified('precoVenda')) {
    Object.assign(this, camposDeMargem(this.precoCompra, this.precoVenda));
  }
});

// ...e no update. Aqui o update pode trazer só um dos preços, então
// buscamos o documento para completar o que falta antes de recalcular.
ProdutoSchema.pre('findOneAndUpdate', async function () {
  const update = this.getUpdate() as Record<string, unknown> | null;
  if (!update) return;

  const campos = ((update.$set as Record<string, unknown>) ?? update) as Record<
    string,
    unknown
  >;

  const mudouCompra = campos.precoCompra !== undefined;
  const mudouVenda = campos.precoVenda !== undefined;
  if (!mudouCompra && !mudouVenda) return;

  const atual = await this.model.findOne(this.getQuery()).lean<Produto>().exec();

  const compra = mudouCompra
    ? Number(campos.precoCompra)
    : (atual?.precoCompra ?? 0);
  const venda = mudouVenda ? Number(campos.precoVenda) : (atual?.precoVenda ?? 0);

  this.set({ ...camposDeMargem(compra, venda) });
});
