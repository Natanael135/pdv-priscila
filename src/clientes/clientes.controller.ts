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
import { AtualizarClienteDto, CriarClienteDto } from './clientes.dto';
import { ClientesService } from './clientes.service';

@Controller('clientes')
export class ClientesController {
  constructor(private readonly service: ClientesService) {}

  @Get()
  listar(
    @Query('busca') busca?: string,
    @Query('incluirInativos') incluirInativos?: string,
  ) {
    return this.service.listar(busca, incluirInativos === 'true');
  }

  @Get('devedores')
  devedores() {
    return this.service.devedores();
  }

  @Get(':id')
  obter(@Param('id') id: string) {
    return this.service.obter(id);
  }

  @Get(':id/historico')
  historico(@Param('id') id: string, @Query('limite') limite?: string) {
    return this.service.historico(id, Number(limite) || 50);
  }

  @Post()
  criar(@Body() dto: CriarClienteDto) {
    return this.service.criar(dto);
  }

  @Patch(':id')
  atualizar(@Param('id') id: string, @Body() dto: AtualizarClienteDto) {
    return this.service.atualizar(id, dto);
  }

  @Patch(':id/desativar')
  desativar(@Param('id') id: string) {
    return this.service.desativar(id);
  }

  @Patch(':id/reativar')
  reativar(@Param('id') id: string) {
    return this.service.reativar(id);
  }

  @Delete(':id')
  @HttpCode(204)
  excluir(@Param('id') id: string) {
    return this.service.excluir(id);
  }
}
