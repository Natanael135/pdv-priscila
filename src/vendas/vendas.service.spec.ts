import { BadRequestException } from '@nestjs/common';
import { Types } from 'mongoose';
import { VendasService } from './vendas.service';

/**
 * A alteração de venda de ponta a ponta, com o banco de mentira.
 *
 * A conta em si está em edicao.spec.ts. Aqui o que se prova é o que o
 * service FAZ com ela — e a regra que não pode quebrar nunca: peça que
 * sai da venda volta para o estoque.
 */

/** Imita o encadeamento do Mongoose: .session(), .sort() e .exec(). */
function consulta<T>(valor: T) {
  const q = {
    session: () => q,
    sort: () => q,
    exec: () => Promise.resolve(valor),
  };
  return q;
}

const toalha = new Types.ObjectId();
const lencol = new Types.ObjectId();
const cliente = new Types.ObjectId();

function vendaFalsa(extra: Record<string, unknown> = {}) {
  const doc = {
    _id: new Types.ObjectId(),
    numero: 12,
    status: 'concluida',
    cliente,
    itens: [
      {
        produto: toalha,
        produtoNome: 'Toalha',
        variacao: 'azul',
        variacaoDescricao: 'Azul',
        quantidade: 2,
        precoUnitario: 50,
        custoUnitario: 20,
        desconto: 0,
        total: 100,
      },
      {
        produto: lencol,
        produtoNome: 'Lençol',
        variacao: null,
        variacaoDescricao: null,
        quantidade: 1,
        precoUnitario: 150,
        custoUnitario: 60,
        desconto: 0,
        total: 150,
      },
    ],
    subtotal: 250,
    desconto: 0,
    total: 250,
    custoTotal: 100,
    lucro: 150,
    pagamentos: [{ forma: 'fiado', valor: 250, parcelas: 1 }],
    situacao: 'fiado',
    edicoes: [] as unknown[],
    save: jest.fn(),
    toJSON() {
      return { id: String(this._id), total: this.total };
    },
    ...extra,
  };
  return doc;
}

function parcelaFalsa(valor: number, extra: Record<string, unknown> = {}) {
  return {
    _id: new Types.ObjectId(),
    forma: 'fiado',
    numero: 1,
    totalParcelas: 1,
    vencimento: new Date(2026, 10, 10),
    valor,
    valorPago: 0,
    pago: false,
    pagoEm: null,
    historico: [] as { tipo: string; valor?: number; saldoDepois?: number }[],
    save: jest.fn(),
    deleteOne: jest.fn(),
    ...extra,
  };
}

function montar(venda: ReturnType<typeof vendaFalsa>, parcelas: unknown[]) {
  const sessao = {
    withTransaction: (fn: () => Promise<void>) => fn(),
    endSession: jest.fn(),
  };
  const estoque = { movimentar: jest.fn() };
  const contasAReceber = { revisarAvisoDeFiado: jest.fn() };

  const service = new VendasService(
    { startSession: () => Promise.resolve(sessao) } as never,
    { findById: () => consulta(venda) } as never,
    {} as never,
    {} as never,
    { find: () => consulta(parcelas) } as never,
    {} as never,
    estoque as never,
    {} as never,
    contasAReceber as never,
  );

  return { service, sessao, estoque, contasAReceber };
}

