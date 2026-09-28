import { BadRequestException } from '@nestjs/common';
import type { Types } from 'mongoose';
import { dinheiro, moeda } from '../common/margem';
import type { FormaPagamento } from './venda.schema';

/**
 * Edição de uma venda já fechada — a conta, sem banco.
 *
 * Fica fora do service por ser a parte que mexe no dinheiro das
 * pessoas: quanto volta para o cliente, quanto sai do fiado, qual
 * parcela encolhe. Aqui ela roda sem Mongo nem transação, e cada caso
 * é testado com números (edicao.spec.ts). O service só busca, chama
 * isto e grava o resultado.
 *
 * A edição só DIMINUI a venda: tirar peça (que volta ao estoque) e dar
 * desconto. Aumentar exigiria cobrar de novo — de quem, em qual forma?
 * Para isso já existe a venda nova.
 */

/** Uma linha da venda, como está gravada. */
export interface LinhaDaVenda {
  produto: Types.ObjectId | null;
  produtoNome: string;
  variacao: string | null;
  variacaoDescricao: string | null;
  quantidade: number;
  precoUnitario: number;
  custoUnitario: number;
  desconto: number;
  total: number;
}

export interface PagamentoDaVenda {
  forma: FormaPagamento;
  valor: number;
  parcelas: number;
}

/** Uma parcela a receber desta venda: fiado ou cartão parcelado. */
export interface CobrancaDaVenda {
  id: string;
  forma: FormaPagamento;
  numero: number;
  totalParcelas: number;
  vencimento: Date;
  valor: number;
  valorPago: number;
  pago: boolean;
}

export interface VendaAntes {
  itens: LinhaDaVenda[];
  desconto: number;
  total: number;
  pagamentos: PagamentoDaVenda[];
  cobrancas: CobrancaDaVenda[];
}

export interface PedidoDeEdicao {
  /** quanto FICA de cada linha, na ordem dos itens; zero tira a linha */
  quantidades: number[];
  /** o novo desconto no total da venda, em R$ */
  desconto: number;
}

/** Peça que saiu da venda e volta para a prateleira. */
export interface PecaDevolvida {
  produto: Types.ObjectId | null;
  variacao: string | null;
  produtoNome: string;
  variacaoDescricao: string | null;
  quantidade: number;
  custoUnitario: number;
  /** quanto aquelas peças valiam na venda, já com o desconto da linha */
  valor: number;
}

/** O que acontece com uma parcela. Só entram as que mudam. */
export interface CobrancaAjustada {
  id: string;
  forma: FormaPagamento;
  /** estava em aberto, nada tinha sido pago, e a dívida inteira saiu */
  remover: boolean;
  valor: number;
  /** o que faltava foi todo abatido; o que já tinha entrado fecha a conta */
  quitada: boolean;
  /** quanto saiu desta parcela nesta edição */
  abatido: number;
  numero: number;
  totalParcelas: number;
}

export interface Devolucao {
  forma: FormaPagamento;
  valor: number;
}

export interface PlanoDeEdicao {
  itens: LinhaDaVenda[];
  devolvidas: PecaDevolvida[];
  subtotal: number;
  desconto: number;
  total: number;
  custoTotal: number;
  /** quanto a venda encolheu */
  reducao: number;
  pagamentos: PagamentoDaVenda[];
  cobrancas: CobrancaAjustada[];
  /** quanto saiu da dívida do fiado — dinheiro que não precisa voltar */
  abatidoDoFiado: number;
  /** o que já tinha sido pago e volta para o cliente, por forma */
  devolucoes: Devolucao[];
  /** quanto do fiado desta venda continua em aberto depois da edição */
  fiadoEmAberto: number;
  situacao: 'pago' | 'parcial' | 'fiado';
}

/** meio centavo: diferença menor que isso é arredondamento, não dinheiro */
const FOLGA = 0.005;

