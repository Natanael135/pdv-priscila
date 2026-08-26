import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsInt,
  IsMongoId,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class PreCadastroDto {
  @IsString()
  @MinLength(2, { message: 'Diga seu nome' })
  @MaxLength(80)
  nome: string;

  /**
   * WhatsApp com DDD, só dígitos depois da limpeza.
   *
   * 10 ou 11 dígitos cobre fixo com DDD e celular com o 9 na frente.
   * É por aqui que a loja responde o pedido, então um número inválido
   * não pode passar: o pedido chegaria sem ninguém para avisar.
   */
  @IsString()
  @Matches(/^\d{10,11}$/, {
    message: 'WhatsApp inválido — use DDD + número, só dígitos',
  })
  telefone: string;
}

export class ItemDoPedidoDto {
  @IsMongoId({ message: 'Produto inválido' })
  produto: string;

  @IsOptional()
  @IsMongoId({ message: 'Variação inválida' })
  variacao?: string | null;

  @IsInt()
  @Min(1)
  quantidade: number;
}

export class CriarPedidoDto {
  @IsArray()
  @ArrayMinSize(1, { message: 'Escolha pelo menos um produto' })
  @ValidateNested({ each: true })
  @Type(() => ItemDoPedidoDto)
  itens: ItemDoPedidoDto[];

  @IsOptional()
  @IsString()
  @MaxLength(300)
  observacao?: string;
}
