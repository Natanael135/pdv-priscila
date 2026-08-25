import {
  IsBoolean,
  IsHexColor,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CriarCategoriaDto {
  @IsString()
  @MinLength(2, { message: 'O nome da categoria precisa de pelo menos 2 letras' })
  @MaxLength(40)
  nome: string;

  @IsOptional()
  @IsHexColor({ message: 'A cor precisa estar no formato #RRGGBB' })
  cor?: string;

  @IsOptional()
  @IsString()
  icone?: string;

  @IsOptional()
  @IsInt()
  ordem?: number;
}

export class AtualizarCategoriaDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(40)
  nome?: string;

  @IsOptional()
  @IsHexColor()
  cor?: string;

  @IsOptional()
  @IsString()
  icone?: string;

  @IsOptional()
  @IsInt()
  ordem?: number;

  @IsOptional()
  @IsBoolean()
  ativo?: boolean;
}
