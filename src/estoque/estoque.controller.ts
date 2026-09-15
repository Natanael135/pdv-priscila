import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { FiltroPerdasDto, MovimentarEstoqueDto } from './estoque.dto';
import { EstoqueService } from './estoque.service';

@Controller('estoque')
export class EstoqueController {
  constructor(private readonly service: EstoqueService) {}

  @Get('em-falta')
  emFalta() {
    return this.service.emFalta();
  }

  @Get('valor')
  valor() {
    return this.service.valorDoEstoque();
  }

  /**
   * O que saiu sem virar venda, e quanto custou.
   *
   * Fica antes de ':produtoId/movimentacoes' por causa da ordem das
   * rotas: declarada depois, "perdas" seria lido como um id de produto.
   */
  @Get('perdas')
  perdas(@Query() filtro: FiltroPerdasDto) {
    return this.service.perdas(filtro.de, filtro.ate);
  }

  @Get('movimentacoes')
  historicoGeral(@Query('limite') limite?: string) {
    return this.service.historicoGeral(Number(limite) || 100);
  }

  @Get(':produtoId/movimentacoes')
  historico(
    @Param('produtoId') produtoId: string,
    @Query('limite') limite?: string,
  ) {
    return this.service.historico(produtoId, Number(limite) || 50);
  }

  @Post(':produtoId/movimentar')
  movimentar(
    @Param('produtoId') produtoId: string,
    @Body() dto: MovimentarEstoqueDto,
  ) {
    return this.service.movimentar({
      produtoId,
      variacaoId: dto.variacao ?? null,
      tipo: dto.tipo,
      quantidade: dto.quantidade,
      custoUnitario: dto.custoUnitario ?? null,
      causa: dto.causa ?? null,
      motivo: dto.motivo ?? null,
      fornecedorId: dto.fornecedor ?? null,
    });
  }
}
