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
import { AtualizarProdutoDto, CriarProdutoDto } from './produtos.dto';
import { ProdutosService } from './produtos.service';
import type { OrdemMargem } from './produtos.service';

@Controller('produtos')
export class ProdutosController {
  constructor(private readonly service: ProdutosService) {}

  @Get()
  listar(
    @Query('busca') busca?: string,
    @Query('categoria') categoria?: string,
    @Query('somenteBaixo') somenteBaixo?: string,
    @Query('incluirInativos') incluirInativos?: string,
  ) {
    return this.service.listar({
      busca,
      categoria,
      somenteBaixo: somenteBaixo === 'true',
      incluirInativos: incluirInativos === 'true',
    });
  }

  /** Tela de margem de lucro por produto. */
  @Get('margens')
  margens(@Query('ordem') ordem?: OrdemMargem) {
    return this.service.margens(ordem ?? 'margemPercentual');
  }

  /** Usado pelo leitor de código de barras da câmera. */
  @Get('codigo/:codigo')
  porCodigo(@Param('codigo') codigo: string) {
    return this.service.porCodigoBarras(codigo);
  }

  @Get(':id')
  obter(@Param('id') id: string) {
    return this.service.obter(id);
  }

  @Get(':id/vendas/contagem')
  async contarVendas(@Param('id') id: string) {
    return { total: await this.service.contarVendas(id) };
  }

  @Post()
  criar(@Body() dto: CriarProdutoDto) {
    return this.service.criar(dto);
  }

  @Patch(':id')
  atualizar(@Param('id') id: string, @Body() dto: AtualizarProdutoDto) {
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
