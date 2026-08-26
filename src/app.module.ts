import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { CategoriasModule } from './categorias/categorias.module';
import { ClientesModule } from './clientes/clientes.module';
import { ConfiguracoesModule } from './configuracoes/configuracoes.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { EstoqueModule } from './estoque/estoque.module';
import { HealthController } from './health/health.controller';
import { NotificacoesModule } from './notificacoes/notificacoes.module';
import { PushModule } from './push/push.module';
import { ParcelasModule } from './parcelas/parcelas.module';
import { ProdutosModule } from './produtos/produtos.module';
import { UploadsModule } from './uploads/uploads.module';
import { VendasModule } from './vendas/vendas.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),

    MongooseModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const uri = config.get<string>('MONGODB_URI');

        if (!uri || uri.includes('COLE-SEU-CLUSTER-AQUI')) {
          throw new Error(
            'MONGODB_URI não configurada.\n' +
              'Abra api/.env e cole a connection string do Atlas ' +
              '(Database → Connect → Drivers).',
          );
        }

        return {
          uri,
          // falha rápido em vez de pendurar a tela do app por 30s quando
          // o IP não está liberado no Network Access do Atlas
          serverSelectionTimeoutMS: 10000,
        };
      },
    }),

    CategoriasModule,
    ProdutosModule,
    ClientesModule,
    VendasModule,
    ParcelasModule,
    EstoqueModule,
    DashboardModule,
    NotificacoesModule,
    PushModule,
    ConfiguracoesModule,
    UploadsModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
