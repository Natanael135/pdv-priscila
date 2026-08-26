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
import { STATUS_PEDIDO } from './pedido.schema';
import type { StatusPedido } from './pedido.schema';
import { PedidosService } from './pedidos.service';

class MotivoDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  motivo?: string;
}

class PagamentoDoPedidoDto {
  @IsString()
  forma: string;

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
