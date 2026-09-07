import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEmail,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

const vazioVirarNulo = () =>
  Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' && value.trim() === '' ? null : value,
  );

export class CriarClienteDto {
  @IsString()
  @MinLength(2, { message: 'O nome precisa de pelo menos 2 letras' })
  @MaxLength(120)
  nome: string;

  @IsOptional()
  @vazioVirarNulo()
  @IsString()
  telefone?: string | null;

  @IsOptional()
  @vazioVirarNulo()
  @IsEmail({}, { message: 'E-mail inválido' })
  email?: string | null;

  @IsOptional()
  @vazioVirarNulo()
  @IsString()
  documento?: string | null;

  @IsOptional()
  @vazioVirarNulo()
  @IsString()
  endereco?: string | null;

  @IsOptional()
  @vazioVirarNulo()
  @IsString()
  observacoes?: string | null;

  /** teto de fiado; 0 = sem limite */
  @IsOptional()
  @IsNumber()
  @Min(0)
  limiteFiado?: number;

  /**
   * Compra para revender: leva pelo preço de atacado, em toda venda.
   *
   * Só a lojista marca — o cadastro do site não expõe este campo.
   */
  @IsOptional()
  @IsBoolean()
  revendedor?: boolean;
}

export class AtualizarClienteDto extends CriarClienteDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  declare nome: string;

  @IsOptional()
  @IsBoolean()
  ativo?: boolean;
}
