import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, QueryFilter, Types } from 'mongoose';
import { NotificacoesService } from '../notificacoes/notificacoes.service';
import { VendasService } from '../vendas/vendas.service';
import { Pedido, PedidoDocument, StatusPedido } from './pedido.schema';

export interface FiltroPedidos {
  status?: StatusPedido;
  /** só os que ainda não foram respondidos */
  pendentes?: boolean;
}

@Injectable()
export class PedidosService {
  constructor(
    @InjectModel(Pedido.name) private readonly modelo: Model<PedidoDocument>,
    private readonly vendas: VendasService,
    private readonly notificacoes: NotificacoesService,
  ) {}

  async listar(filtro: FiltroPedidos = {}) {
    const query: QueryFilter<PedidoDocument> = {};

    if (filtro.status) query.status = filtro.status;
    else if (filtro.pendentes) query.status = 'novo';

    return this.modelo.find(query).sort({ criadoEm: -1 }).limit(200).exec();
  }

  async contarNovos() {
    return this.modelo.countDocuments({ status: 'novo' }).exec();
  }

  async obter(id: string) {
    const pedido = await this.modelo.findById(id).exec();
    if (!pedido) throw new NotFoundException('Pedido não encontrado');
    return pedido;
  }

  /**
   * Marca que a loja abriu o pedido.
   *
   * Separa "ainda não vi" de "vi e não respondi" — a segunda situação é
   * a que deixa cliente esperando sem saber, e é ela que a tela precisa
   * conseguir mostrar.
   */
  async marcarVisto(id: string) {
    const pedido = await this.obter(id);

    if (!pedido.vistoEm) {
      pedido.vistoEm = new Date();
      await pedido.save();
    }

    return pedido;
  }

  /** Aceita sem fechar a venda ainda: combinar entrega e pagamento vem antes. */
  async aceitar(id: string) {
    const pedido = await this.obter(id);
    this.exigirPendente(pedido);

    pedido.status = 'aceito';
    await pedido.save();

    await this.notificacoes.limparAvisoDePedido(pedido._id);
    return pedido;
  }

  async recusar(id: string, motivo?: string) {
    const pedido = await this.obter(id);
    this.exigirPendente(pedido);

    pedido.status = 'recusado';
    pedido.motivoRecusa = motivo?.trim() || null;
    await pedido.save();

    await this.notificacoes.limparAvisoDePedido(pedido._id);
    return pedido;
  }

  /**
   * Fecha o pedido virando venda de verdade.
   *
   * É AQUI que o estoque se move, e não na criação do pedido: até este
   * ponto nada saiu da prateleira. A venda é registrada pelo mesmo
   * caminho do balcão, então ela passa pela transação, pela checagem de
   * estoque e pelo limite de fiado como qualquer outra — o pedido não
   * ganha atalho por ter vindo da internet.
   */
  async concluir(
    id: string,
    dados: {
      pagamentos: { forma: string; valor: number; parcelas?: number }[];
      desconto?: number;
      vencimentoFiado?: string;
    },
  ) {
    const pedido = await this.obter(id);

    if (pedido.status === 'concluido') {
      throw new BadRequestException('Este pedido já virou venda');
    }
    if (pedido.status === 'recusado' || pedido.status === 'cancelado') {
      throw new BadRequestException('Este pedido foi encerrado');
    }

    const venda = await this.vendas.registrar({
      cliente: String(pedido.cliente),
      itens: pedido.itens.map((i) => ({
        produto: String(i.produto),
        variacao: i.variacao ? String(i.variacao) : undefined,
        quantidade: i.quantidade,
        precoUnitario: i.precoUnitario,
      })),
      pagamentos: dados.pagamentos,
      desconto: dados.desconto,
      vencimentoFiado: dados.vencimentoFiado,
      observacao: `Pedido #${pedido.numero} do catálogo online`,
    } as never);

    pedido.status = 'concluido';
    pedido.venda = new Types.ObjectId(String((venda as { id?: string }).id));
    await pedido.save();

    await this.notificacoes.limparAvisoDePedido(pedido._id);

    return { pedido, venda };
  }

  async cancelar(id: string, motivo?: string) {
    const pedido = await this.obter(id);

    if (pedido.status === 'concluido') {
      throw new BadRequestException(
        'Este pedido já virou venda — cancele a venda, para o estoque voltar',
      );
    }

    pedido.status = 'cancelado';
    pedido.motivoRecusa = motivo?.trim() || null;
    await pedido.save();

    await this.notificacoes.limparAvisoDePedido(pedido._id);
    return pedido;
  }

  private exigirPendente(pedido: PedidoDocument) {
    if (pedido.status !== 'novo') {
      throw new BadRequestException(
        `Este pedido já foi ${
          pedido.status === 'aceito'
            ? 'aceito'
            : pedido.status === 'concluido'
              ? 'concluído'
              : 'encerrado'
        }`,
      );
    }
  }
}
