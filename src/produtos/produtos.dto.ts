import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsMongoId,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

/** Campo de texto que vem vazio do formulário vira null, não "". */
const vazioVirarNulo = () =>
  Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' && value.trim() === '' ? null : value,
  );

export class CriarProdutoDto {
  @IsString()
  @MinLength(2, { message: 'O nome do produto precisa de pelo menos 2 letras' })
  @MaxLength(120)
  nome: string;

  @IsOptional()
  @vazioVirarNulo()
  @IsString()
  descricao?: string | null;

  @IsOptional()
  @vazioVirarNulo()
  @IsMongoId({ message: 'Categoria inválida' })
  categoria?: string | null;

  @IsOptional()
  @vazioVirarNulo()
  @IsString()
  codigoBarras?: string | null;

  @IsOptional()
  @vazioVirarNulo()
  @IsString()
  fotoUrl?: string | null;

  @IsOptional()
  @vazioVirarNulo()
  @IsString()
  fotoPublicId?: string | null;

  @IsNumber({}, { message: 'Informe o preço de compra' })
  @Min(0, { message: 'O preço de compra não pode ser negativo' })
  precoCompra: number;

  @IsNumber({}, { message: 'Informe o preço de venda' })
  @Min(0, { message: 'O preço de venda não pode ser negativo' })
  precoVenda: number;

  @IsOptional()
  @IsString()
  unidade?: string;

  @IsOptional()
  @IsBoolean()
  controlaEstoque?: boolean;

  /** estoque inicial — vira uma movimentação de entrada no cadastro */
  @IsOptional()
  @IsNumber()
  estoqueAtual?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  estoqueMinimo?: number;
}

export class AtualizarProdutoDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  nome?: string;

  @IsOptional()
  @vazioVirarNulo()
  @IsString()
  descricao?: string | null;

  @IsOptional()
  @vazioVirarNulo()
  @IsMongoId()
  categoria?: string | null;

  @IsOptional()
  @vazioVirarNulo()
  @IsString()
  codigoBarras?: string | null;

  @IsOptional()
  @vazioVirarNulo()
  @IsString()
  fotoUrl?: string | null;

  @IsOptional()
  @vazioVirarNulo()
  @IsString()
  fotoPublicId?: string | null;

  @IsOptional()
  @IsNumber()
  @Min(0)
  precoCompra?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  precoVenda?: number;

  @IsOptional()
  @IsString()
  unidade?: string;

  @IsOptional()
  @IsBoolean()
  controlaEstoque?: boolean;

  @IsOptional()
  @IsNumber()
  @Min(0)
  estoqueMinimo?: number;

  @IsOptional()
  @IsBoolean()
  ativo?: boolean;
}
