import { BadRequestException } from '@nestjs/common';
import {
  CobrancaDaVenda,
  LinhaDaVenda,
  PagamentoDaVenda,
  planejarEdicao,
  VendaAntes,
} from './edicao';

/** Uma linha de venda com o total calculado como o registro calcula. */
function linha(
  nome: string,
  quantidade: number,
  precoUnitario: number,
  extra: Partial<LinhaDaVenda> = {},
): LinhaDaVenda {
  const desconto = extra.desconto ?? 0;
  return {
    produto: null,
    produtoNome: nome,
    variacao: null,
    variacaoDescricao: null,
    quantidade,
    precoUnitario,
    custoUnitario: 10,
    desconto,
    total: Math.round((quantidade * precoUnitario - desconto) * 100) / 100,
    ...extra,
  };
}

function venda(
  itens: LinhaDaVenda[],
  pagamentos: PagamentoDaVenda[],
  cobrancas: CobrancaDaVenda[] = [],
  desconto = 0,
): VendaAntes {
  const subtotal = itens.reduce((s, i) => s + i.total, 0);
  // venda dividida: o acréscimo do cartão/fiado está dentro dos pagamentos
  const acrescimo = pagamentos.reduce((s, p) => s + (p.acrescimo ?? 0), 0);
  return {
    itens,
    desconto,
    total: Math.round((subtotal - desconto + acrescimo) * 100) / 100,
    pagamentos,
    cobrancas,
  };
}

function parcela(
  id: string,
  numero: number,
  totalParcelas: number,
  valor: number,
  extra: Partial<CobrancaDaVenda> = {},
): CobrancaDaVenda {
  return {
    id,
    forma: 'fiado',
    numero,
    totalParcelas,
    vencimento: new Date(2026, 9 + numero, 10),
    valor,
    valorPago: 0,
    pago: false,
    ...extra,
  };
}

