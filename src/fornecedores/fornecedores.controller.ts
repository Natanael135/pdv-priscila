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
import {
  AtualizarFornecedorDto,
  CriarFornecedorDto,
} from './fornecedores.dto';
import { FornecedoresService } from './fornecedores.service';

@Controller('fornecedores')
export class FornecedoresController {
  constructor(private readonly service: FornecedoresService) {}

  @Get()
  listar(
    @Query('busca') busca?: string,
    @Query('incluirInativos') incluirInativos?: boolean,
  ) {
    return this.service.listar(busca, incluirInativos);
  }

  @Post()
  criar(@Body() dto: CriarFornecedorDto) {
    return this.service.criar(dto);
  }

  @Get(':id')
  obter(@Param('id') id: string) {
    return this.service.obter(id);
  }

  /** O que se compra dele e quanto já se gastou. */
  @Get(':id/ficha')
  ficha(@Param('id') id: string) {
    return this.service.ficha(id);
  }

  @Patch(':id')
  atualizar(@Param('id') id: string, @Body() dto: AtualizarFornecedorDto) {
    return this.service.atualizar(id, dto);
  }

  /** Sem `definitivo`, apenas desativa — o vínculo dos produtos fica de pé. */
  @Delete(':id')
  @HttpCode(204)
  async remover(
    @Param('id') id: string,
    @Query('definitivo') definitivo?: boolean,
  ) {
    if (definitivo) await this.service.excluir(id);
    else await this.service.desativar(id);
  }
}
