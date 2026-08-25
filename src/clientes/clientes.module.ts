import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Parcela, ParcelaSchema } from '../parcelas/parcela.schema';
import { Venda, VendaSchema } from '../vendas/venda.schema';
import { Cliente, ClienteSchema } from './cliente.schema';
import { ClientesController } from './clientes.controller';
import { ClientesService } from './clientes.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Cliente.name, schema: ClienteSchema },
      { name: Venda.name, schema: VendaSchema },
      { name: Parcela.name, schema: ParcelaSchema },
    ]),
  ],
  controllers: [ClientesController],
  providers: [ClientesService],
  exports: [ClientesService],
})
export class ClientesModule {}