describe('VendasService — alterar venda', () => {
  it('peça tirada volta ao estoque, com a variação e o custo da venda', async () => {
    const venda = vendaFalsa();
    const { service, sessao, estoque } = montar(venda, [parcelaFalsa(250)]);

    await service.editar('x', { quantidades: [1, 0], desconto: 0 });

    expect(estoque.movimentar).toHaveBeenCalledTimes(2);
    expect(estoque.movimentar).toHaveBeenCalledWith(
      expect.objectContaining({
        produtoId: toalha,
        variacaoId: 'azul',
        tipo: 'devolucao',
        quantidade: 1,
        custoUnitario: 20,
      }),
      sessao,
    );
    expect(estoque.movimentar).toHaveBeenCalledWith(
      expect.objectContaining({
        produtoId: lencol,
        tipo: 'devolucao',
        quantidade: 1,
        custoUnitario: 60,
      }),
      sessao,
    );
  });

  it('fiado em aberto: a parcela encolhe e guarda o abatimento', async () => {
    const venda = vendaFalsa();
    const parcela = parcelaFalsa(250);
    const { service, sessao, contasAReceber } = montar(venda, [parcela]);

    await service.editar('x', {
      quantidades: [1, 1],
      desconto: 0,
      motivo: ' devolveu a toalha ',
    });

    expect(parcela.valor).toBe(200);
    expect(parcela.historico).toEqual([
      expect.objectContaining({
        tipo: 'abatimento',
        valor: 50,
        saldoDepois: 200,
      }),
    ]);
    expect(parcela.save).toHaveBeenCalledWith({ session: sessao });

    expect(venda).toMatchObject({
      total: 200,
      subtotal: 200,
      custoTotal: 80,
      lucro: 120,
      situacao: 'fiado',
      pagamentos: [{ forma: 'fiado', valor: 200, parcelas: 1 }],
    });
    expect(venda.itens).toEqual([
      expect.objectContaining({
        produtoNome: 'Toalha',
        quantidade: 1,
        total: 50,
      }),
      expect.objectContaining({ produtoNome: 'Lençol', quantidade: 1 }),
    ]);
    expect(venda.edicoes).toEqual([
      expect.objectContaining({
        totalAnterior: 250,
        totalNovo: 200,
        abatidoDoFiado: 50,
        devolucoes: [],
        motivo: 'devolveu a toalha',
        itensDevolvidos: [
          {
            produtoNome: 'Toalha',
            variacaoDescricao: 'Azul',
            quantidade: 1,
            valor: 50,
          },
        ],
      }),
    ]);
    expect(venda.save).toHaveBeenCalledWith({ session: sessao });
    // a parcela que estava vencida pode ter mudado: o aviso é revisto
    expect(contasAReceber.revisarAvisoDeFiado).toHaveBeenCalledWith(cliente);
  });

  it('parcela zerada some, e o resto volta pelo Pix', async () => {
    const venda = vendaFalsa({
      pagamentos: [
        { forma: 'pix', valor: 200, parcelas: 1 },
        { forma: 'fiado', valor: 50, parcelas: 1 },
      ],
      situacao: 'parcial',
    });
    const parcela = parcelaFalsa(50);
    const { service, sessao } = montar(venda, [parcela]);

    // tira o lençol (150): 50 saem do fiado, 100 voltam no Pix
    await service.editar('x', { quantidades: [2, 0], desconto: 0 });

    expect(parcela.deleteOne).toHaveBeenCalledWith({ session: sessao });
    expect(parcela.save).not.toHaveBeenCalled();
    expect(venda.pagamentos).toEqual([
      { forma: 'pix', valor: 100, parcelas: 1, acrescimo: 0 },
    ]);
    expect(venda.situacao).toBe('pago');
    expect(venda.edicoes[0]).toMatchObject({
      abatidoDoFiado: 50,
      devolucoes: [{ forma: 'pix', valor: 100 }],
    });
  });

  it('prévia calcula sem gravar nada', async () => {
    const venda = vendaFalsa();
    const parcela = parcelaFalsa(250);
    const { service, estoque } = montar(venda, [parcela]);

    const previa = await service.previaDaEdicao('x', {
      quantidades: [2, 1],
      desconto: 30,
    });

    expect(previa).toMatchObject({
      totalAnterior: 250,
      totalNovo: 220,
      abatidoDoFiado: 30,
      fiadoEmAberto: 220,
      devolucoes: [],
    });
    expect(estoque.movimentar).not.toHaveBeenCalled();
    expect(parcela.save).not.toHaveBeenCalled();
    expect(venda.save).not.toHaveBeenCalled();
    expect(venda.total).toBe(250);
  });

  it('venda dividida: grava o acréscimo que sobrou e guarda o antes e o depois', async () => {
    const venda = vendaFalsa({
      itens: [
        {
          produto: toalha,
          produtoNome: 'Blusa',
          variacao: null,
          variacaoDescricao: null,
          quantidade: 1,
          precoUnitario: 180,
          custoUnitario: 100,
          desconto: 0,
          total: 180,
        },
        {
          produto: lencol,
          produtoNome: 'Calça',
          variacao: null,
          variacaoDescricao: null,
          quantidade: 1,
          precoUnitario: 200,
          custoUnitario: 120,
          desconto: 0,
          total: 200,
        },
      ],
      subtotal: 380,
      acrescimo: 4.21,
      total: 384.21,
      custoTotal: 220,
      pagamentos: [
        { forma: 'dinheiro', valor: 300, parcelas: 1, acrescimo: 0 },
        { forma: 'credito', valor: 84.21, parcelas: 1, acrescimo: 4.21 },
      ],
      situacao: 'pago',
    });
    const { service } = montar(venda, []);

    await service.editar('x', { quantidades: [1, 0], desconto: 0 });

    expect(venda).toMatchObject({ total: 180, acrescimo: 0, subtotal: 180 });
    expect(venda.edicoes[0]).toMatchObject({
      totalAnterior: 384.21,
      totalNovo: 180,
      acrescimoAnterior: 4.21,
      acrescimoNovo: 0,
      devolucoes: [
        { forma: 'credito', valor: 84.21 },
        { forma: 'dinheiro', valor: 120 },
      ],
    });
  });

  it('venda cancelada não é alterada, e nada volta ao estoque', async () => {
    const venda = vendaFalsa({ status: 'cancelada' });
    const { service, estoque } = montar(venda, []);

    await expect(
      service.editar('x', { quantidades: [1, 1], desconto: 0 }),
    ).rejects.toThrow(BadRequestException);
    expect(estoque.movimentar).not.toHaveBeenCalled();
  });
});

/**
 * O registro da venda dividida: itens no preço à vista e o acréscimo do
 * cartão/fiado de cada pagamento somado ao total. O app faz a conta; a
 * API confere o que não tem como estar certo.
 */
