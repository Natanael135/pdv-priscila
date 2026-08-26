import {
  IsEnum,
  IsMongoId,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { TIPOS_MOVIMENTACAO } from './movimentacao.schema';
import type { TipoMovimentacao } from './movimentacao.schema';

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
