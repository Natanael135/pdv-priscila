import type { FormaPagamento } from '../vendas/venda.schema';

/**
 * As quatro tabelas da loja.
 *
 * Três delas dependem de COMO se paga: à vista sai mais barato, cartão
 * e fiado saem mais caro, e o acréscimo de um não é o do outro — o
 * cartão paga a taxa da maquininha, o fiado paga o risco e a espera.
 *
 * A quarta depende de QUEM compra. Revendedor leva por preço de
 * atacado: compra para vender de novo, leva mais peças e volta sempre.
 * Por isso ela não entra no rodízio das outras — ver `tabelaDaVenda`.
 */
export const TABELAS_DE_PRECO = ['avista', 'credito', 'fiado', 'revenda'] as const;
export type TabelaDePreco = (typeof TABELAS_DE_PRECO)[number];

export const ROTULO_DA_TABELA: Record<TabelaDePreco, string> = {
  avista: 'à vista',
  credito: 'cartão',
  fiado: 'fiado',
  revenda: 'revenda',
};

/** o campo de cada tabela; à vista é o preço base e não tem campo próprio */
const CAMPO_DA_TABELA: Record<TabelaDePreco, keyof PrecosDoItem | null> = {
  avista: null,
  credito: 'precoCredito',
  fiado: 'precoFiado',
  revenda: 'precoRevenda',
};

/** o que cada preço precisa ter para ser consultado */
export interface PrecosDoItem {
  precoVenda: number | null;
  precoCredito?: number | null;
  precoFiado?: number | null;
  /**
   * Preço de atacado. NUNCA sai pela API pública — é informação da
   * lojista, e o cliente do site não pode nem saber que existe.
   */
  precoRevenda?: number | null;
}

/**
 * A qual tabela cada forma de pagamento pertence.
 *
 * Crédito e DÉBITO caem os dois na tabela de cartão: a maquininha cobra
 * a taxa nas duas, então o preço é o mesmo. A tabela se chama 'credito'
 * por dentro porque é o nome que já está gravado no banco, mas o que
 * ela cobre é o cartão inteiro.
 *
 * Pix, dinheiro e transferência caem na conta no mesmo dia, sem taxa
 * nenhuma: são à vista. Fiado tem a dele, que paga o risco e a espera.
 */
export function tabelaDaForma(forma: FormaPagamento): TabelaDePreco {
  if (forma === 'credito' || forma === 'debito') return 'credito';
  if (forma === 'fiado') return 'fiado';
  return 'avista';
}

/**
 * A tabela desta venda, considerando o cliente E a forma de pagamento.
 *
 * Quem revende vence a forma de pagamento: o preço de atacado já é o
 * acordo com aquela pessoa, e somar a taxa da maquininha por cima
 * desfaria o acordo no caixa. Uma revendedora que paga no cartão paga o
 * preço de revenda — a loja escolheu absorver a taxa quando definiu
 * aquele preço.
 *
 * Sem cliente, ou com cliente comum, manda a forma de pagamento, como
 * sempre foi.
 */
export function tabelaDaVenda(
  cliente: { revendedor?: boolean } | null | undefined,
  forma: FormaPagamento | null | undefined,
): TabelaDePreco {
  if (cliente?.revendedor) return 'revenda';
  return forma ? tabelaDaForma(forma) : 'avista';
}

/**
 * Quanto custa este item nesta tabela.
 *
 * A ordem de busca importa e é esta:
 *
 *   1. o preço da variação naquela tabela
 *   2. o preço à vista da variação
 *   3. o preço do produto naquela tabela
 *   4. o preço à vista do produto
 *
 * O passo 2 é o que evita o erro caro. Uma variação com preço próprio é
 * uma ilha: ela existe justamente porque custa outra coisa (a estampa
 * mais simples que se compra e se vende mais barato). Se ela caísse no
 * preço de crédito do PRODUTO, uma variação de 45 à vista viraria os 55
 * do crédito do produto de 50 — mais cara no cartão do que o item que
 * ela deveria baratear.
 *
 * O custo disso é que uma variação com preço próprio e sem preço de
 * crédito vende no cartão pelo preço à vista dela, sem acréscimo. O app
 * avisa isso na tela da variação, para ser escolha e não surpresa.
 *
 * Vale igual para revenda: variação com preço próprio e sem preço de
 * atacado sai pelo próprio preço dela, não pelo atacado do produto.
 * Aqui o efeito é a favor da lojista — cobra o varejo da variação em
 * vez do atacado do produto —, mas continua sendo surpresa se ninguém
 * avisar, então o app avisa do mesmo jeito.
 */
export function precoDaTabela(
  produto: PrecosDoItem,
  variacao: PrecosDoItem | null | undefined,
  tabela: TabelaDePreco,
): number {
  const campo = CAMPO_DA_TABELA[tabela];

  if (variacao) {
    if (campo && ehPreco(variacao[campo])) return variacao[campo] as number;
    if (ehPreco(variacao.precoVenda)) return variacao.precoVenda as number;
  }

  if (campo && ehPreco(produto[campo])) return produto[campo] as number;

  return produto.precoVenda ?? 0;
}

/**
 * O custo do item, com a variação na frente do produto.
 *
 * Quando a variação é comprada mais barata que as irmãs, o lucro da
 * venda só fica certo se o custo dela vier junto — senão a peça mais
 * barata aparece com a margem da mais cara.
 */
export function custoDoItem(
  produto: { precoCompra: number },
  variacao: { precoCompra?: number | null } | null | undefined,
): number {
  return ehPreco(variacao?.precoCompra)
    ? (variacao?.precoCompra as number)
    : produto.precoCompra;
}

/** zero não é preço: significa "não preenchido", igual a null */
function ehPreco(valor: number | null | undefined): boolean {
  return valor != null && valor > 0;
}
