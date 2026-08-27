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
import { hojeNaLoja } from '../common/fuso';
import type { CategoriaGasto } from './gasto.schema';
import {
  AtualizarGastoDto,
  CriarGastoDto,
  CriarRecorrenteDto,
} from './gastos.dto';
import { GastosService } from './gastos.service';

@Controller('gastos')
export class GastosController {
  constructor(private readonly service: GastosService) {}

  /*
   * As rotas fixas vêm antes de ':id'. O Nest casa na ordem de
   * declaração, e "recorrentes" seria engolido como um id.
   */

  @Get('recorrentes')
  listarRecorrentes(@Query('incluirInativos') incluirInativos?: boolean) {
    return this.service.listarRecorrentes(incluirInativos);
  }

  @Post('recorrentes')
  criarRecorrente(@Body() dto: CriarRecorrenteDto) {
    return this.service.criarRecorrente(dto);
  }

  @Patch('recorrentes/:id')
  atualizarRecorrente(
    @Param('id') id: string,
    @Body() dto: Partial<CriarRecorrenteDto>,
  ) {
    return this.service.atualizarRecorrente(id, dto);
  }

  @Delete('recorrentes/:id')
  desativarRecorrente(
    @Param('id') id: string,
    @Query('definitivo') definitivo?: boolean,
  ) {
    // definitivo só passa se o molde nunca tiver gerado lançamento
    return definitivo
      ? this.service.excluirRecorrente(id)
      : this.service.desativarRecorrente(id);
  }

  @Post('gerar')
  gerarDoMes(@Body('mes') mes?: string) {
    return this.service.gerarDoMes(mes);
  }

  @Get('resumo')
  resumo(@Query('de') de?: string, @Query('ate') ate?: string) {
    const hoje = hojeNaLoja();
    // sem período, o mês corrente — que é o que a tela abre mostrando
    return this.service.resumo(de ?? hoje.slice(0, 7) + '-01', ate ?? hoje);
  }

  /** Quantas peças precisam sair no mês para a loja se pagar. */
  @Get('ponto-equilibrio')
  pontoDeEquilibrio() {
    return this.service.pontoDeEquilibrio();
  }

  @Get('vencidos')
  vencidos() {
    return this.service.vencidos();
  }

  @Get()
  listar(
    @Query('de') de?: string,
    @Query('ate') ate?: string,
    @Query('categoria') categoria?: CategoriaGasto,
    @Query('somenteAbertos') somenteAbertos?: boolean,
  ) {
    return this.service.listar({ de, ate, categoria, somenteAbertos });
  }

  @Post()
  criar(@Body() dto: CriarGastoDto) {
    return this.service.criar(dto);
  }

  @Get(':id')
  obter(@Param('id') id: string) {
    return this.service.obter(id);
  }

  @Patch(':id')
  atualizar(@Param('id') id: string, @Body() dto: AtualizarGastoDto) {
    return this.service.atualizar(id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  excluir(@Param('id') id: string) {
    return this.service.excluir(id);
  }
}
