import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Parcela, ParcelaSchema } from '../parcelas/parcela.schema';
import { Produto, ProdutoSchema } from '../produtos/produto.schema';
import { Venda, VendaSchema } from '../vendas/venda.schema';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Venda.name, schema: VendaSchema },
      { name: Produto.name, schema: ProdutoSchema },
      { name: Parcela.name, schema: ParcelaSchema },
    ]),
  ],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
