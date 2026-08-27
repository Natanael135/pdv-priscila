import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { CancelarVendaDto, RegistrarVendaDto } from './vendas.dto';
import { VendasService } from './vendas.service';
import type { OrigemVenda } from './venda.schema';

@Controller('vendas')
export class VendasController {
  constructor(private readonly service: VendasService) {}

  @Get()
  listar(
    @Query('inicio') inicio?: string,
    @Query('fim') fim?: string,
    @Query('cliente') cliente?: string,
    @Query('situacao') situacao?: 'pago' | 'parcial' | 'fiado',
    /** 'catalogo' = veio de pedido pela internet */
    @Query('origem') origem?: OrigemVenda,
    @Query('busca') busca?: string,
    @Query('incluirCanceladas') incluirCanceladas?: string,
    @Query('limite') limite?: string,
  ) {
    return this.service.listar({
      inicio,
      fim,
      cliente,
      situacao,
      origem,
      busca,
      incluirCanceladas: incluirCanceladas === 'true',
      limite: Number(limite) || undefined,
    });
  }

  @Get(':id')
  obter(@Param('id') id: string) {
    return this.service.obter(id);
  }

  @Post()
  registrar(@Body() dto: RegistrarVendaDto) {
    return this.service.registrar(dto);
  }

  @Patch(':id/cancelar')
  cancelar(@Param('id') id: string, @Body() dto: CancelarVendaDto) {
    return this.service.cancelar(id, dto.motivo);
  }

  @Delete(':id')
  @HttpCode(204)
  excluir(@Param('id') id: string) {
    return this.service.excluir(id);
  }
}
