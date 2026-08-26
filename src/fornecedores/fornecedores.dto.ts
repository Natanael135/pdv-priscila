import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEmail,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

/** Campo de texto que vem vazio do formulário vira null, não "". */
const vazioVirarNulo = () =>
  Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' && value.trim() === '' ? null : value,
  );

export class CriarFornecedorDto {
  @IsString()
  @MinLength(2, { message: 'O nome do fornecedor precisa de pelo menos 2 letras' })
  @MaxLength(120)
  nome: string;

  @IsOptional()
  @vazioVirarNulo()
  @IsString()
  @MaxLength(80)
  contato?: string | null;

  @IsOptional()
  @vazioVirarNulo()
  @IsString()
  @MaxLength(20)
  telefone?: string | null;

  @IsOptional()
  @vazioVirarNulo()
  @IsEmail({}, { message: 'E-mail inválido' })
  email?: string | null;

  @IsOptional()
  @vazioVirarNulo()
  @IsString()
  @MaxLength(20)
  documento?: string | null;

  @IsOptional()
  @vazioVirarNulo()
  @IsString()
  @MaxLength(200)
  endereco?: string | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(365, { message: 'Prazo de entrega em dias — 365 já é um ano' })
  prazoEntregaDias?: number | null;

  @IsOptional()
  @vazioVirarNulo()
  @IsString()
  @MaxLength(500)
  observacoes?: string | null;
}

export class AtualizarFornecedorDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  nome?: string;

  @IsOptional()
  @vazioVirarNulo()
  @IsString()
  @MaxLength(80)
  contato?: string | null;

  @IsOptional()
  @vazioVirarNulo()
  @IsString()
  @MaxLength(20)
  telefone?: string | null;

  @IsOptional()
  @vazioVirarNulo()
  @IsEmail({}, { message: 'E-mail inválido' })
  email?: string | null;

  @IsOptional()
  @vazioVirarNulo()
  @IsString()
  @MaxLength(20)
  documento?: string | null;

  @IsOptional()
  @vazioVirarNulo()
  @IsString()
  @MaxLength(200)
  endereco?: string | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(365)
  prazoEntregaDias?: number | null;

  @IsOptional()
  @vazioVirarNulo()
  @IsString()
  @MaxLength(500)
  observacoes?: string | null;

  @IsOptional()
  @IsBoolean()
  ativo?: boolean;
}
