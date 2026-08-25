import dayjs from 'dayjs';
import timezone from 'dayjs/plugin/timezone';
import utc from 'dayjs/plugin/utc';

dayjs.extend(utc);
dayjs.extend(timezone);

/**
 * Fuso da loja.
 *
 * Fixo de propósito, e não "o fuso do servidor": a API pode acabar
 * hospedada em qualquer lugar (Render e Railway rodam em UTC), enquanto
 * o dia comercial é sempre o de São Paulo.
 *
 * Sem isto, uma venda das 21h30 seria gravada como 00h30 do dia
 * seguinte em UTC e entraria no relatório do dia errado — justo no
 * horário de maior movimento. O faturamento "de hoje" ficaria faltando
 * as últimas horas da noite, e o "melhor dia" mudaria sozinho conforme
 * o servidor.
 */
export const FUSO_DA_LOJA = 'America/Sao_Paulo';

/** Início do dia (00:00) no fuso da loja, como Date em UTC. */
export function inicioDoDia(data: string | Date): Date {
  return dayjs.tz(dayjs(data).format('YYYY-MM-DD'), FUSO_DA_LOJA).startOf('day').toDate();
}

/** Fim do dia (23:59:59.999) no fuso da loja, como Date em UTC. */
export function fimDoDia(data: string | Date): Date {
  return dayjs.tz(dayjs(data).format('YYYY-MM-DD'), FUSO_DA_LOJA).endOf('day').toDate();
}

/** A data de hoje (AAAA-MM-DD) segundo o relógio da loja. */
export function hojeNaLoja(): string {
  return dayjs().tz(FUSO_DA_LOJA).format('YYYY-MM-DD');
}

/** Converte um instante para a data (AAAA-MM-DD) do dia comercial. */
export function diaDaLoja(data: string | Date): string {
  return dayjs(data).tz(FUSO_DA_LOJA).format('YYYY-MM-DD');
}
