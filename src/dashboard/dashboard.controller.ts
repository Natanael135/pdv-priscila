import { Controller, Get, Query } from '@nestjs/common';
import { DashboardService } from './dashboard.service';

@Controller('dashboard')
export class DashboardController {
  constructor(private readonly service: DashboardService) {}

  /** Dashboard inteiro numa chamada só — uma ida à rede, não sete. */
  /** a tela que abre o app: o que precisa de atenção hoje */
  @Get('visao-geral')
  visaoGeral() {
    return this.service.visaoGeral();
  }

  @Get()
  resumo(@Query('inicio') inicio?: string, @Query('fim') fim?: string) {
    return this.service.resumo(inicio, fim);
  }
}
