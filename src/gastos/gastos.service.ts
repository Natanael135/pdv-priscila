import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import dayjs from 'dayjs';
import { Model, QueryFilter, Types } from 'mongoose';
import { fimDoDia, hojeNaLoja, inicioDoDia } from '../common/fuso';
import { dinheiro } from '../common/margem';
import { Produto } from '../produtos/produto.schema';
import { Venda } from '../vendas/venda.schema';
import {
  CategoriaGasto,
  Gasto,
  GastoDocument,
  GastoRecorrente,
  GastoRecorrenteDocument,
} from './gasto.schema';
import {
  AtualizarGastoDto,
  CriarGastoDto,
  CriarRecorrenteDto,
} from './gastos.dto';

export interface FiltroGastos {
  de?: string;
  ate?: string;
  categoria?: CategoriaGasto;
  somenteAbertos?: boolean;
}

@Injectable()
export class GastosService {
  constructor(
    @InjectModel(Gasto.name) private readonly modelo: Model<GastoDocument>,
    @InjectModel(GastoRecorrente.name)
    private readonly recorrentes: Model<GastoRecorrenteDocument>,
    @InjectModel(Venda.name) private readonly vendas: Model<Venda>,
    @InjectModel(Produto.name) private readonly produtos: Model<Produto>,
  ) {}

  // ─── Lançamentos ────────────────────────────────────────────────

  async listar(filtro: FiltroGastos = {}) {
    const query: QueryFilter<GastoDocument> = {};

    if (filtro.de || filtro.ate) {
      query.data = {
        ...(filtro.de ? { $gte: inicioDoDia(filtro.de) } : {}),
        ...(filtro.ate ? { $lte: fimDoDia(filtro.ate) } : {}),
      };
    }

    if (filtro.categoria) query.categoria = filtro.categoria;
    if (filtro.somenteAbertos) query.pago = false;

    return this.modelo.find(query).sort({ data: -1 }).limit(300).exec();
  }

  async obter(id: string) {
    const gasto = await this.modelo.findById(id).exec();
    if (!gasto) throw new NotFoundException('Gasto não encontrado');
    return gasto;
  }

  criar(dto: CriarGastoDto) {
    return this.modelo.create({
      ...dto,
      data: inicioDoDia(dto.data),
      pagoEm: dto.pago ? new Date() : null,
    });
  }

  async atualizar(id: string, dto: AtualizarGastoDto) {
    const gasto = await this.obter(id);

    /**
     * Só os campos realmente enviados.
     *
     * Um `Object.assign(gasto, dto)` direto não serve: o DTO chega com
     * TODAS as chaves opcionais presentes e valendo `undefined`, e o
     * assign as grava por cima — apagando descrição, categoria e data
     * de um documento que só queria mudar o valor. O save então falha
     * dizendo que os campos obrigatórios sumiram.
     */
    for (const [campo, valor] of Object.entries(dto)) {
      if (valor === undefined) continue;
      (gasto as unknown as Record<string, unknown>)[campo] =
        campo === 'data' ? inicioDoDia(valor as string) : valor;
    }

    // marcar como pago carimba a data; desmarcar apaga
    if (dto.pago !== undefined) {
      gasto.pagoEm = dto.pago ? (gasto.pagoEm ?? new Date()) : null;
    }

    await gasto.save();
    return gasto;
  }

  async excluir(id: string) {
    const gasto = await this.modelo.findByIdAndDelete(id).exec();
    if (!gasto) throw new NotFoundException('Gasto não encontrado');
  }

  // ─── Moldes recorrentes ─────────────────────────────────────────

  listarRecorrentes(incluirInativos = false) {
    return this.recorrentes
      .find(incluirInativos ? {} : { ativo: true })
      .sort({ diaDoMes: 1 })
      .exec();
  }

  criarRecorrente(dto: CriarRecorrenteDto) {
    return this.recorrentes.create(dto);
  }

  async atualizarRecorrente(id: string, dto: Partial<CriarRecorrenteDto>) {
    const doc = await this.recorrentes
      .findByIdAndUpdate(id, dto, { returnDocument: 'after' })
      .exec();

    if (!doc) throw new NotFoundException('Gasto recorrente não encontrado');
    return doc;
  }

  /**
   * Desativa em vez de apagar.
   *
   * Os lançamentos já gerados apontam para o molde. Apagá-lo deixaria o
   * histórico órfão — e o histórico de despesa é justamente o que se
   * consulta para saber quanto o aluguel subiu no ano.
   */
  async desativarRecorrente(id: string) {
    return this.atualizarRecorrente(id, { ativo: false });
  }

