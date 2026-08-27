import type { FormaPagamento } from '../vendas/venda.schema';

/**
 * A loja trabalha com três tabelas: à vista sai mais barato, cartão de
 * crédito e fiado saem mais caro, e o acréscimo de um não é igual ao do
 * outro — o crédito paga a taxa da maquininha, o fiado paga o risco e a
 * espera.
 */
export const TABELAS_DE_PRECO = ['avista', 'credito', 'fiado'] as const;
export type TabelaDePreco = (typeof TABELAS_DE_PRECO)[number];

export const ROTULO_DA_TABELA: Record<TabelaDePreco, string> = {
  avista: 'à vista',
  credito: 'crédito',
  fiado: 'fiado',
};

/** o que cada preço precisa ter para ser consultado */
export interface PrecosDoItem {
  precoVenda: number | null;
  precoCredito?: number | null;
  precoFiado?: number | null;
}

/**
 * A qual tabela cada forma de pagamento pertence.
 *
 * Débito, pix, dinheiro e transferência caem o mesmo dia na conta: são
 * à vista. Crédito e fiado têm cada um a sua.
 */
export function tabelaDaForma(forma: FormaPagamento): TabelaDePreco {
  if (forma === 'credito') return 'credito';
  if (forma === 'fiado') return 'fiado';
  return 'avista';
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
 */
export function precoDaTabela(
  produto: PrecosDoItem,
  variacao: PrecosDoItem | null | undefined,
  tabela: TabelaDePreco,
): number {
  const campo = tabela === 'credito' ? 'precoCredito' : 'precoFiado';

  if (variacao) {
    if (tabela !== 'avista' && ehPreco(variacao[campo])) {
      return variacao[campo] as number;
    }
    if (ehPreco(variacao.precoVenda)) return variacao.precoVenda as number;
  }

  if (tabela !== 'avista' && ehPreco(produto[campo])) {
    return produto[campo] as number;
  }

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