export function planejarEdicao(
  venda: VendaAntes,
  pedido: PedidoDeEdicao,
): PlanoDeEdicao {
  /*
   * As quantidades vêm pela POSIÇÃO da linha. Tamanho diferente quer
   * dizer que a venda mudou depois que a tela abriu — aplicar assim
   * tiraria a peça errada do cupom.
   */
  if (pedido.quantidades.length !== venda.itens.length) {
    throw new BadRequestException(
      'A venda mudou desde que a tela foi aberta. Volte, abra a venda de novo ' +
        'e refaça a alteração.',
    );
  }

  // ── Itens ──────────────────────────────────────────────────────
  const itens: LinhaDaVenda[] = [];
  const devolvidas: PecaDevolvida[] = [];
  let subtotal = 0;
  let custoTotal = 0;

  venda.itens.forEach((item, i) => {
    const fica = quantidade(pedido.quantidades[i]);

    if (!Number.isFinite(fica) || fica < 0) {
      throw new BadRequestException(
        `Quantidade inválida em "${item.produtoNome}"`,
      );
    }
    if (fica > item.quantidade) {
      throw new BadRequestException(
        `Não dá para aumentar "${item.produtoNome}" numa venda já fechada — ` +
          'só diminuir ou tirar. Para vender mais, faça uma venda nova.',
      );
    }

    const linha = recalcularLinha(item, fica);

    if (fica > 0) {
      itens.push(linha);
      subtotal = dinheiro(subtotal + linha.total);
      custoTotal = dinheiro(custoTotal + fica * item.custoUnitario);
    }

    const saiu = quantidade(item.quantidade - fica);
    if (saiu > 0) {
      devolvidas.push({
        produto: item.produto,
        variacao: item.variacao,
        produtoNome: item.produtoNome,
        variacaoDescricao: item.variacaoDescricao,
        quantidade: saiu,
        custoUnitario: item.custoUnitario,
        valor: dinheiro(item.total - linha.total),
      });
    }
  });

  if (!itens.length) {
    throw new BadRequestException(
      'Para tirar todos os itens, cancele a venda — o estoque volta do mesmo ' +
        'jeito e ela sai do faturamento.',
    );
  }

  // ── Totais ─────────────────────────────────────────────────────
  const desconto = dinheiro(pedido.desconto);

  if (desconto > subtotal + FOLGA) {
    throw new BadRequestException(
      `O desconto (${moeda(desconto)}) é maior que o valor dos itens (${moeda(subtotal)}).`,
    );
  }

  const total = dinheiro(subtotal - desconto);

  if (total <= 0) {
    throw new BadRequestException(
      'O total não pode ficar zerado. Para devolver tudo, cancele a venda.',
    );
  }

  if (total > venda.total + FOLGA) {
    throw new BadRequestException(
      `A alteração só pode baixar o valor da venda: ela era de ${moeda(venda.total)} ` +
        `e ficaria ${moeda(total)}. Para cobrar a mais, faça uma venda nova.`,
    );
  }

  if (!devolvidas.length && Math.abs(desconto - venda.desconto) < FOLGA) {
    throw new BadRequestException('Nada mudou na venda.');
  }

  const reducao = Math.max(dinheiro(venda.total - total), 0);

  return {
    itens,
    devolvidas,
    subtotal,
    desconto,
    total,
    custoTotal,
    reducao,
    ...redistribuir(venda.pagamentos, venda.cobrancas, reducao, total),
  };
}

/**
 * A linha com a nova quantidade.
 *
 * O desconto da linha encolhe na mesma proporção: se três toalhas
 * tinham 15 de desconto, cada uma saiu 5 mais barata, e as duas que
 * ficam continuam com 10. Manter os 15 inteiros faria a devolução
 * render ao cliente mais do que ele pagou pela peça.
 */
export function recalcularLinha(
  item: LinhaDaVenda,
  fica: number,
): LinhaDaVenda {
  if (fica === item.quantidade) return { ...item };
  if (fica <= 0) return { ...item, quantidade: 0, desconto: 0, total: 0 };

  const desconto = dinheiro((item.desconto * fica) / item.quantidade);

  return {
    ...item,
    quantidade: fica,
    desconto,
    total: dinheiro(fica * item.precoUnitario - desconto),
  };
}

type Cobranca = CobrancaDaVenda & { abatido: number };

