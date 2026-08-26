import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
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
    ]),
  ],
  controllers: [GastosController],
  providers: [GastosService],
  exports: [GastosService],
})
export class GastosModule {}
