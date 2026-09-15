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

const ORDENS_DE_MARGEM: OrdemMargem[] = [
  'margemPercentual',
  'lucroGerado',
  'quantidadeVendida',
  'nome',
];

@Controller('produtos')
export class ProdutosController {
  constructor(private readonly service: ProdutosService) {}

  @Get()
  listar(
    @Query('busca') busca?: string,
    @Query('categoria') categoria?: string,
    @Query('somenteBaixo') somenteBaixo?: string,
    @Query('incluirInativos') incluirInativos?: string,
    @Query('pagina') pagina?: string,
    @Query('limite') limite?: string,
  ) {
    const filtro = {
      busca,
      categoria,
      somenteBaixo: somenteBaixo === 'true',
      incluirInativos: incluirInativos === 'true',
    };

    /*
     * Com `pagina`, responde { itens, total, temMais }. Sem ela, a lista
     * inteira como sempre foi: o APK já instalado na loja espera isso, e
     * precisa continuar funcionando até ser atualizado.
     */
    if (pagina !== undefined) {
      return this.service.listarPagina(filtro, Number(pagina), Number(limite));
    }
    return this.service.listar(filtro);
  }

  /** Tela de margem de lucro por produto. */
  @Get('margens')
  margens(
    @Query('ordem') ordem?: OrdemMargem,
    @Query('busca') busca?: string,
    @Query('pagina') pagina?: string,
    @Query('limite') limite?: string,
  ) {
    const ordemValida = ORDENS_DE_MARGEM.includes(ordem as OrdemMargem)
      ? (ordem as OrdemMargem)
      : 'margemPercentual';

    if (pagina !== undefined) {
      return this.service.margensPagina(ordemValida, busca, Number(pagina), Number(limite));
    }
    return this.service.margens(ordemValida);
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
