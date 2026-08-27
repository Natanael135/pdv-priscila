import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { FORMAS_PAGAMENTO } from '../vendas/venda.schema';
import type { FormaPagamento } from '../vendas/venda.schema';
import { STATUS_PEDIDO } from './pedido.schema';
import type { StatusPedido } from './pedido.schema';
import { PedidosService } from './pedidos.service';

class MudarStatusDto {
  @IsIn(STATUS_PEDIDO, { message: 'Estado de pedido inválido' })
  status: StatusPedido;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  motivo?: string;
}

class MotivoDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  motivo?: string;
}

class PagamentoDoPedidoDto {
  /**
   * Lista fechada, não texto livre.
   *
   * Aceitando string, "pix " com espaço chegava até o Mongo para ser
   * recusado lá — com uma mensagem que não ajuda quem está fechando a
   * venda com o cliente na frente.
   */
  @IsIn(FORMAS_PAGAMENTO, { message: 'Forma de pagamento inválida' })
  forma: FormaPagamento;

  @IsNumber()
  @Min(0)
  valor: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  parcelas?: number;
}

class ConcluirPedidoDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PagamentoDoPedidoDto)
  pagamentos: PagamentoDoPedidoDto[];

  @IsOptional()
  @IsNumber()
  @Min(0)
  desconto?: number;

  @IsOptional()
  @IsDateString()
  vencimentoFiado?: string;
}

/** Lado da LOJA. O cliente usa /publico — ver PublicoController. */
@Controller('pedidos')
export class PedidosController {
  constructor(private readonly service: PedidosService) {}

  @Get()
  listar(
    @Query('status') status?: StatusPedido,
    @Query('pendentes') pendentes?: boolean,
  ) {
    return this.service.listar({
      status: STATUS_PEDIDO.includes(status as StatusPedido) ? status : undefined,
      pendentes,
    });
  }

  @Get('novos')
  contarNovos() {
    return this.service.contarNovos();
  }

  @Get(':id')
  obter(@Param('id') id: string) {
    return this.service.obter(id);
  }

  @Patch(':id/visto')
  marcarVisto(@Param('id') id: string) {
    return this.service.marcarVisto(id);
  }

  /** Avança o acompanhamento: aceito → preparando → a caminho/pronto. */
  @Patch(':id/status')
  mudarStatus(@Param('id') id: string, @Body() dto: MudarStatusDto) {
    return this.service.mudarStatus(id, dto.status, dto.motivo);
  }

  @Patch(':id/aceitar')
  aceitar(@Param('id') id: string) {
    return this.service.aceitar(id);
  }

  @Patch(':id/recusar')
  recusar(@Param('id') id: string, @Body() dto: MotivoDto) {
    return this.service.recusar(id, dto.motivo);
  }

  @Patch(':id/cancelar')
  cancelar(@Param('id') id: string, @Body() dto: MotivoDto) {
    return this.service.cancelar(id, dto.motivo);
  }

  @Post(':id/concluir')
  concluir(@Param('id') id: string, @Body() dto: ConcluirPedidoDto) {
    return this.service.concluir(id, dto);
  }
}
