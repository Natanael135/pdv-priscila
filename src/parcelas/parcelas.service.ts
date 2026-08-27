import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import dayjs from 'dayjs';
import { Model, QueryFilter, Types } from 'mongoose';
import { fimDoDia, hojeNaLoja, inicioDoDia } from '../common/fuso';
import { dinheiro, moeda } from '../common/margem';
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

    // registra a entrada: valorPago guarda o total, não quando cada
    // pedaço entrou — e é isso que a pessoa quer ver ao conferir
    parcela.historico.push({
      tipo: 'recebimento',
      em: new Date(),
      vencimentoAnterior: null,
      vencimentoNovo: null,
      valor: recebido,
      saldoDepois: dinheiro(parcela.valor - parcela.valorPago),
      observacao: null,
    });

    await parcela.save();

    await this.atualizarSituacaoDaVenda(parcela.venda);

    if (parcela.cliente) await this.revisarAvisoDeFiado(parcela.cliente);

    return parcela;
  }

  /**
   * Renegociação: empurra o vencimento, guardando o combinado anterior.
   *
   * Carrega e salva em vez de um update direto de propósito: para
   * registrar de onde a data saiu, é preciso lê-la antes de trocar.
   */
  async alterarVencimento(id: string, vencimento: string, motivo?: string) {
    const parcela = await this.obter(id);

    if (parcela.pago) {
      throw new BadRequestException('Esta parcela já foi recebida');
    }

    const anterior = parcela.vencimento;
    // mesma regra do vencimento original: o dia é o do fuso da loja
    const nova = inicioDoDia(vencimento);

    // parcela antiga, de antes do histórico existir: adota o vencimento
    // atual como o original, senão ela apareceria como "sem original"
    if (!parcela.vencimentoOriginal) parcela.vencimentoOriginal = anterior;

    parcela.vencimento = nova;
    parcela.historico.push({
      tipo: 'adiada',
      em: new Date(),
      vencimentoAnterior: anterior,
      vencimentoNovo: nova,
      valor: null,
      saldoDepois: null,
      observacao: motivo?.trim() || null,
    });

    await parcela.save();

    if (parcela.cliente) await this.revisarAvisoDeFiado(parcela.cliente);
    return parcela;
  }

  /**
   * Como este cliente costuma pagar.
   *
   * Responde a pergunta que a loja faz antes de liberar fiado de novo:
   * "essa pessoa honra o combinado?". Os números vêm do que já
   * aconteceu — quantas quitou no prazo, quantas vezes pediu para
   * adiar, quanto costuma atrasar — em vez de uma impressão.
   *
   * Conta só o que está FECHADO no cálculo de pontualidade: parcela em
   * aberto e ainda no prazo não é mérito nem demérito, e incluí-la
   * inflaria a reputação de quem acabou de comprar.
   */
  async comportamentoDoCliente(clienteId: string) {
    const parcelas = await this.modelo
      .find({ cliente: new Types.ObjectId(clienteId) })
      .sort({ vencimento: 1 })
      .exec();

    const quitadas = parcelas.filter((p) => p.pago);
    const abertas = parcelas.filter((p) => !p.pago);

    let noPrazo = 0;
    let comAtraso = 0;
    let somaAtraso = 0;
    let maiorAtraso = 0;

    for (const p of quitadas) {
      if (!p.pagoEm) continue;

      /**
       * A comparação é por DIA, não por instante: quem paga às 18h do
       * dia do vencimento pagou em dia. Comparando timestamps, o
       * vencimento gravado à meia-noite faria todo pagamento do próprio
       * dia contar como atraso.
       */
      const atraso = Math.floor(
        (inicioDoDia(p.pagoEm).getTime() - inicioDoDia(p.vencimento).getTime()) /
          86400000,
      );

      if (atraso > 0) {
        comAtraso++;
        somaAtraso += atraso;
        maiorAtraso = Math.max(maiorAtraso, atraso);
      } else {
        noPrazo++;
      }
    }

    const adiamentos = parcelas.reduce(
      (s, p) => s + (p.historico ?? []).filter((e) => e.tipo === 'adiada').length,
      0,
    );

    // parcela que precisou de mais de uma entrada para fechar
    const pagasEmPedacos = parcelas.filter(
      (p) => (p.historico ?? []).filter((e) => e.tipo === 'recebimento').length > 1,
    ).length;

    const hoje = inicioDoDia(hojeNaLoja());
    const vencidasAgora = abertas.filter((p) => p.vencimento < hoje);

    /**
     * Linha do tempo de tudo que aconteceu, do mais recente para trás.
     * Sem limite aqui de propósito: quem consulta isso quer o retrato
     * inteiro, e são poucas dezenas de eventos por cliente.
     */
    const eventos = parcelas
      .flatMap((p) =>
        (p.historico ?? []).map((e) => ({
          tipo: e.tipo,
          em: e.em,
          vencimentoAnterior: e.vencimentoAnterior,
          vencimentoNovo: e.vencimentoNovo,
          valor: e.valor,
          saldoDepois: e.saldoDepois,
          observacao: e.observacao,
          vendaNumero: p.vendaNumero,
          parcela: p.numero,
          totalParcelas: p.totalParcelas,
        })),
      )
      .sort((a, b) => b.em.getTime() - a.em.getTime());

    return {
      totalParcelas: parcelas.length,
      quitadas: quitadas.length,
      noPrazo,
      comAtraso,
      atrasoMedio: comAtraso ? Math.round(somaAtraso / comAtraso) : 0,
      maiorAtraso,
      adiamentos,
      pagasEmPedacos,
      abertas: abertas.length,
      vencidasAgora: vencidasAgora.length,
      deve: dinheiro(abertas.reduce((s, p) => s + (p.valor - p.valorPago), 0)),
      eventos,
    };
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
    /**
     * A fronteira é o INÍCIO do dia da loja, não "agora".
     *
     * Com `vencimento < agora`, uma parcela que vence hoje — gravada
     * à meia-noite — já aparecia como vencida às 00h01. O cliente que
     * ainda tem o dia inteiro para pagar era tratado como caloteiro, e
     * o lembrete de "receber hoje" nunca teria chance de existir.
     */
    const dia = hojeNaLoja();
    const comecoDeHoje = inicioDoDia(dia);
    const fimDeHoje = fimDoDia(dia);

    const vencidas = await this.modelo
      .find({
        pago: false,
        vencimento: { $lt: comecoDeHoje },
        cliente: { $ne: null },
      })
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

    // ── vence HOJE: lembrete, não cobrança ──────────────────────────
    const deHoje = await this.modelo
      .find({
        pago: false,
        vencimento: { $gte: comecoDeHoje, $lte: fimDeHoje },
        cliente: { $ne: null },
      })
      .exec();

    const hojePorCliente = new Map<
      string,
      { id: Types.ObjectId; nome: string; total: number }
    >();

    for (const p of deHoje) {
      const chave = String(p.cliente);
      const atual = hojePorCliente.get(chave);

      hojePorCliente.set(chave, {
        id: p.cliente!,
        nome: atual?.nome ?? p.clienteNome ?? 'Cliente',
        total: (atual?.total ?? 0) + (p.valor - p.valorPago),
      });
    }

    for (const info of hojePorCliente.values()) {
      await this.notificacoes.avisarFiadoDeHoje({
        clienteId: info.id,
        clienteNome: info.nome,
        total: dinheiro(info.total),
        dia,
      });
    }

    return { avisos: porCliente.size, aReceberHoje: hojePorCliente.size };
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