  /**
   * Apaga o molde de vez — só se ele nunca gerou nada.
   *
   * Existe para o cadastro feito errado: um molde criado por engano,
   * que ainda não virou despesa nenhuma, não precisa ficar de lembrança
   * na lista de inativos. Assim que ele tiver lançamento, a exclusão é
   * barrada, porque aí há histórico a preservar.
   */
  async excluirRecorrente(id: string) {
    const usos = await this.modelo
      .countDocuments({ recorrente: new Types.ObjectId(id) })
      .exec();

    if (usos > 0) {
      throw new BadRequestException(
        `Este gasto fixo já gerou ${usos} lançamento${usos > 1 ? 's' : ''}. ` +
          'Desative em vez de excluir, para o histórico não ficar sem origem.',
      );
    }

    const doc = await this.recorrentes.findByIdAndDelete(id).exec();
    if (!doc) throw new NotFoundException('Gasto recorrente não encontrado');
  }

  /**
   * Materializa os gastos fixos de um mês.
   *
   * O molde não é dinheiro que saiu; o lançamento é. Esta rotina cria o
   * lançamento de cada molde ativo para o mês pedido, e é segura de
   * repetir: o índice único (recorrente + referência) faz a segunda
   * chamada não duplicar nada.
   *
   * Roda quando a tela de gastos abre. Assim o aluguel aparece no mês
   * novo sem ninguém lembrar de lançar — que é o ponto de ser fixo.
   */
  async gerarDoMes(mes?: string) {
    const referencia = (mes ?? hojeNaLoja()).slice(0, 7);

    if (!/^\d{4}-\d{2}$/.test(referencia)) {
      throw new BadRequestException('Mês inválido — use AAAA-MM');
    }

    const moldes = await this.recorrentes.find({ ativo: true }).exec();

    let criados = 0;

    for (const molde of moldes) {
      const data = inicioDoDia(
        `${referencia}-${String(molde.diaDoMes).padStart(2, '0')}`,
      );

      /**
       * upsert com $setOnInsert: se o lançamento já existe, ele NÃO é
       * tocado. É o que preserva a correção manual — quem ajustou a
       * conta de luz para o valor real não pode vê-la voltar ao valor
       * previsto só porque a tela foi aberta de novo.
       */
      const r = await this.modelo
        .updateOne(
          { recorrente: molde._id, referencia },
          {
            $setOnInsert: {
              descricao: molde.descricao,
              categoria: molde.categoria,
              valor: molde.valor,
              data,
              pago: false,
              pagoEm: null,
              recorrente: molde._id,
              referencia,
              observacao: molde.observacao ?? null,
            },
          },
          { upsert: true },
        )
        .exec();

      if (r.upsertedCount > 0) criados++;
    }

    return { mes: referencia, moldes: moldes.length, criados };
  }

  // ─── Resumo ─────────────────────────────────────────────────────

  /**
   * Total de gastos de um período, e a quebra por categoria.
   *
   * É o que o dashboard desconta para sair da margem bruta e chegar no
   * lucro de verdade.
   */
  async resumo(de: string, ate: string) {
    const periodo = { data: { $gte: inicioDoDia(de), $lte: fimDoDia(ate) } };

    const linhas = await this.modelo
      .aggregate<{ _id: CategoriaGasto; total: number; abertos: number }>([
        { $match: periodo },
        {
          $group: {
            _id: '$categoria',
            total: { $sum: '$valor' },
            abertos: { $sum: { $cond: ['$pago', 0, '$valor'] } },
          },
        },
        { $sort: { total: -1 } },
      ])
      .exec();

    const total = dinheiro(linhas.reduce((s, l) => s + l.total, 0));
    const aPagar = dinheiro(linhas.reduce((s, l) => s + l.abertos, 0));

    return {
      total,
      pago: dinheiro(total - aPagar),
      aPagar,
      porCategoria: linhas.map((l) => ({
        categoria: l._id,
        total: dinheiro(l.total),
        aPagar: dinheiro(l.abertos),
      })),
    };
  }

  /** Só o número — o dashboard não precisa da quebra. */
  async totalDoPeriodo(inicio: Date, fim: Date): Promise<number> {
    const [r] = await this.modelo
      .aggregate<{ total: number }>([
        { $match: { data: { $gte: inicio, $lte: fim } } },
        { $group: { _id: null, total: { $sum: '$valor' } } },
      ])
      .exec();

    return dinheiro(r?.total ?? 0);
  }

