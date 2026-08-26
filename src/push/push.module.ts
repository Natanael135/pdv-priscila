import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  Notificacao,
  NotificacaoSchema,
} from '../notificacoes/notificacao.schema';
import { Dispositivo, DispositivoSchema } from './dispositivo.schema';
import { PushController } from './push.controller';
import { PushService } from './push.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Dispositivo.name, schema: DispositivoSchema },
      { name: Notificacao.name, schema: NotificacaoSchema },
    ]),
  ],
  controllers: [PushController],
  providers: [PushService],
  exports: [PushService],
})
export class PushModule {}