/**
 * Tira `reducao` dos pagamentos, nesta ordem:
 *
 *   1. da dívida do fiado ainda em aberto — o cliente não pagou aquilo,
 *      então basta ele dever menos, e nenhum dinheiro troca de mão;
 *   2. dos outros pagamentos, do último lançado para o primeiro — esse
 *      dinheiro já entrou e volta para o cliente;
 *   3. por último, do fiado que o cliente já pagou — também volta.
 *
 * Os pagamentos continuam somando o total da venda, que é o que o
 * painel usa para dizer quanto entrou em cada forma.
 */
function redistribuir(
  pagamentosAntes: PagamentoDaVenda[],
  cobrancasAntes: CobrancaDaVenda[],
  reducao: number,
  totalNovo: number,
) {
  const pagamentos = pagamentosAntes.map((p) => ({ ...p }));
  const cobrancas: Cobranca[] = cobrancasAntes.map((c) => ({
    ...c,
    abatido: 0,
  }));
  const devolucoes = new Map<FormaPagamento, number>();

  const doFiado = pagamentos.filter((p) => p.forma === 'fiado');
  const dosOutros = pagamentos.filter((p) => p.forma !== 'fiado');

  // quanto do fiado desta venda o cliente já tinha pago antes da edição
  const pagoNoFiado = somar(
    cobrancas.filter((c) => c.forma === 'fiado').map((c) => c.valorPago),
  );

  let falta = reducao;

  // ── 1. A dívida em aberto ──────────────────────────────────────
  const abatidoDoFiado = abater(emAberto(cobrancas, 'fiado'), falta);
  tirar(doFiado, abatidoDoFiado);
  falta = dinheiro(falta - abatidoDoFiado);

  // ── 2. Os outros pagamentos, do último para o primeiro ─────────
  for (const pagamento of [...dosOutros].reverse()) {
    if (falta <= 0) break;

    const tira = Math.min(pagamento.valor, falta);
    if (tira <= 0) continue;

    pagamento.valor = dinheiro(pagamento.valor - tira);
    falta = dinheiro(falta - tira);
    acumular(devolucoes, pagamento.forma, tira);

    // cartão parcelado: o que a maquininha ainda vai repassar encolhe junto
    if (pagamento.parcelas > 1)
      abater(emAberto(cobrancas, pagamento.forma), tira);
  }

  // ── 3. O fiado que o cliente já pagou ──────────────────────────
  if (falta > 0) {
    const antes = somar(doFiado.map((p) => p.valor));
    tirar(doFiado, falta);
    const depois = somar(doFiado.map((p) => p.valor));

    /*
     * Volta só o que entrou de fato. Fiado perdoado (parcela excluída
     * na tela de cobranças) sai do total sem virar dinheiro: o cliente
     * nunca pagou aquilo.
     */
    const volta = dinheiro(
      Math.max(0, pagoNoFiado - depois) - Math.max(0, pagoNoFiado - antes),
    );
    if (volta > 0) acumular(devolucoes, 'fiado', volta);
  }

  // ── Como ficam as parcelas ─────────────────────────────────────
  const finais = cobrancas.map((c) => {
    const zerou = !c.pago && c.abatido > 0 && c.valor - c.valorPago <= FOLGA;

    return {
      ...c,
      remover: zerou && c.valorPago <= FOLGA,
      quitada: zerou && c.valorPago > FOLGA,
      valor: zerou ? c.valorPago : c.valor,
    };
  });

  renumerar(finais, pagamentosAntes, pagamentos);

  const mudaram = finais.filter((c, i) => {
    const antes = cobrancasAntes[i];
    return (
      c.remover ||
      c.abatido > 0 ||
      c.numero !== antes.numero ||
      c.totalParcelas !== antes.totalParcelas
    );
  });

  // ── Situação ───────────────────────────────────────────────────
  const fiadoEmAberto = somar(
    finais
      .filter((c) => c.forma === 'fiado' && !c.remover && !c.pago && !c.quitada)
      .map((c) => c.valor - c.valorPago),
  );
  const fiadoNaVenda = somar(doFiado.map((p) => p.valor));

  // mesma régua do registro da venda e do recebimento das parcelas
  const situacao: PlanoDeEdicao['situacao'] =
    fiadoNaVenda <= FOLGA || fiadoEmAberto <= FOLGA
      ? 'pago'
      : fiadoNaVenda >= totalNovo - FOLGA
        ? 'fiado'
        : 'parcial';

  return {
    pagamentos: pagamentos.filter((p) => p.valor > FOLGA),
    cobrancas: mudaram.map((c) => ({
      id: c.id,
      forma: c.forma,
      remover: c.remover,
      valor: c.valor,
      quitada: c.quitada,
      abatido: c.abatido,
      numero: c.numero,
      totalParcelas: c.totalParcelas,
    })),
    abatidoDoFiado,
    devolucoes: [...devolucoes].map(([forma, valor]) => ({ forma, valor })),
    fiadoEmAberto,
    situacao,
  };
}

