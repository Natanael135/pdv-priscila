import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';
import { camposDeMargem } from '../common/margem';
import { opcoesSchema } from '../common/schema-options';

export type ProdutoDocument = HydratedDocument<Produto>;

/** Uma imagem da galeria. O publicId é o que permite apagá-la depois. */
@Schema({ _id: false })
export class Foto {
  @Prop({ required: true })
  url: string;

  @Prop({ required: true })
  publicId: string;

  /**
   * Variação a que esta foto pertence — usado SÓ pelo catálogo em PDF,
   * onde a variação com foto própria vira um item separado.
   *
   * Sem `ref`: aponta para um subdocumento do próprio produto, não
   * para outra coleção. null = foto do produto como um todo.
   */
  @Prop({ type: MongooseSchema.Types.ObjectId, default: null })
  variacaoId: Types.ObjectId | null;
}

export const FotoSchema = SchemaFactory.createForClass(Foto);

/**
 * Variação do produto: cor, tamanho, ou os dois.
 *
 * É opcional por produto. Um jogo de lençol tem sentido em "casal /
 * branco"; uma toalha avulsa pode não ter variação nenhuma.
 *
 * O estoque mora AQUI quando existem variações, e não no produto. Sem
 * isso não dá para responder a pergunta que a loja faz o dia todo:
 * "tem na 44 preta?" — o saldo do produto somado esconde justamente a
 * informação que importa.
 */
@Schema({ _id: true })
export class Variacao {
  @Prop({ type: String, default: null })
  cor: string | null;

  @Prop({ type: String, default: null })
  tamanho: string | null;

  /** código próprio da variação, quando cada uma tem etiqueta */
  @Prop({ type: String, default: null })
  codigoBarras: string | null;

  @Prop({ default: 0 })
  estoqueAtual: number;

  @Prop({ default: 0, min: 0 })
  estoqueMinimo: number;

  /** preço próprio; null = usa o preço do produto */
  @Prop({ type: Number, default: null })
  precoVenda: number | null;

  @Prop({ default: true })
  ativo: boolean;
}

export const VariacaoSchema = SchemaFactory.createForClass(Variacao);

/** "44 · Preto" — o rótulo que aparece na tela e no cupom. */
VariacaoSchema.virtual('descricao').get(function (this: Variacao) {
  return [this.tamanho, this.cor].filter(Boolean).join(' · ') || 'Padrão';
});

VariacaoSchema.set('toJSON', { virtuals: true });
VariacaoSchema.set('toObject', { virtuals: true });

@Schema(opcoesSchema)
export class Produto {
  @Prop({ required: true, trim: true })
  nome: string;

  @Prop({ type: String, default: null })
  descricao: string | null;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Categoria', default: null })
  categoria: Types.ObjectId | null;

  /**
   * De quem se compra este produto.
   *
   * Opcional: nem toda peça vem de fornecedor fixo. Quando existe, é o
   * que responde "acabou o lençol casal, ligo para quem?" sem abrir a
   * agenda e tentar lembrar.
   */
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Fornecedor', default: null })
  fornecedor: Types.ObjectId | null;

  /** único quando existe; a maioria dos produtos fica sem (ver índice abaixo) */
  @Prop({ type: String, default: null })
  codigoBarras: string | null;

  /**
   * Galeria do produto. A PRIMEIRA é a capa — a que aparece no card,
   * no carrinho e no comprovante.
   *
   * Vira lista porque em cama, mesa e banho uma foto não conta a
   * história: o cliente quer ver a estampa, a cor real e o produto na
   * cama montada. `fotoUrl` continua existindo como virtual apontando
   * para a capa, então tudo que já lia esse campo segue funcionando.
   */
  @Prop({ type: [FotoSchema], default: [] })
  fotos: Foto[];

  @Prop({ required: true, default: 0, min: 0 })
  precoCompra: number;

  @Prop({ required: true, default: 0, min: 0 })
  precoVenda: number;

  @Prop({ default: 'un' })
  unidade: string;

  @Prop({ default: true })
  controlaEstoque: boolean;

  /**
   * Grades de cor/tamanho. Vazio = produto simples, estoque no próprio
   * produto (o comportamento de sempre).
   */
  @Prop({ type: [VariacaoSchema], default: [] })
  variacoes: Variacao[];

  /**
   * Saldo do produto.
   *
   * Sem variações, é movimentado direto. COM variações, passa a ser a
   * soma das variações, recalculada a cada movimento — assim as telas
   * de "estoque baixo", "valor em estoque" e a situação do card
   * continuam funcionando sem saber que variação existe.
   */
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

/**
 * Capa do produto, derivada da galeria.
 *
 * Virtual em vez de campo gravado: se fosse gravado, apagar a primeira
 * foto deixaria a capa apontando para uma imagem que não existe mais.
 * Assim a capa é sempre a primeira da lista, por definição.
 */
ProdutoSchema.virtual('fotoUrl').get(function (this: Produto) {
  return this.fotos?.[0]?.url ?? null;
});

ProdutoSchema.virtual('fotoPublicId').get(function (this: Produto) {
  return this.fotos?.[0]?.publicId ?? null;
});

/** Atalho para a tela decidir se pede a variação antes de vender. */
ProdutoSchema.virtual('usaVariacoes').get(function (this: Produto) {
  return (this.variacoes?.length ?? 0) > 0;
});

/**
 * Soma das variações — o saldo real do produto quando há grade.
 *
 * Quem grava é o EstoqueService, a cada movimento. Sem manter isso em
 * dia, o card mostraria "0 em estoque" com 15 peças na 44 preta, ou o
 * contrário, que é pior: deixar vender o que não existe.
 */
export function somarVariacoes(variacoes: Variacao[] | undefined): number {
  return (variacoes ?? []).reduce((s, v) => s + (v.estoqueAtual || 0), 0);
}

ProdutoSchema.index({ nome: 'text' });
ProdutoSchema.index({ categoria: 1, ativo: 1 });
ProdutoSchema.index({ fornecedor: 1, ativo: 1 });
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
