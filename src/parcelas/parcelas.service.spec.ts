import { BadRequestException } from '@nestjs/common';
import { Types } from 'mongoose';
import { ParcelasService } from './parcelas.service';

/**
 * O recebimento de parcela, com o banco de mentira.
 *
 * O que se prova aqui é a folga de um centavo: parcela arredondada nunca
 * fecha exato (110 em 3 vezes dá 36,67 + 36,67 + 36,66), e a folga
 * precisa valer justo no centavo — em reais, a conta com vírgula errava
 * para um lado ou para o outro conforme o valor.
 */

function parcelaFalsa(valor: number, valorPago = 0) {
  return {
    _id: new Types.ObjectId(),
    venda: new Types.ObjectId(),
    cliente: null,
    valor,
    valorPago,
    pago: false,
    pagoEm: null as Date | null,
    historico: [] as { tipo: string; valor?: number; saldoDepois?: number }[],
    save: jest.fn(),
  };
}

function montar(parcela: ReturnType<typeof parcelaFalsa>) {
  return new ParcelasService(
    {
      findById: () => ({ exec: () => Promise.resolve(parcela) }),
      // ainda há outra parcela em aberto: a venda não muda de situação
      countDocuments: () => ({ exec: () => Promise.resolve(1) }),
    } as never,
    { findByIdAndUpdate: () => ({ exec: () => Promise.resolve(null) }) } as never,
    { limparAvisoDeFiado: jest.fn() } as never,
  );
}

describe('ParcelasService — receber', () => {
  it('falta um centavo: a parcela de 36,67 paga com 36,66 fecha', async () => {
    const parcela = parcelaFalsa(36.67);

    await montar(parcela).receber('x', 36.66);

    expect(parcela.valorPago).toBe(36.66);
    expect(parcela.pago).toBe(true);
    expect(parcela.pagoEm).toBeInstanceOf(Date);
    expect(parcela.save).toHaveBeenCalled();
  });

  it('um centavo acima do saldo é aceito', async () => {
    const parcela = parcelaFalsa(10.2);

    await montar(parcela).receber('x', 10.21);

    expect(parcela.valorPago).toBe(10.21);
    expect(parcela.pago).toBe(true);
  });

  it('dois centavos acima do saldo continuam recusados', async () => {
    const parcela = parcelaFalsa(10.2);

    await expect(montar(parcela).receber('x', 10.22)).rejects.toThrow(
      BadRequestException,
    );
    expect(parcela.save).not.toHaveBeenCalled();
  });

  it('pagamento por conta deixa a parcela em aberto, com o saldo certo', async () => {
    const parcela = parcelaFalsa(36.67);

    await montar(parcela).receber('x', 20);

    expect(parcela.pago).toBe(false);
    expect(parcela.historico).toEqual([
      expect.objectContaining({
        tipo: 'recebimento',
        valor: 20,
        saldoDepois: 16.67,
      }),
    ]);
  });
});
