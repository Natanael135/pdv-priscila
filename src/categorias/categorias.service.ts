import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Produto } from '../produtos/produto.schema';
import { Categoria, CategoriaDocument } from './categoria.schema';
import { AtualizarCategoriaDto, CriarCategoriaDto } from './categorias.dto';

@Injectable()
export class CategoriasService {
  constructor(
    @InjectModel(Categoria.name)
    private readonly modelo: Model<CategoriaDocument>,
    @InjectModel(Produto.name)
    private readonly produtos: Model<Produto>,
  ) {}

  listar(incluirInativas = false) {
    const filtro = incluirInativas ? {} : { ativo: true };
    return this.modelo.find(filtro).sort({ ordem: 1, nome: 1 }).exec();
  }

  async obter(id: string) {
    const categoria = await this.modelo.findById(id).exec();
    if (!categoria) throw new NotFoundException('Categoria não encontrada');
    return categoria;
  }

  async criar(dto: CriarCategoriaDto) {
    const existente = await this.modelo
      .findOne({ nome: new RegExp(`^${escapar(dto.nome)}$`, 'i') })
      .exec();

    if (existente) {
      // categoria desativada com o mesmo nome: reaproveita em vez de
      // recusar o cadastro por causa de algo que a pessoa não vê na tela
      if (!existente.ativo) {
        existente.set({ ...dto, ativo: true });
        return existente.save();
      }
      throw new ConflictException(`Já existe a categoria "${existente.nome}"`);
    }

    return this.modelo.create(dto);
  }

  async atualizar(id: string, dto: AtualizarCategoriaDto) {
    const categoria = await this.modelo
      .findByIdAndUpdate(id, dto, { returnDocument: 'after' })
      .exec();

    if (!categoria) throw new NotFoundException('Categoria não encontrada');
    return categoria;
  }

  /** Quantos produtos ativos dependem desta categoria. */
  async contarProdutos(id: string) {
    return this.produtos.countDocuments({ categoria: id, ativo: true }).exec();
  }

  /** Tira da lista sem apagar — produtos antigos continuam apontando. */
  async desativar(id: string) {
    await this.atualizar(id, { ativo: false });
  }

  /**
   * Exclusão definitiva. Se ainda houver produto na categoria, o app
   * precisa dizer para onde eles vão: sem isso, sobrariam produtos
   * apontando para uma categoria que não existe mais.
   */
  async excluir(id: string, moverPara?: string | null) {
    const emUso = await this.contarProdutos(id);

    if (emUso > 0) {
      if (moverPara === undefined) {
        throw new BadRequestException(
          `Esta categoria tem ${emUso} produto${emUso > 1 ? 's' : ''}. ` +
            'Escolha para qual categoria mover antes de excluir.',
        );
      }

      if (moverPara) await this.obter(moverPara); // valida o destino

      await this.produtos
        .updateMany({ categoria: id }, { categoria: moverPara ?? null })
        .exec();
    }

    const removida = await this.modelo.findByIdAndDelete(id).exec();
    if (!removida) throw new NotFoundException('Categoria não encontrada');
  }
}

/** Escapa o que o usuário digitou antes de virar RegExp de busca. */
function escapar(texto: string) {
  return texto.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
