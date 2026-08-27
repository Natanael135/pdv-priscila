import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Produto, ProdutoSchema } from '../produtos/produto.schema';
import { Venda, VendaSchema } from '../vendas/venda.schema';
import {
  Gasto,
  GastoRecorrente,
  GastoRecorrenteSchema,
  GastoSchema,
} from './gasto.schema';
import { GastosController } from './gastos.controller';
import { GastosService } from './gastos.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Gasto.name, schema: GastoSchema },
      { name: GastoRecorrente.name, schema: GastoRecorrenteSchema },
      // só leitura: o ponto de equilíbrio precisa do que foi vendido
      { name: Venda.name, schema: VendaSchema },
      { name: Produto.name, schema: ProdutoSchema },
    ]),
  ],
  controllers: [GastosController],
  providers: [GastosService],
  exports: [GastosService],
})
export class GastosModule {}
