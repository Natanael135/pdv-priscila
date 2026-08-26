import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { NotificacoesModule } from '../notificacoes/notificacoes.module';
import { VendasModule } from '../vendas/vendas.module';
import { Pedido, PedidoSchema } from './pedido.schema';
import { PedidosController } from './pedidos.controller';
import { PedidosService } from './pedidos.service';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Pedido.name, schema: PedidoSchema }]),
    VendasModule,
    NotificacoesModule,
  ],
  controllers: [PedidosController],
  providers: [PedidosService],
  exports: [PedidosService],
})
export class PedidosModule {}
