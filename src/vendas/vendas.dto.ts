import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsInt,
  IsMongoId,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { FORMAS_PAGAMENTO } from './venda.schema';
import type { FormaPagamento } from './venda.schema';

export class ItemVendaDto {
  @IsMongoId({ message: 'Produto inválido' })
  produto: string;

  /** obrigatório quando o produto tem grade de cor/tamanho */
  @IsOptional()
  @IsMongoId({ message: 'Variação inválida' })
  variacao?: string;

  @IsNumber({}, { message: 'Informe a quantidade' })
  @IsPositive({ message: 'A quantidade precisa ser maior que zero' })
  quantidade: number;

  /** permite vender fora do preço de tabela sem mexer no cadastro */
  @IsOptional()
  @IsNumber()
  @Min(0)
  precoUnitario?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  desconto?: number;
}

export class PagamentoVendaDto {
  @IsEnum(FORMAS_PAGAMENTO, {
    message: `forma deve ser: ${FORMAS_PAGAMENTO.join(', ')}`,
  })
  forma: FormaPagamento;

  @IsNumber({}, { message: 'Informe o valor do pagamento' })
  @IsPositive({ message: 'O valor do pagamento precisa ser maior que zero' })
  valor: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  parcelas?: number;
}

/**
 * Uma venda inteira num payload só.
 *
 * pagamentos é uma LISTA — é isso que permite "50 no Pix e 50 no
 * crédito em 3x": duas entradas, cada uma com sua forma.
 */
export class RegistrarVendaDto {
  @IsOptional()
  @IsMongoId()
  cliente?: string | null;

  @IsArray()
  @ArrayMinSize(1, { message: 'A venda precisa de pelo menos um item' })
  @ValidateNested({ each: true })
  @Type(() => ItemVendaDto)
  itens: ItemVendaDto[];

  @IsArray()
  @ArrayMinSize(1, { message: 'Informe ao menos uma forma de pagamento' })
  @ValidateNested({ each: true })
  @Type(() => PagamentoVendaDto)
  pagamentos: PagamentoVendaDto[];

  /** desconto sobre o total da venda, em R$ */
  @IsOptional()
  @IsNumber()
  @Min(0, { message: 'O desconto não pode ser negativo' })
  desconto?: number;

  @IsOptional()
  @IsString()
  observacao?: string;

  /** vencimento da 1ª parcela do fiado; sem isso usa o padrão da loja */
  @IsOptional()
  @IsDateString({}, { message: 'Data de vencimento inválida' })
  vencimentoFiado?: string;
}

export class CancelarVendaDto {
  @IsOptional()
  @IsString()
  motivo?: string;
}
