import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { NotificacoesModule } from '../notificacoes/notificacoes.module';
import { Produto, ProdutoSchema } from '../produtos/produto.schema';
import { EstoqueController } from './estoque.controller';
import { EstoqueService } from './estoque.service';
import { Movimentacao, MovimentacaoSchema } from './movimentacao.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Produto.name, schema: ProdutoSchema },
      { name: Movimentacao.name, schema: MovimentacaoSchema },
    ]),
    NotificacoesModule,
  ],
  controllers: [EstoqueController],
  providers: [EstoqueService],
  exports: [EstoqueService],
})
export class EstoqueModule {}
