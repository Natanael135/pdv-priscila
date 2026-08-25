import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Venda, VendaSchema } from '../vendas/venda.schema';
import { Caixa, CaixaSchema } from './caixa.schema';
import { CaixaController } from './caixa.controller';
import { CaixaService } from './caixa.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Caixa.name, schema: CaixaSchema },
      { name: Venda.name, schema: VendaSchema },
    ]),
  ],
  controllers: [CaixaController],
  providers: [CaixaService],
  exports: [CaixaService],
})
export class CaixaModule {}
