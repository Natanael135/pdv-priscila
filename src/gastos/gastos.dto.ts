import {
  IsBoolean,
  IsDateString,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { CATEGORIAS_GASTO } from './gasto.schema';
import type { CategoriaGasto } from './gasto.schema';

export class CriarGastoDto {
  @IsString()
  @MinLength(2, { message: 'Diga do que é o gasto' })
  @MaxLength(120)
  descricao: string;

  @IsIn(CATEGORIAS_GASTO, { message: 'Categoria de gasto inválida' })
  categoria: CategoriaGasto;

  @IsNumber({}, { message: 'Informe o valor' })
  @Min(0, { message: 'O valor não pode ser negativo' })
  valor: number;

  @IsDateString({}, { message: 'Data inválida' })
  data: string;

  @IsOptional()
  @IsBoolean()
  pago?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  observacao?: string;
}

export class AtualizarGastoDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  descricao?: string;

  @IsOptional()
  @IsIn(CATEGORIAS_GASTO)
  categoria?: CategoriaGasto;

  @IsOptional()
  @IsNumber()
  @Min(0)
  valor?: number;

  @IsOptional()
  @IsDateString()
  data?: string;

  @IsOptional()
  @IsBoolean()
  pago?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  observacao?: string;
}

export class CriarRecorrenteDto {
  @IsString()
  @MinLength(2, { message: 'Diga do que é o gasto' })
  @MaxLength(120)
  descricao: string;

  @IsIn(CATEGORIAS_GASTO, { message: 'Categoria de gasto inválida' })
  categoria: CategoriaGasto;

  @IsNumber({}, { message: 'Informe o valor' })
  @Min(0)
  valor: number;

  /** até 28: dia 30 não existe em fevereiro (ver o schema) */
  @IsNumber({}, { message: 'Informe o dia do vencimento' })
  @Min(1)
  @Max(28, { message: 'Use um dia de 1 a 28 — assim ele existe em todo mês' })
  diaDoMes: number;

  @IsOptional()
  @IsBoolean()
  ativo?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  observacao?: string;
}