  /**
   * Quantas peças a loja precisa vender no mês para se pagar.
   *
   * A conta é a do ponto de equilíbrio: cada peça vendida deixa uma
   * sobra (venda menos o custo dela), e essa sobra é o que paga o
   * aluguel, a luz e o resto. Dividindo a despesa fixa pela sobra
   * média, sai o número de peças.
   *
   * A margem média vem das VENDAS REAIS dos últimos 90 dias, não do
   * cadastro: o que pesa é o que de fato sai da loja, com os descontos
   * que foram dados. Sem venda nenhuma no período, cai no cadastro e
   * diz que é estimativa — um número inventado sem aviso seria pior do
   * que nenhum número.
   */
  async pontoDeEquilibrio() {
    const dia = hojeNaLoja();
    const inicioDoMes = inicioDoDia(dia.slice(0, 7) + '-01');
    const fimDeHoje = fimDoDia(dia);

    // ── quanto custa manter a loja aberta ──────────────────────────
    const moldes = await this.recorrentes.find({ ativo: true }).lean().exec();
    const fixoMensal = dinheiro(moldes.reduce((s, m) => s + m.valor, 0));

    /**
     * Gastos avulsos do mês entram também: frete, conserto e imposto
     * não são fixos, mas saem do mesmo bolso. Ignorá-los faria a meta
     * parecer menor do que é.
     */
    const [avulsos] = await this.modelo
      .aggregate<{ total: number }>([
        {
          $match: {
            data: { $gte: inicioDoMes, $lte: fimDeHoje },
            recorrente: null,
          },
        },
        { $group: { _id: null, total: { $sum: '$valor' } } },
      ])
      .exec();

    const variavelDoMes = dinheiro(avulsos?.total ?? 0);
    const precisaCobrir = dinheiro(fixoMensal + variavelDoMes);

    // ── quanto cada peça deixa de sobra ────────────────────────────
    const noventaDias = new Date(Date.now() - 90 * 86400000);

    const [vendido] = await this.vendas
      .aggregate<{ pecas: number; receita: number; custo: number }>([
        { $match: { status: 'concluida', criadoEm: { $gte: noventaDias } } },
        { $unwind: '$itens' },
        {
          $group: {
            _id: null,
            pecas: { $sum: '$itens.quantidade' },
            receita: { $sum: '$itens.total' },
            custo: {
              $sum: { $multiply: ['$itens.custoUnitario', '$itens.quantidade'] },
            },
          },
        },
      ])
      .exec();

    let margemPorPeca = 0;
    let estimado = false;

    if (vendido && vendido.pecas > 0) {
      margemPorPeca = dinheiro((vendido.receita - vendido.custo) / vendido.pecas);
    } else {
      // sem histórico: usa o cadastro, e avisa que é estimativa
      const [doCatalogo] = await this.produtos
        .aggregate<{ media: number }>([
          { $match: { ativo: true, precoVenda: { $gt: 0 } } },
          {
            $group: {
              _id: null,
              media: { $avg: { $subtract: ['$precoVenda', '$precoCompra'] } },
            },
          },
        ])
        .exec();

      margemPorPeca = dinheiro(doCatalogo?.media ?? 0);
      estimado = true;
    }

    // ── quanto já foi feito neste mês ──────────────────────────────
    const [doMes] = await this.vendas
      .aggregate<{ pecas: number; lucro: number }>([
        {
          $match: {
            status: 'concluida',
            criadoEm: { $gte: inicioDoMes, $lte: fimDeHoje },
          },
        },
        {
          $facet: {
            itens: [
              { $unwind: '$itens' },
              { $group: { _id: null, pecas: { $sum: '$itens.quantidade' } } },
            ],
            totais: [{ $group: { _id: null, lucro: { $sum: '$lucro' } } }],
          },
        },
        {
          $project: {
            pecas: { $ifNull: [{ $first: '$itens.pecas' }, 0] },
            lucro: { $ifNull: [{ $first: '$totais.lucro' }, 0] },
          },
        },
      ])
      .exec();

    const pecasVendidas = doMes?.pecas ?? 0;
    const lucroDoMes = dinheiro(doMes?.lucro ?? 0);

    /**
     * Sem margem não há conta possível — dividir por zero daria
     * Infinity, e "venda ∞ peças" não ajuda ninguém. Devolve null e a
     * tela explica o que falta cadastrar.
     */
    const pecasNecessarias =
      margemPorPeca > 0 ? Math.ceil(precisaCobrir / margemPorPeca) : null;

    const faltam =
      pecasNecessarias !== null
        ? Math.max(0, pecasNecessarias - pecasVendidas)
        : null;

    return {
      fixoMensal,
      variavelDoMes,
      precisaCobrir,

      margemPorPeca,
      /** true = calculada do cadastro, por falta de vendas no período */
      estimado,

      pecasNecessarias,
      pecasVendidas,
      faltam,

      lucroDoMes,
      /** já pagou as contas do mês? */
      noAzul: lucroDoMes >= precisaCobrir,
      /** quanto falta de lucro para cobrir os gastos */
      faltaEmDinheiro: dinheiro(Math.max(0, precisaCobrir - lucroDoMes)),

      /** por dia útil restante, para a meta virar rotina */
      diasRestantes: (() => {
        const hoje = Number(dia.slice(8, 10));
        const ultimo = new Date(
          Number(dia.slice(0, 4)),
          Number(dia.slice(5, 7)),
          0,
        ).getDate();
        return Math.max(1, ultimo - hoje + 1);
      })(),
    };
  }

  /** Contas vencidas e não pagas — para o aviso na tela. */
  async vencidos() {
    const hoje = inicioDoDia(hojeNaLoja());

    const lista = await this.modelo
      .find({ pago: false, data: { $lt: hoje } })
      .sort({ data: 1 })
      .exec();

    return {
      quantidade: lista.length,
      total: dinheiro(lista.reduce((s, g) => s + g.valor, 0)),
      itens: lista,
    };
  }
}