/**
 * As parcelas ainda em aberto de uma forma, da última para a primeira.
 *
 * O abatimento começa pelo fim, como quem quita um carnê de trás para
 * frente: a parcela mais próxima, que o cliente já está se preparando
 * para pagar, continua igual — some a do fim.
 */
function emAberto(cobrancas: Cobranca[], forma: FormaPagamento): Cobranca[] {
  return cobrancas
    .filter((c) => c.forma === forma && !c.pago)
    .sort(
      (a, b) =>
        b.vencimento.getTime() - a.vencimento.getTime() || b.numero - a.numero,
    );
}

/** Baixa até `quanto` do saldo das parcelas, na ordem dada. Devolve o que baixou. */
function abater(cobrancas: Cobranca[], quanto: number): number {
  let resta = quanto;

  for (const c of cobrancas) {
    if (resta <= 0) break;

    const tira = Math.min(dinheiro(c.valor - c.valorPago), resta);
    if (tira <= 0) continue;

    c.valor = dinheiro(c.valor - tira);
    c.abatido = dinheiro(c.abatido + tira);
    resta = dinheiro(resta - tira);
  }

  return dinheiro(quanto - resta);
}

/** Tira `quanto` dos pagamentos, do último para o primeiro. */
function tirar(pagamentos: PagamentoDaVenda[], quanto: number) {
  let resta = quanto;

  for (const p of [...pagamentos].reverse()) {
    if (resta <= 0) break;

    const tira = Math.min(p.valor, resta);
    p.valor = dinheiro(p.valor - tira);
    resta = dinheiro(resta - tira);
  }
}

/**
 * Parcela que some deixa buraco na contagem: "1/3, 2/3" sem a 3ª faz
 * procurar uma cobrança que não existe. Quando a forma tem um pagamento
 * só, as que ficam são renumeradas e o pagamento passa a dizer em
 * quantas vezes ficou.
 *
 * Com dois pagamentos da mesma forma (fiado lançado duas vezes), as
 * parcelas dos dois se misturam na coleção e não dá para saber de qual
 * é cada uma — aí a numeração fica como está.
 */
function renumerar(
  cobrancas: (Cobranca & { remover: boolean })[],
  pagamentosAntes: PagamentoDaVenda[],
  pagamentos: PagamentoDaVenda[],
) {
  const formas = new Set(
    cobrancas.filter((c) => c.remover).map((c) => c.forma),
  );

  for (const forma of formas) {
    if (pagamentosAntes.filter((p) => p.forma === forma).length !== 1) continue;

    const ficam = cobrancas
      .filter((c) => c.forma === forma && !c.remover)
      .sort(
        (a, b) =>
          a.numero - b.numero ||
          a.vencimento.getTime() - b.vencimento.getTime(),
      );

    ficam.forEach((c, i) => {
      c.numero = i + 1;
      c.totalParcelas = ficam.length;
    });

    const pagamento = pagamentos.find((p) => p.forma === forma);
    if (pagamento) pagamento.parcelas = Math.max(ficam.length, 1);
  }
}

function acumular(
  mapa: Map<FormaPagamento, number>,
  forma: FormaPagamento,
  valor: number,
) {
  mapa.set(forma, dinheiro((mapa.get(forma) ?? 0) + valor));
}

function somar(valores: number[]): number {
  return dinheiro(valores.reduce((s, v) => s + v, 0));
}

/** Quantidade sem ruído de ponto flutuante: 2,5 − 1 dá 1,5, não 1,4999… */
function quantidade(n: number): number {
  return Math.round(Number(n) * 1000) / 1000;
}
