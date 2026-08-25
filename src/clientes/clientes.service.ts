import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, QueryFilter, Types } from 'mongoose';
import { Parcela } from '../parcelas/parcela.schema';
import { Venda } from '../vendas/venda.schema';
import { Cliente, ClienteDocument } from './cliente.schema';
import { AtualizarClienteDto, CriarClienteDto } from './clientes.dto';

interface ResumoCompras {
  _id: Types.ObjectId;
  totalCompras: number;
  numCompras: number;
  ultimaCompra: Date;
}

interface ResumoDivida {
  _id: Types.ObjectId;
  deve: number;
  parcelasAbertas: number;
}

@Injectable()
export class ClientesService {
  constructor(
    @InjectModel(Cliente.name)
    private readonly modelo: Model<ClienteDocument>,
    @InjectModel(Venda.name) private readonly vendas: Model<Venda>,
    @InjectModel(Parcela.name) private readonly parcelas: Model<Parcela>,
  ) {}

  async listar(busca?: string, incluirInativos = false) {
    const query: QueryFilter<ClienteDocument> = {};
    if (!incluirInativos) query.ativo = true;

    if (busca?.trim()) {
      const termo = escapar(busca.trim());
      query.$or = [
        { nome: new RegExp(termo, 'i') },
        { telefone: new RegExp(termo, 'i') },
      ];
    }

    const clientes = await this.modelo.find(query).sort({ nome: 1 }).exec();
    return this.enriquecer(clientes);
  }

  async obter(id: string) {
    const cliente = await this.modelo.findById(id).exec();
    if (!cliente) throw new NotFoundException('Cliente não encontrado');

    const [enriquecido] = await this.enriquecer([cliente]);
    return enriquecido;
  }

  /** Só quem está devendo — atalho da tela de cobrança. */
  async devedores() {
    const todos = await this.listar();
    return todos
      .filter((c) => c.deve > 0)
      .sort((a, b) => b.deve - a.deve);
  }

  historico(id: string, limite = 50) {
    return this.vendas
      .find({ cliente: id })
      .sort({ data: -1 })
      .limit(limite)
      .exec();
  }

  async criar(dto: CriarClienteDto) {
    // telefone repetido quase sempre é a mesma pessoa cadastrada de novo
    if (dto.telefone) {
      const existente = await this.modelo
        .findOne({ telefone: dto.telefone, ativo: true })
        .exec();

      if (existente) {
        throw new ConflictException(
          `Este telefone já está no cliente "${existente.nome}"`,
        );
      }
    }

    const cliente = await this.modelo.create(dto);
    return this.obter(String(cliente._id));
  }

  async atualizar(id: string, dto: AtualizarClienteDto) {
    const cliente = await this.modelo
      .findByIdAndUpdate(id, dto, { new: true })
      .exec();

    if (!cliente) throw new NotFoundException('Cliente não encontrado');

    // o nome fica copiado na venda e na parcela para as listas não
    // dependerem de popular; ao renomear, atualizamos as cópias
    if (dto.nome) {
      await Promise.all([
        this.vendas.updateMany({ cliente: id }, { clienteNome: dto.nome }).exec(),
        this.parcelas
          .updateMany(
            { cliente: id },
            { clienteNome: dto.nome, clienteTelefone: cliente.telefone },
          )
          .exec(),
      ]);
    }

    return this.obter(id);
  }

  async desativar(id: string) {
    const cliente = await this.modelo
      .findByIdAndUpdate(id, { ativo: false }, { new: true })
      .exec();

    if (!cliente) throw new NotFoundException('Cliente não encontrado');
    return this.obter(id);
  }

  async reativar(id: string) {
    const cliente = await this.modelo
      .findByIdAndUpdate(id, { ativo: true }, { new: true })
      .exec();

    if (!cliente) throw new NotFoundException('Cliente não encontrado');
    return this.obter(id);
  }

  /**
   * Exclusão definitiva. Barrada em dois casos: cliente devendo (some a
   * cobrança junto) e cliente com histórico de compras (as vendas
   * ficariam órfãs).
   */
  async excluir(id: string) {
    const cliente = await this.modelo.findById(id).exec();
    if (!cliente) throw new NotFoundException('Cliente não encontrado');

    const [emAberto, compras] = await Promise.all([
      this.parcelas.countDocuments({ cliente: id, pago: false }).exec(),
      this.vendas.countDocuments({ cliente: id }).exec(),
    ]);

    if (emAberto > 0) {
      throw new ConflictException(
        'Este cliente tem fiado em aberto. Receba ou cancele a dívida antes de excluir.',
      );
    }

    if (compras > 0) {
      throw new ConflictException(
        `Este cliente tem ${compras} compra${compras > 1 ? 's' : ''} no histórico. ` +
          'Desative em vez de excluir, para não perder o histórico das vendas.',
      );
    }

    await this.modelo.findByIdAndDelete(id).exec();
  }

  /**
   * Junta cadastro + histórico de compras + dívida em aberto.
   * Duas agregações e um merge em memória: mais simples de ler que um
   * $lookup duplo, e a lista de clientes de uma loja cabe folgado.
   */
  private async enriquecer(clientes: ClienteDocument[]) {
    const ids = clientes.map((c) => c._id);

    const [compras, dividas] = await Promise.all([
      this.vendas.aggregate<ResumoCompras>([
        { $match: { cliente: { $in: ids }, status: 'concluida' } },
        {
          $group: {
            _id: '$cliente',
            totalCompras: { $sum: '$total' },
            numCompras: { $sum: 1 },
            ultimaCompra: { $max: '$data' },
          },
        },
      ]),
      this.parcelas.aggregate<ResumoDivida>([
        { $match: { cliente: { $in: ids }, pago: false } },
        {
          $group: {
            _id: '$cliente',
            deve: { $sum: { $subtract: ['$valor', '$valorPago'] } },
            parcelasAbertas: { $sum: 1 },
          },
        },
      ]),
    ]);

    const porCompras = new Map(compras.map((c) => [String(c._id), c]));
    const porDivida = new Map(dividas.map((d) => [String(d._id), d]));

    return clientes.map((cliente) => {
      const id = String(cliente._id);
      const compra = porCompras.get(id);
      const divida = porDivida.get(id);

      const base = cliente.toJSON() as unknown as Cliente & { id: string };

      return {
        ...base,
        totalCompras: arredondar(compra?.totalCompras ?? 0),
        numCompras: compra?.numCompras ?? 0,
        ultimaCompra: compra?.ultimaCompra ?? null,
        deve: arredondar(divida?.deve ?? 0),
        parcelasAbertas: divida?.parcelasAbertas ?? 0,
      };
    });
  }
}

function arredondar(n: number) {
  return Math.round(n * 100) / 100;
}

function escapar(texto: string) {
  return texto.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
