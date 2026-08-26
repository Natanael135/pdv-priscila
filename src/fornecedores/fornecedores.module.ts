import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  Movimentacao,
  MovimentacaoSchema,
} from '../estoque/movimentacao.schema';
import { Produto, ProdutoSchema } from '../produtos/produto.schema';
import { Fornecedor, FornecedorSchema } from './fornecedor.schema';
import { FornecedoresController } from './fornecedores.controller';
import { FornecedoresService } from './fornecedores.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Fornecedor.name, schema: FornecedorSchema },
      { name: Produto.name, schema: ProdutoSchema },
      { name: Movimentacao.name, schema: MovimentacaoSchema },
    ]),
  ],
  controllers: [FornecedoresController],
  providers: [FornecedoresService],
  exports: [FornecedoresService],
})
export class FornecedoresModule {}
