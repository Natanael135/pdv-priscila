import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsEmail,
  IsIn,
  IsInt,
  IsNumber,
  IsMongoId,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import {
  FORMAS_PAGAMENTO_PEDIDO,
  TIPOS_ENTREGA,
} from '../pedidos/pedido.schema';
import type {
  FormaPagamentoPedido,
  TipoEntrega,
} from '../pedidos/pedido.schema';

/**
 * Entrar com o número, sem senha.
 *
 * Reconhecendo o telefone, a pessoa entra direto e vê os pedidos dela.
 * Não reconhecendo, a API responde 404 e o site pede nome e endereço.
 */
export class EntrarDto {
  @IsString()
  @Matches(/^\d{10,11}$/, {
    message: 'WhatsApp inválido — use DDD + número',
  })
  telefone: string;
}

export class PreCadastroDto {
  /** guardado para preencher sozinho no próximo pedido */
  @IsOptional()
  @IsString()
  @MaxLength(300)
  endereco?: string;

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

/**
 * O que o cliente pode preencher na própria ficha.
 *
 * Só campos vazios são aceitos — ver PublicoService.completarPerfil.
 * Nome e telefone não entram aqui de propósito: são a identidade, e
 * mudá-los pelo site seria trocar de pessoa.
 */
export class CompletarPerfilDto {
  @IsOptional()
  @IsEmail({}, { message: 'E-mail inválido' })
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  endereco?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  documento?: string;
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
  @IsIn(TIPOS_ENTREGA, { message: 'Escolha retirada ou entrega' })
  entrega: TipoEntrega;

  /** exigido quando é entrega — a validação está no service */
  @IsOptional()
  @IsString()
  @MaxLength(300)
  endereco?: string;

  @IsIn(FORMAS_PAGAMENTO_PEDIDO, { message: 'Forma de pagamento inválida' })
  formaPagamento: FormaPagamentoPedido;

  @IsOptional()
  @IsNumber()
  @Min(0)
  trocoPara?: number;

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