describe('VendasService — registrar venda com acréscimo', () => {
  const blusa = new Types.ObjectId();
  const calca = new Types.ObjectId();

  function produto(_id: Types.ObjectId, nome: string, precoVenda: number) {
    return {
      _id,
      nome,
      variacoes: [],
      estoqueAtual: 10,
      controlaEstoque: true,
      unidade: 'un',
      precoVenda,
      precoCredito: precoVenda + 10,
      precoCompra: 100,
    };
  }

  function montarRegistro(clienteDoc: Record<string, unknown> | null = null) {
    const sessao = {
      withTransaction: (fn: () => Promise<void>) => fn(),
      endSession: jest.fn(),
    };
    const criar = jest.fn((docs: Record<string, unknown>[]) =>
      Promise.resolve(docs.map((d) => ({ ...d, _id: new Types.ObjectId() }))),
    );

    const service = new VendasService(
      { startSession: () => Promise.resolve(sessao) } as never,
      {
        create: criar,
        findById: () => consulta({ _id: 'v', toJSON: () => ({}) }),
      } as never,
      {
        find: () =>
          consulta([
            produto(blusa, 'Blusa', 180),
            produto(calca, 'Calça', 200),
          ]),
      } as never,
      { findById: () => consulta(clienteDoc) } as never,
      { find: () => consulta([]), create: jest.fn() } as never,
      { findOne: () => consulta({ permitirVendaSemEstoque: false }) } as never,
      { movimentar: jest.fn() } as never,
      { proximo: () => Promise.resolve(7) } as never,
      {} as never,
    );

    /** o documento que foi para o banco */
    const gravado = () => criar.mock.calls[0][0][0];

    return { service, gravado };
  }

  const itens = [
    { produto: String(blusa), quantidade: 1, precoUnitario: 180 },
    { produto: String(calca), quantidade: 1, precoUnitario: 200 },
  ];

  it('300 em dinheiro e o resto no cartão: itens à vista, acréscimo no total', async () => {
    const { service, gravado } = montarRegistro();

    await service.registrar({
      itens,
      tabelaPreco: 'avista',
      pagamentos: [
        { forma: 'dinheiro', valor: 300 },
        { forma: 'credito', valor: 84.21, acrescimo: 4.21 },
      ],
    });

    expect(gravado()).toMatchObject({
      tabelaPreco: 'avista',
      subtotal: 380,
      acrescimo: 4.21,
      total: 384.21,
      lucro: 184.21,
      pagamentos: [
        { forma: 'dinheiro', valor: 300, parcelas: 1, acrescimo: 0 },
        { forma: 'credito', valor: 84.21, parcelas: 1, acrescimo: 4.21 },
      ],
    });
  });

  it('sem o acréscimo, os pagamentos não fecham com o total', async () => {
    const { service } = montarRegistro();

    await expect(
      service.registrar({
        itens,
        tabelaPreco: 'avista',
        pagamentos: [
          { forma: 'dinheiro', valor: 300 },
          { forma: 'credito', valor: 84.21 },
        ],
      }),
    ).rejects.toThrow('Os pagamentos somam');
  });

  it('acréscimo em dinheiro é recusado', async () => {
    const { service } = montarRegistro();

    await expect(
      service.registrar({
        itens,
        tabelaPreco: 'avista',
        pagamentos: [
          { forma: 'dinheiro', valor: 304.21, acrescimo: 4.21 },
          { forma: 'credito', valor: 80 },
        ],
      }),
    ).rejects.toThrow('só na parte paga no cartão ou no fiado');
  });

  it('acréscimo em cima de itens no preço de cartão é recusado', async () => {
    const { service } = montarRegistro();

    await expect(
      service.registrar({
        itens: itens.map((i) => ({
          ...i,
          precoUnitario: i.precoUnitario + 10,
        })),
        tabelaPreco: 'credito',
        pagamentos: [
          { forma: 'dinheiro', valor: 300 },
          { forma: 'credito', valor: 104.21, acrescimo: 4.21 },
        ],
      }),
    ).rejects.toThrow('cobrada duas vezes');
  });

  it('revendedor não leva acréscimo', async () => {
    const { service } = montarRegistro({
      _id: cliente,
      nome: 'Ana',
      revendedor: true,
    });

    await expect(
      service.registrar({
        cliente: String(cliente),
        itens,
        tabelaPreco: 'avista',
        pagamentos: [
          { forma: 'dinheiro', valor: 300 },
          { forma: 'credito', valor: 84.21, acrescimo: 4.21 },
        ],
      }),
    ).rejects.toThrow('Revendedor');
  });

  it('acréscimo do tamanho do pagamento inteiro é recusado', async () => {
    const { service } = montarRegistro();

    await expect(
      service.registrar({
        itens,
        tabelaPreco: 'avista',
        pagamentos: [
          { forma: 'dinheiro', valor: 380 },
          { forma: 'credito', valor: 4.21, acrescimo: 4.21 },
        ],
      }),
    ).rejects.toThrow(BadRequestException);
  });
});
