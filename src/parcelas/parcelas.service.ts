import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import dayjs from 'dayjs';
import { Model, QueryFilter, Types } from 'mongoose';
import { dinheiro } from '../common/margem';
import { NotificacoesService } from '../notificacoes/notificacoes.service';
import { Venda } from '../vendas/venda.schema';
import { Parcela, ParcelaDocument } from './parcela.schema';

export interface FiltroParcelas {
  cliente?: string;
  somenteVencidas?: boolean;
  incluirPagas?: boolean;
}

@Injectable()
export class ParcelasService {
  constructor(
    @InjectModel(Parcela.name)
    private readonly modelo: Model<ParcelaDocument>,
    @InjectModel(Venda.name) private readonly vendas: Model<Venda>,
    private readonly notificacoes: NotificacoesService,
  ) {}

  listar(filtro: FiltroParcelas = {}) {
    const query: QueryFilter<ParcelaDocument> = {};

    if (!filtro.incluirPagas) query.pago = false;
    if (filtro.cliente) query.cliente = filtro.cliente;
    if (filtro.somenteVencidas) {
      query.pago = false;
      query.vencimento = { $lt: new Date() };
    }

    return this.modelo.find(query).sort({ vencimento: 1 }).exec();
  }

  async obter(id: string) {
    const parcela = await this.modelo.findById(id).exec();
    if (!parcela) throw new NotFoundException('Parcela não encontrada');
    return parcela;
  }

  /**
   * Baixa da cobrança. Sem valor, quita o saldo inteiro; com valor,
   * registra pagamento parcial ("pagou por conta").
   */
  async receber(id: string, valor?: number) {
    const parcela = await this.obter(id);

    if (parcela.pago) {
      throw new BadRequestException('Esta parcela já foi recebida');
    }

    const saldo = dinheiro(parcela.valor - parcela.valorPago);
    const recebido = dinheiro(valor ?? saldo);

    if (recebido <= 0) {
      throw new BadRequestException('O valor recebido precisa ser maior que zero');
    }
    if (recebido > saldo + 0.01) {
      throw new BadRequestException(
        `O valor é maior que o saldo desta parcela (${moeda(saldo)})`,
      );
    }

    parcela.valorPago = dinheiro(parcela.valorPago + recebido);
    // um centavo de folga: parcela arredondada nunca fecha exato
    parcela.pago = parcela.valorPago >= parcela.valor - 0.01;
    parcela.pagoEm = parcela.pago ? new Date() : null;
    await parcela.save();

    await this.atualizarSituacaoDaVenda(parcela.venda);

    if (parcela.cliente) await this.revisarAvisoDeFiado(parcela.cliente);

    return parcela;
  }

  /** Renegociação: empurra o vencimento. */
  async alterarVencimento(id: string, vencimento: string) {
    const parcela = await this.modelo
      .findByIdAndUpdate(id, { vencimento: dayjs(vencimento).toDate() }, { new: true })
      .exec();

    if (!parcela) throw new NotFoundException('Parcela não encontrada');

    if (parcela.cliente) await this.revisarAvisoDeFiado(parcela.cliente);
    return parcela;
  }

  /** Perdoar a dívida / cancelar a cobrança. */
  async excluir(id: string) {
    const parcela = await this.obter(id);
    await this.modelo.findByIdAndDelete(id).exec();

    await this.atualizarSituacaoDaVenda(parcela.venda);
    if (parcela.cliente) await this.revisarAvisoDeFiado(parcela.cliente);
  }

  /** Total em aberto, total vencido e quantos clientes devem. */
  async resumo() {
    const abertas = await this.modelo.find({ pago: false }).exec();
    const agora = new Date();

    const aberto = abertas.reduce(
      (s, p) => s + (p.valor - p.valorPago),
      0,
    );
    const vencido = abertas
      .filter((p) => p.vencimento < agora)
      .reduce((s, p) => s + (p.valor - p.valorPago), 0);

    const clientes = new Set(
      abertas.filter((p) => p.cliente).map((p) => String(p.cliente)),
    );

    return {
      aberto: dinheiro(aberto),
      vencido: dinheiro(vencido),
      clientes: clientes.size,
      parcelas: abertas.length,
    };
  }

  /**
   * Cria os avisos de fiado atrasado.
   *
   * O alerta de estoque nasce do próprio movimento, mas o de fiado
   * depende do calendário: ninguém "faz" nada no dia em que a parcela
   * vence. Por isso o app chama isto ao abrir.
   */
  async sincronizarAvisos() {
    const vencidas = await this.modelo
      .find({ pago: false, vencimento: { $lt: new Date() }, cliente: { $ne: null } })
      .exec();

    // um aviso por cliente, não um por parcela — senão vira spam
    const porCliente = new Map<
      string,
      { id: Types.ObjectId; nome: string; total: number; dias: number }
    >();

    for (const p of vencidas) {
      const chave = String(p.cliente);
      const atual = porCliente.get(chave);
      const dias = Math.floor(
        (Date.now() - p.vencimento.getTime()) / 86400000,
      );

      porCliente.set(chave, {
        id: p.cliente!,
        nome: atual?.nome ?? p.clienteNome ?? 'Cliente',
        total: (atual?.total ?? 0) + (p.valor - p.valorPago),
        dias: Math.max(atual?.dias ?? 0, dias),
      });
    }

    for (const info of porCliente.values()) {
      await this.notificacoes.avisarFiadoVencido({
        clienteId: info.id,
        clienteNome: info.nome,
        total: dinheiro(info.total),
        diasAtraso: info.dias,
      });
    }

    return { avisos: porCliente.size };
  }

  /** Quitou tudo? A venda deixa de ser fiado. */
  private async atualizarSituacaoDaVenda(vendaId: Types.ObjectId) {
    const restantes = await this.modelo
      .countDocuments({ venda: vendaId, pago: false })
      .exec();

    if (restantes === 0) {
      await this.vendas.findByIdAndUpdate(vendaId, { situacao: 'pago' }).exec();
    }
  }

  /** Sem nada vencido, o aviso de cobrança some sozinho. */
  private async revisarAvisoDeFiado(clienteId: Types.ObjectId) {
    const aindaVencidas = await this.modelo
      .countDocuments({
        cliente: clienteId,
        pago: false,
        vencimento: { $lt: new Date() },
      })
      .exec();

    if (aindaVencidas === 0) {
      await this.notificacoes.limparAvisoDeFiado(clienteId);
    }
  }
}

function moeda(n: number) {
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}
