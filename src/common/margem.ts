/**
 * Margem de lucro — a regra do negócio, num lugar só.
 *
 * A conta é sempre sobre o PREÇO DE VENDA:
 *
 *     margem % = (venda - compra) / venda * 100
 *
 * Por que nunca passa de 100%: o custo faz parte do preço de venda. No
 * melhor caso imaginável a mercadoria seria de graça (compra = 0) e a
 * margem bateria 100% — todo o preço viraria lucro. Não existe mais que
 * isso, porque não dá para lucrar mais do que o dinheiro que entrou.
 *
 * O que passa de 100% é outra coisa: o MARKUP, que mede o lucro em cima
 * do CUSTO. Comprou por 10 e vendeu por 30 → markup de 200%, margem de
 * 66,7%. As duas contas estão certas, respondem perguntas diferentes.
 *
 * No Mongo não existe coluna calculada, então estes valores são gravados
 * junto com o produto (por isso dá para ordenar a tela de margens por
 * eles). Quem grava é sempre este arquivo, chamado pelo service.
 */

export interface CamposMargem {
  lucroUnitario: number;
  margemPercentual: number;
  markupPercentual: number | null;
}

function duasCasas(n: number): number {
  return Math.round(n * 100) / 100;
}

export function calcularMargem(precoCompra: number, precoVenda: number): number {
  if (!precoVenda || precoVenda <= 0) return 0;
  return ((precoVenda - precoCompra) / precoVenda) * 100;
}

export function calcularMarkup(
  precoCompra: number,
  precoVenda: number,
): number | null {
  if (!precoCompra || precoCompra <= 0) return null;
  return ((precoVenda - precoCompra) / precoCompra) * 100;
}

/** Os três campos derivados, prontos para gravar no documento. */
export function camposDeMargem(
  precoCompra: number,
  precoVenda: number,
): CamposMargem {
  const compra = Number(precoCompra) || 0;
  const venda = Number(precoVenda) || 0;
  const markup = calcularMarkup(compra, venda);

  return {
    lucroUnitario: duasCasas(venda - compra),
    margemPercentual: duasCasas(calcularMargem(compra, venda)),
    markupPercentual: markup === null ? null : duasCasas(markup),
  };
}

/** Margem de um período inteiro: lucro sobre faturamento, mesma conta. */
export function margemDoTotal(faturamento: number, custo: number): number {
  if (!faturamento || faturamento <= 0) return 0;
  return duasCasas(((faturamento - custo) / faturamento) * 100);
}

/** Arredondamento de dinheiro — evita 0.1 + 0.2 aparecer no total. */
export function dinheiro(n: number): number {
  return Math.round((Number(n) || 0) * 100) / 100;
}
