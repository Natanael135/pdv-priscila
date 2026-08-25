import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Configuracao, ConfiguracaoSchema } from './configuracao.schema';
import { ConfiguracoesController } from './configuracoes.controller';
import { ConfiguracoesService } from './configuracoes.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Configuracao.name, schema: ConfiguracaoSchema },
    ]),
  ],
  controllers: [ConfiguracoesController],
  providers: [ConfiguracoesService],
  exports: [ConfiguracoesService],
})
export class ConfiguracoesModule {}
