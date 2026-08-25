import {
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Query,
} from '@nestjs/common';
import { NotificacoesService } from './notificacoes.service';

@Controller('notificacoes')
export class NotificacoesController {
  constructor(private readonly service: NotificacoesService) {}

  @Get()
  listar(@Query('incluirLidas') incluirLidas?: string) {
    return this.service.listar(incluirLidas === 'true');
  }

  @Get('nao-lidas')
  async contar() {
    return { total: await this.service.contarNaoLidas() };
  }

  @Patch('todas/lidas')
  marcarTodas() {
    return this.service.marcarTodasComoLidas();
  }

  @Patch(':id/lida')
  marcar(@Param('id') id: string) {
    return this.service.marcarComoLida(id);
  }

  @Delete(':id')
  @HttpCode(204)
  excluir(@Param('id') id: string) {
    return this.service.excluir(id);
  }
}
