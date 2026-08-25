import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { EstoqueModule } from '../estoque/estoque.module';
import { UploadsModule } from '../uploads/uploads.module';
import { Venda, VendaSchema } from '../vendas/venda.schema';
import { Produto, ProdutoSchema } from './produto.schema';
import { ProdutosController } from './produtos.controller';
import { ProdutosService } from './produtos.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Produto.name, schema: ProdutoSchema },
      { name: Venda.name, schema: VendaSchema },
    ]),
    EstoqueModule,
    UploadsModule,
  ],
  controllers: [ProdutosController],
  providers: [ProdutosService],
  exports: [ProdutosService],
})
export class ProdutosModule {}
