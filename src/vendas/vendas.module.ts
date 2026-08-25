import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Caixa, CaixaSchema } from '../caixa/caixa.schema';
import { Cliente, ClienteSchema } from '../clientes/cliente.schema';
import {
  CONTADOR,
  ContadorSchema,
  ContadorService,
} from '../common/contador.service';
import {
  Configuracao,
  ConfiguracaoSchema,
} from '../configuracoes/configuracao.schema';
import { EstoqueModule } from '../estoque/estoque.module';
import { Parcela, ParcelaSchema } from '../parcelas/parcela.schema';
import { Produto, ProdutoSchema } from '../produtos/produto.schema';
import { Venda, VendaSchema } from './venda.schema';
import { VendasController } from './vendas.controller';
import { VendasService } from './vendas.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Venda.name, schema: VendaSchema },
      { name: Produto.name, schema: ProdutoSchema },
      { name: Cliente.name, schema: ClienteSchema },
      { name: Parcela.name, schema: ParcelaSchema },
      { name: Caixa.name, schema: CaixaSchema },
      { name: Configuracao.name, schema: ConfiguracaoSchema },
      { name: CONTADOR, schema: ContadorSchema },
    ]),
    EstoqueModule,
  ],
  controllers: [VendasController],
  providers: [VendasService, ContadorService],
  exports: [VendasService],
})
export class VendasModule {}