describe('planejarEdicao', () => {
  describe('itens', () => {
    it('tira a linha inteira, devolve ao estoque e o dinheiro volta ao cliente', () => {
      const antes = venda(
        [linha('Toalha', 1, 50), linha('Lençol', 1, 150)],
        [{ forma: 'dinheiro', valor: 200, parcelas: 1 }],
      );

      const plano = planejarEdicao(antes, { quantidades: [0, 1], desconto: 0 });

      expect(plano.itens.map((i) => i.produtoNome)).toEqual(['Lençol']);
      expect(plano.devolvidas).toEqual([
        expect.objectContaining({
          produtoNome: 'Toalha',
          quantidade: 1,
          valor: 50,
        }),
      ]);
      expect(plano.total).toBe(150);
      expect(plano.custoTotal).toBe(10);
      expect(plano.pagamentos).toEqual([
        { forma: 'dinheiro', valor: 150, parcelas: 1 },
      ]);
      expect(plano.devolucoes).toEqual([{ forma: 'dinheiro', valor: 50 }]);
      expect(plano.abatidoDoFiado).toBe(0);
      expect(plano.situacao).toBe('pago');
    });

    it('diminui a quantidade e o desconto da linha encolhe junto', () => {
      // 3 × 50 com 15 de desconto: cada peça saiu por 45
      const antes = venda(
        [linha('Toalha', 3, 50, { desconto: 15 })],
        [{ forma: 'pix', valor: 135, parcelas: 1 }],
      );

      const plano = planejarEdicao(antes, { quantidades: [2], desconto: 0 });

      expect(plano.itens[0]).toMatchObject({
        quantidade: 2,
        desconto: 10,
        total: 90,
      });
      expect(plano.devolvidas[0]).toMatchObject({ quantidade: 1, valor: 45 });
      expect(plano.devolucoes).toEqual([{ forma: 'pix', valor: 45 }]);
    });

    it('quantidade quebrada não sobra ruído de ponto flutuante', () => {
      const antes = venda(
        [linha('Tecido', 2.5, 20)],
        [{ forma: 'dinheiro', valor: 50, parcelas: 1 }],
      );

      const plano = planejarEdicao(antes, { quantidades: [1.5], desconto: 0 });

      expect(plano.devolvidas[0].quantidade).toBe(1);
      expect(plano.total).toBe(30);
    });

    it('troca de peça por desconto menor: o total fica igual e nada volta em dinheiro', () => {
      const antes = venda(
        [linha('Toalha', 1, 50), linha('Lençol', 1, 150)],
        [{ forma: 'pix', valor: 150, parcelas: 1 }],
        [],
        50,
      );

      const plano = planejarEdicao(antes, { quantidades: [0, 1], desconto: 0 });

      expect(plano.total).toBe(150);
      expect(plano.reducao).toBe(0);
      expect(plano.devolvidas).toHaveLength(1);
      expect(plano.devolucoes).toEqual([]);
      expect(plano.pagamentos).toEqual([
        { forma: 'pix', valor: 150, parcelas: 1 },
      ]);
    });
  });

  describe('desconto depois da venda', () => {
    it('cartão cobrado a menos: o crédito encolhe e a diferença é estorno', () => {
      const antes = venda(
        [linha('Jogo de cama', 1, 110)],
        [{ forma: 'credito', valor: 110, parcelas: 1 }],
      );

      const plano = planejarEdicao(antes, { quantidades: [1], desconto: 10 });

      expect(plano.total).toBe(100);
      expect(plano.desconto).toBe(10);
      expect(plano.devolvidas).toEqual([]);
      expect(plano.pagamentos).toEqual([
        { forma: 'credito', valor: 100, parcelas: 1 },
      ]);
      expect(plano.devolucoes).toEqual([{ forma: 'credito', valor: 10 }]);
    });

    it('pagamento dividido: sai do último lançado', () => {
      const antes = venda(
        [linha('Edredom', 1, 100)],
        [
          { forma: 'pix', valor: 50, parcelas: 1 },
          { forma: 'credito', valor: 50, parcelas: 1 },
        ],
      );

      const plano = planejarEdicao(antes, { quantidades: [1], desconto: 30 });

      expect(plano.pagamentos).toEqual([
        { forma: 'pix', valor: 50, parcelas: 1 },
        { forma: 'credito', valor: 20, parcelas: 1 },
      ]);
      expect(plano.devolucoes).toEqual([{ forma: 'credito', valor: 30 }]);
    });

    it('cartão parcelado: a última parcela a receber da maquininha encolhe', () => {
      const antes = venda(
        [linha('Edredom', 1, 110)],
        [{ forma: 'credito', valor: 110, parcelas: 3 }],
        [
          parcela('a', 1, 3, 36.67, { forma: 'credito' }),
          parcela('b', 2, 3, 36.67, { forma: 'credito' }),
          parcela('c', 3, 3, 36.66, { forma: 'credito' }),
        ],
      );

      const plano = planejarEdicao(antes, { quantidades: [1], desconto: 10 });

      expect(plano.pagamentos).toEqual([
        { forma: 'credito', valor: 100, parcelas: 3 },
      ]);
      expect(plano.cobrancas).toEqual([
        expect.objectContaining({
          id: 'c',
          valor: 26.66,
          abatido: 10,
          remover: false,
        }),
      ]);
      expect(plano.devolucoes).toEqual([{ forma: 'credito', valor: 10 }]);
    });
  });

  describe('fiado', () => {
    it('em aberto: a dívida diminui e nenhum dinheiro volta', () => {
      const antes = venda(
        [linha('Toalha', 1, 50), linha('Lençol', 1, 150)],
        [{ forma: 'fiado', valor: 200, parcelas: 1 }],
        [parcela('p1', 1, 1, 200)],
      );

      const plano = planejarEdicao(antes, { quantidades: [0, 1], desconto: 0 });

      expect(plano.abatidoDoFiado).toBe(50);
      expect(plano.devolucoes).toEqual([]);
      expect(plano.pagamentos).toEqual([
        { forma: 'fiado', valor: 150, parcelas: 1 },
      ]);
      expect(plano.cobrancas).toEqual([
        expect.objectContaining({
          id: 'p1',
          valor: 150,
          abatido: 50,
          remover: false,
        }),
      ]);
      expect(plano.fiadoEmAberto).toBe(150);
      expect(plano.situacao).toBe('fiado');
    });

    it('parcelado: some a última parcela e as que ficam são renumeradas', () => {
      const antes = venda(
        [linha('Enxoval', 1, 200)],
        [{ forma: 'fiado', valor: 200, parcelas: 3 }],
        [
          parcela('p1', 1, 3, 66.67),
          parcela('p2', 2, 3, 66.67),
          parcela('p3', 3, 3, 66.66),
        ],
      );

      const plano = planejarEdicao(antes, { quantidades: [1], desconto: 100 });

      const porId = Object.fromEntries(plano.cobrancas.map((c) => [c.id, c]));
      expect(porId.p3).toMatchObject({ remover: true });
      expect(porId.p2).toMatchObject({
        valor: 33.33,
        abatido: 33.34,
        numero: 2,
        totalParcelas: 2,
      });
      expect(porId.p1).toMatchObject({
        valor: 66.67,
        abatido: 0,
        numero: 1,
        totalParcelas: 2,
      });
      expect(plano.pagamentos).toEqual([
        { forma: 'fiado', valor: 100, parcelas: 2 },
      ]);
      expect(plano.fiadoEmAberto).toBe(100);
    });

    it('já pago em parte: quita o que faltava e devolve o que passou', () => {
      // devia 100, já pagou 80; devolve uma peça de 50
      const antes = venda(
        [linha('Toalha', 1, 50), linha('Lençol', 1, 50)],
        [{ forma: 'fiado', valor: 100, parcelas: 1 }],
        [parcela('p1', 1, 1, 100, { valorPago: 80 })],
      );

      const plano = planejarEdicao(antes, { quantidades: [0, 1], desconto: 0 });

      expect(plano.abatidoDoFiado).toBe(20);
      expect(plano.cobrancas).toEqual([
        expect.objectContaining({
          id: 'p1',
          quitada: true,
          valor: 80,
          abatido: 20,
        }),
      ]);
      // pagou 80 por uma venda que agora é de 50
      expect(plano.devolucoes).toEqual([{ forma: 'fiado', valor: 30 }]);
      expect(plano.pagamentos).toEqual([
        { forma: 'fiado', valor: 50, parcelas: 1 },
      ]);
      expect(plano.situacao).toBe('pago');
    });

    it('perdoado: sai do total sem virar dinheiro de volta', () => {
      // a parcela foi excluída na tela de cobranças — ninguém pagou nada
      const antes = venda(
        [linha('Toalha', 1, 30), linha('Lençol', 1, 70)],
        [{ forma: 'fiado', valor: 100, parcelas: 1 }],
      );

      const plano = planejarEdicao(antes, { quantidades: [0, 1], desconto: 0 });

      expect(plano.devolucoes).toEqual([]);
      expect(plano.pagamentos).toEqual([
        { forma: 'fiado', valor: 70, parcelas: 1 },
      ]);
      expect(plano.situacao).toBe('pago');
    });

    it('misto: primeiro zera a dívida, depois devolve do que foi pago', () => {
      const antes = venda(
        [linha('Toalha', 1, 30), linha('Lençol', 1, 70)],
        [
          { forma: 'pix', valor: 40, parcelas: 1 },
          { forma: 'fiado', valor: 60, parcelas: 1 },
        ],
        [parcela('p1', 1, 1, 60)],
      );

      const plano = planejarEdicao(antes, { quantidades: [1, 0], desconto: 0 });

      expect(plano.abatidoDoFiado).toBe(60);
      expect(plano.cobrancas).toEqual([
        expect.objectContaining({ id: 'p1', remover: true }),
      ]);
      expect(plano.devolucoes).toEqual([{ forma: 'pix', valor: 10 }]);
      expect(plano.pagamentos).toEqual([
        { forma: 'pix', valor: 30, parcelas: 1 },
      ]);
      expect(plano.situacao).toBe('pago');
    });

    it('parcial: fiado que continua devendo, mas não é a venda toda', () => {
      const antes = venda(
        [linha('Toalha', 2, 50)],
        [
          { forma: 'dinheiro', valor: 40, parcelas: 1 },
          { forma: 'fiado', valor: 60, parcelas: 1 },
        ],
        [parcela('p1', 1, 1, 60)],
      );

      const plano = planejarEdicao(antes, { quantidades: [2], desconto: 20 });

      expect(plano.pagamentos).toEqual([
        { forma: 'dinheiro', valor: 40, parcelas: 1 },
        { forma: 'fiado', valor: 40, parcelas: 1 },
      ]);
      expect(plano.situacao).toBe('parcial');
    });
  });

  describe('venda dividida com acréscimo do cartão ou do fiado', () => {
    // 380 à vista, 400 no cartão: 300 em dinheiro e 84,21 no cartão
    const blusaECalca = () =>
      venda(
        [linha('Blusa', 1, 180), linha('Calça', 1, 200)],
        [
          { forma: 'dinheiro', valor: 300, parcelas: 1, acrescimo: 0 },
          { forma: 'credito', valor: 84.21, parcelas: 1, acrescimo: 4.21 },
        ],
      );

    it('a peça que sai estorna o cartão inteiro, com o acréscimo dele', () => {
      const plano = planejarEdicao(blusaECalca(), {
        quantidades: [1, 0],
        desconto: 0,
      });

      // a blusa fica pelo preço à vista, paga em dinheiro: sem taxa de cartão
      expect(plano.total).toBe(180);
      expect(plano.acrescimo).toBe(0);
      expect(plano.pagamentos).toEqual([
        { forma: 'dinheiro', valor: 180, parcelas: 1, acrescimo: 0 },
      ]);
      expect(plano.devolucoes).toEqual([
        { forma: 'credito', valor: 84.21 },
        { forma: 'dinheiro', valor: 120 },
      ]);
    });

    it('desconto depois: o cartão devolve a parte dele e mantém a mesma taxa', () => {
      const plano = planejarEdicao(blusaECalca(), {
        quantidades: [1, 1],
        desconto: 10,
      });

      // os 10 à vista que saem do cartão valiam 10,53 na maquininha
      expect(plano.devolucoes).toEqual([{ forma: 'credito', valor: 10.53 }]);
      expect(plano.pagamentos).toEqual([
        { forma: 'dinheiro', valor: 300, parcelas: 1, acrescimo: 0 },
        { forma: 'credito', valor: 73.68, parcelas: 1, acrescimo: 3.68 },
      ]);
      expect(plano.acrescimo).toBe(3.68);
      expect(plano.total).toBe(373.68);
    });

    it('dinheiro lançado por último: a devolução sai dele e o cartão fica como estava', () => {
      const antes = venda(
        [linha('Blusa', 1, 180), linha('Calça', 1, 200)],
        [
          { forma: 'credito', valor: 100, parcelas: 1, acrescimo: 5 },
          { forma: 'dinheiro', valor: 285, parcelas: 1, acrescimo: 0 },
        ],
      );

      const plano = planejarEdicao(antes, { quantidades: [1, 0], desconto: 0 });

      expect(plano.devolucoes).toEqual([{ forma: 'dinheiro', valor: 200 }]);
      expect(plano.pagamentos).toEqual([
        { forma: 'credito', valor: 100, parcelas: 1, acrescimo: 5 },
        { forma: 'dinheiro', valor: 85, parcelas: 1, acrescimo: 0 },
      ]);
      expect(plano.acrescimo).toBe(5);
      expect(plano.total).toBe(185);
    });

    it('fiado em aberto: a dívida some inteira, sem sobrar taxa do fiado', () => {
      const antes = venda(
        [linha('Toalha', 1, 100), linha('Lençol', 1, 100)],
        [
          { forma: 'dinheiro', valor: 100, parcelas: 1, acrescimo: 0 },
          { forma: 'fiado', valor: 105, parcelas: 1, acrescimo: 5 },
        ],
        [parcela('p1', 1, 1, 105)],
      );

      const plano = planejarEdicao(antes, { quantidades: [0, 1], desconto: 0 });

      expect(plano.abatidoDoFiado).toBe(105);
      expect(plano.cobrancas).toEqual([
        expect.objectContaining({ id: 'p1', remover: true }),
      ]);
      expect(plano.devolucoes).toEqual([]);
      expect(plano.pagamentos).toEqual([
        { forma: 'dinheiro', valor: 100, parcelas: 1, acrescimo: 0 },
      ]);
      expect(plano.total).toBe(100);
      expect(plano.situacao).toBe('pago');
    });

    it('fiado já pago: devolve o que entrou, com a parte da taxa', () => {
      const antes = venda(
        [linha('Toalha', 1, 100), linha('Lençol', 1, 100)],
        [
          { forma: 'pix', valor: 50, parcelas: 1, acrescimo: 0 },
          { forma: 'fiado', valor: 157.5, parcelas: 1, acrescimo: 7.5 },
        ],
        [parcela('p1', 1, 1, 157.5, { valorPago: 157.5, pago: true })],
      );

      const plano = planejarEdicao(antes, { quantidades: [0, 1], desconto: 0 });

      // 50 à vista saem do Pix; os outros 50 saem do fiado, que valiam 52,50
      expect(plano.devolucoes).toEqual([
        { forma: 'pix', valor: 50 },
        { forma: 'fiado', valor: 52.5 },
      ]);
      expect(plano.pagamentos).toEqual([
        { forma: 'fiado', valor: 105, parcelas: 1, acrescimo: 5 },
      ]);
      expect(plano.total).toBe(105);
    });

    it('dois fiados com taxas diferentes e parcelas pagas em parte: fecha no centavo', () => {
      // 1.147,80 à vista: débito e dois fiados em 3x, cada um com o seu
      // acréscimo, e parte das parcelas já recebida
      const antes = venda(
        [
          linha('Jogo de cama', 2, 281.88),
          linha('Edredom', 1, 246.38),
          linha('Toalha', 2, 65.21),
          linha('Lençol', 2, 103.62),
        ],
        [
          { forma: 'debito', valor: 42.34, parcelas: 1, acrescimo: 4.24 },
          { forma: 'fiado', valor: 553.03, parcelas: 3, acrescimo: 82.05 },
          { forma: 'fiado', valor: 750, parcelas: 3, acrescimo: 111.28 },
        ],
        [
          parcela('a1', 1, 3, 184.34),
          parcela('a2', 2, 3, 184.34, { valorPago: 113.34 }),
          parcela('a3', 3, 3, 184.35),
          parcela('b1', 1, 3, 250),
          parcela('b2', 2, 3, 250, { valorPago: 216.39 }),
          parcela('b3', 3, 3, 250, { valorPago: 250, pago: true }),
        ],
      );

      // fica só um lençol
      const plano = planejarEdicao(antes, {
        quantidades: [0, 0, 0, 1],
        desconto: 0,
      });

      // a dívida em aberto sai inteira: com uma taxa média para os dois
      // fiados, sobrava uma parcela de R$ 0,01 pendurada
      expect(plano.abatidoDoFiado).toBe(723.3);
      expect(plano.cobrancas).toHaveLength(5);
      expect(plano.cobrancas.every((c) => c.remover || c.quitada)).toBe(true);

      // os pagamentos somam o total, e o dinheiro fecha com o que saiu
      expect(plano.pagamentos).toEqual([
        { forma: 'fiado', valor: 121.67, parcelas: 3, acrescimo: 18.05 },
      ]);
      expect(plano.total).toBe(121.67);
      expect(plano.devolucoes).toEqual([
        { forma: 'debito', valor: 42.34 },
        { forma: 'fiado', valor: 458.06 },
      ]);
    });

    it('não deixa subir o total, contando o acréscimo', () => {
      const antes = venda(
        [linha('Blusa', 1, 180), linha('Calça', 1, 200)],
        [
          { forma: 'dinheiro', valor: 300, parcelas: 1, acrescimo: 0 },
          { forma: 'credito', valor: 73.68, parcelas: 1, acrescimo: 3.68 },
        ],
        [],
        10,
      );

      expect(() =>
        planejarEdicao(antes, { quantidades: [1, 1], desconto: 0 }),
      ).toThrow('só pode baixar');
    });
  });

  describe('o que é recusado', () => {
    const base = () =>
      venda(
        [linha('Toalha', 2, 50), linha('Lençol', 1, 100)],
        [{ forma: 'dinheiro', valor: 190, parcelas: 1 }],
        [],
        10,
      );

    const recusa = (
      quantidades: number[],
      desconto: number,
      trecho: string,
    ) => {
      expect(() => planejarEdicao(base(), { quantidades, desconto })).toThrow(
        BadRequestException,
      );
      expect(() => planejarEdicao(base(), { quantidades, desconto })).toThrow(
        trecho,
      );
    };

    it('aumentar a quantidade', () =>
      recusa([3, 1], 10, 'Não dá para aumentar'));
    it('tirar tudo', () => recusa([0, 0], 0, 'cancele a venda'));
    it('subir o total baixando o desconto', () =>
      recusa([2, 1], 0, 'só pode baixar'));
    it('desconto maior que os itens', () =>
      recusa([0, 1], 150, 'maior que o valor dos itens'));
    it('zerar o total', () => recusa([0, 1], 100, 'não pode ficar zerado'));
    it('não mudar nada', () => recusa([2, 1], 10, 'Nada mudou'));
    it('lista de outro tamanho (a venda mudou)', () =>
      recusa([2], 10, 'A venda mudou'));
  });
});
