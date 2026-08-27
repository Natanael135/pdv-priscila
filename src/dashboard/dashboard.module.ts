import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { GastosModule } from '../gastos/gastos.module';
import { Parcela, ParcelaSchema } from '../parcelas/parcela.schema';
import { Pedido, PedidoSchema } from '../pedidos/pedido.schema';
import { Produto, ProdutoSchema } from '../produtos/produto.schema';
import { Venda, VendaSchema } from '../vendas/venda.schema';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';

@Module({
  imports: [
    GastosModule,
    MongooseModule.forFeature([
      { name: Venda.name, schema: VendaSchema },
      { name: Produto.name, schema: ProdutoSchema },
      { name: Parcela.name, schema: ParcelaSchema },
      { name: Pedido.name, schema: PedidoSchema },
    ]),
  ],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
