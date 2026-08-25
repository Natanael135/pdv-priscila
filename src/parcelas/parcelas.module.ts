import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { NotificacoesModule } from '../notificacoes/notificacoes.module';
import { Venda, VendaSchema } from '../vendas/venda.schema';
import { Parcela, ParcelaSchema } from './parcela.schema';
import { ParcelasController } from './parcelas.controller';
import { ParcelasService } from './parcelas.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Parcela.name, schema: ParcelaSchema },
      { name: Venda.name, schema: VendaSchema },
    ]),
    NotificacoesModule,
  ],
  controllers: [ParcelasController],
  providers: [ParcelasService],
  exports: [ParcelasService],
})
export class ParcelasModule {}
