import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Cliente, ClienteSchema } from '../clientes/cliente.schema';
import { CONTADOR, ContadorSchema, ContadorService } from '../common/contador.service';
import {
  Configuracao,
  ConfiguracaoSchema,
} from '../configuracoes/configuracao.schema';
import { NotificacoesModule } from '../notificacoes/notificacoes.module';
import { Pedido, PedidoSchema } from '../pedidos/pedido.schema';
import { Produto, ProdutoSchema } from '../produtos/produto.schema';
import { PushModule } from '../push/push.module';
import { LojaController } from './loja.controller';
import { PublicoController } from './publico.controller';
import { PublicoService } from './publico.service';
import { SessaoPublica, SessaoPublicaSchema } from './sessao.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Produto.name, schema: ProdutoSchema },
      { name: Cliente.name, schema: ClienteSchema },
      { name: Pedido.name, schema: PedidoSchema },
      { name: SessaoPublica.name, schema: SessaoPublicaSchema },
      { name: Configuracao.name, schema: ConfiguracaoSchema },
      { name: CONTADOR, schema: ContadorSchema },
    ]),
    PushModule,
    NotificacoesModule,
  ],
  controllers: [PublicoController, LojaController],
  providers: [PublicoService, ContadorService],
})
export class PublicoModule {}
