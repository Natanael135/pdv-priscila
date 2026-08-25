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
import { AtualizarCategoriaDto, CriarCategoriaDto } from './categorias.dto';
import { CategoriasService } from './categorias.service';

@Controller('categorias')
export class CategoriasController {
  constructor(private readonly service: CategoriasService) {}

  @Get()
  listar(@Query('incluirInativas') incluirInativas?: string) {
    return this.service.listar(incluirInativas === 'true');
  }

  @Get(':id')
  obter(@Param('id') id: string) {
    return this.service.obter(id);
  }

  @Get(':id/produtos/contagem')
  async contarProdutos(@Param('id') id: string) {
    return { total: await this.service.contarProdutos(id) };
  }

  @Post()
  criar(@Body() dto: CriarCategoriaDto) {
    return this.service.criar(dto);
  }

  @Patch(':id')
  atualizar(@Param('id') id: string, @Body() dto: AtualizarCategoriaDto) {
    return this.service.atualizar(id, dto);
  }

  @Patch(':id/desativar')
  @HttpCode(204)
  desativar(@Param('id') id: string) {
    return this.service.desativar(id);
  }

  /**
   * ?moverPara=<id>  move os produtos para outra categoria
   * ?moverPara=      (vazio) deixa os produtos sem categoria
   * sem o parâmetro  recusa a exclusão se houver produtos
   */
  @Delete(':id')
  @HttpCode(204)
  excluir(@Param('id') id: string, @Query('moverPara') moverPara?: string) {
    return this.service.excluir(id, moverPara === undefined ? undefined : moverPara || null);
  }
}
