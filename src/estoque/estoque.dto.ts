import {
  IsDateString,
  IsEnum,
  IsIn,
  IsMongoId,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { CAUSAS_DE_BAIXA, TIPOS_MOVIMENTACAO } from './movimentacao.schema';
import type { CausaDeBaixa, TipoMovimentacao } from './movimentacao.schema';

export class MovimentarEstoqueDto {
  @IsEnum(TIPOS_MOVIMENTACAO, {
    message: `tipo deve ser: ${TIPOS_MOVIMENTACAO.join(', ')}`,
  })
  tipo: TipoMovimentacao;

  @IsNumber({}, { message: 'Informe a quantidade' })
  @Min(0, { message: 'A quantidade não pode ser negativa' })
  quantidade: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  custoUnitario?: number;

  /** por que saiu sem venda — só em perda e saída */
  @IsOptional()
  @IsIn(CAUSAS_DE_BAIXA, {
    message: `causa deve ser: ${CAUSAS_DE_BAIXA.join(', ')}`,
  })
  causa?: CausaDeBaixa;

  @IsOptional()
  @IsString()
  motivo?: string;

  /** id da variação, quando o produto tem grade */
  @IsOptional()
  @IsString()
  variacao?: string;

  /** de quem veio esta remessa — só faz sentido em entrada */
  @IsOptional()
  @IsMongoId({ message: 'Fornecedor inválido' })
  fornecedor?: string;
}

/** período do relatório de prejuízo (AAAA-MM-DD, no fuso da loja) */
export class FiltroPerdasDto {
  @IsOptional()
  @IsDateString({}, { message: 'Data inicial inválida' })
  de?: string;

  @IsOptional()
  @IsDateString({}, { message: 'Data final inválida' })
  ate?: string;
}
