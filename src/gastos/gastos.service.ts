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
