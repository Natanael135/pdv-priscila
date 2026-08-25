import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsMongoId,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

/** Campo de texto que vem vazio do formulário vira null, não "". */
export class VariacaoDto {
  /** presente ao editar; ausente cria uma variação nova */
  @IsOptional()
  @IsString()
  id?: string;

  @IsOptional()
  @IsString()
  cor?: string | null;

  @IsOptional()
  @IsString()
  tamanho?: string | null;

  @IsOptional()
  @IsString()
  codigoBarras?: string | null;

  @IsOptional()
  @IsNumber()
  estoqueAtual?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  estoqueMinimo?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  precoVenda?: number | null;

  @IsOptional()
  @IsBoolean()
  ativo?: boolean;
}

export class FotoDto {
  @IsString()
  url: string;

  @IsString()
  publicId: string;
}

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
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FotoDto)
  fotos?: FotoDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => VariacaoDto)
  variacoes?: VariacaoDto[];

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
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FotoDto)
  fotos?: FotoDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => VariacaoDto)
  variacoes?: VariacaoDto[];

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
