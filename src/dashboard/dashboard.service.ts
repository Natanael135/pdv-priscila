import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import dayjs from 'dayjs';
import { Model, PipelineStage } from 'mongoose';
import {
  FUSO_DA_LOJA as FUSO,
  fimDoDia,
  hojeNaLoja,
  inicioDoDia,
} from '../common/fuso';
import { dinheiro, margemDoTotal } from '../common/margem';
import { Parcela } from '../parcelas/parcela.schema';
import { Produto } from '../produtos/produto.schema';
import { Venda } from '../vendas/venda.schema';

@Injectable()
export class DashboardService {
  constructor(
    @InjectModel(Venda.name) private readonly vendas: Model<Venda>,
    @InjectModel(Produto.name) private readonly produtos: Model<Produto>,
    @InjectModel(Parcela.name) private readonly parcelas: Model<Parcela>,
  ) {}

  async resumo(inicioTexto?: string, fimTexto?: string) {
    // As bordas do período vêm do fuso da loja, não do relógio do
    // servidor — ver common/fuso.ts para o porquê.
    const textoInicio =
      inicioTexto ?? dayjs(hojeNaLoja()).subtract(29, 'day').format('YYYY-MM-DD');
    const textoFim = fimTexto ?? hojeNaLoja();

    const inicio = dayjs(textoInicio);
    const fim = dayjs(textoFim);

    const periodo: PipelineStage.Match = {
      $match: {
        status: 'concluida',
        data: { $gte: inicioDoDia(textoInicio), $lte: fimDoDia(textoFim) },
      },
    };

    const [
      totais,
      porDia,
      melhorDiaSemana,
      topProdutos,
      porForma,
      porCategoria,
      pendencias,
      estoque,
    ] = await Promise.all([
      this.totais(periodo),
      this.porDia(periodo, inicio, fim),
      this.melhorDiaSemana(periodo),
      this.topProdutos(periodo),
      this.porForma(periodo),
      this.porCategoria(periodo),
      this.pendencias(),
      this.estoque(),
    ]);

    const melhorDia =
      porDia.length > 0
        ? porDia.reduce((a, b) => (b.faturamento > a.faturamento ? b : a))
        : null;

    return {
      periodo: { inicio: inicio.format('YYYY-MM-DD'), fim: fim.format('YYYY-MM-DD') },
      ...totais,
      porDia,
      melhorDia: melhorDia && melhorDia.faturamento > 0 ? melhorDia : null,
      melhorDiaSemana,
      topProdutos,
      porForma,
      porCategoria,
      ...pendencias,
      ...estoque,
    };
  }

  private async totais(periodo: PipelineStage.Match) {
    const [r] = await this.vendas.aggregate<{
      faturamento: number;
      custo: number;
      lucro: number;
      descontos: number;
      numVendas: number;
    }>([
      periodo,
      {
        $group: {
          _id: null,
          faturamento: { $sum: '$total' },
          custo: { $sum: '$custoTotal' },
          lucro: { $sum: '$lucro' },
          descontos: { $sum: '$desconto' },
          numVendas: { $sum: 1 },
        },
      },
    ]);

    const faturamento = dinheiro(r?.faturamento ?? 0);
    const custo = dinheiro(r?.custo ?? 0);
    const numVendas = r?.numVendas ?? 0;

    return {
      faturamento,
      custo,
      lucro: dinheiro(r?.lucro ?? 0),
      descontos: dinheiro(r?.descontos ?? 0),
      numVendas,
      ticketMedio: numVendas > 0 ? dinheiro(faturamento / numVendas) : 0,
      // mesma conta da margem do produto, agora sobre o período inteiro
      margem: margemDoTotal(faturamento, custo),
    };
  }

  /**
   * Série diária. Dias sem venda entram com zero: sem isso o gráfico
   * emenda segunda com quarta e some com o domingo fechado, dando a
   * impressão de movimento constante.
   */
  private async porDia(
    periodo: PipelineStage.Match,
    inicio: dayjs.Dayjs,
    fim: dayjs.Dayjs,
  ) {
    const linhas = await this.vendas.aggregate<{
      _id: string;
      faturamento: number;
      lucro: number;
      vendas: number;
    }>([
      periodo,
      {
        $group: {
          _id: {
            $dateToString: { format: '%Y-%m-%d', date: '$data', timezone: FUSO },
          },
          faturamento: { $sum: '$total' },
          lucro: { $sum: '$lucro' },
          vendas: { $sum: 1 },
        },
      },
    ]);

    const porData = new Map(linhas.map((l) => [l._id, l]));
    const dias: {
      dia: string;
      faturamento: number;
      lucro: number;
      vendas: number;
    }[] = [];

    let cursor = inicio.startOf('day');
    while (cursor.isBefore(fim) || cursor.isSame(fim, 'day')) {
      const chave = cursor.format('YYYY-MM-DD');
      const linha = porData.get(chave);

      dias.push({
        dia: chave,
        faturamento: dinheiro(linha?.faturamento ?? 0),
        lucro: dinheiro(linha?.lucro ?? 0),
        vendas: linha?.vendas ?? 0,
      });

      cursor = cursor.add(1, 'day');
    }

    return dias;
  }

  /** Qual dia da semana rende mais — 1 = domingo no $dayOfWeek do Mongo. */
  private async melhorDiaSemana(periodo: PipelineStage.Match) {
    const [r] = await this.vendas.aggregate<{
      _id: number;
      faturamento: number;
      vendas: number;
    }>([
      periodo,
      {
        $group: {
          _id: { $dayOfWeek: { date: '$data', timezone: FUSO } },
          faturamento: { $sum: '$total' },
          vendas: { $sum: 1 },
        },
      },
      { $sort: { faturamento: -1 } },
      { $limit: 1 },
    ]);

    if (!r) return null;

    return {
      // convertido para 0=domingo, que é o padrão do JS e do app
      diaSemana: r._id - 1,
      faturamento: dinheiro(r.faturamento),
      vendas: r.vendas,
    };
  }

  private async topProdutos(periodo: PipelineStage.Match, limite = 10) {
    const linhas = await this.vendas.aggregate<{
      _id: string | null;
      nome: string;
      quantidade: number;
      faturamento: number;
      lucro: number;
    }>([
      periodo,
      { $unwind: '$itens' },
      {
        $group: {
          _id: '$itens.produto',
          nome: { $first: '$itens.produtoNome' },
          quantidade: { $sum: '$itens.quantidade' },
          faturamento: { $sum: '$itens.total' },
          lucro: {
            $sum: {
              $subtract: [
                '$itens.total',
                { $multiply: ['$itens.quantidade', '$itens.custoUnitario'] },
              ],
            },
          },
        },
      },
      { $sort: { quantidade: -1 } },
      { $limit: limite },
    ]);

    return linhas.map((l) => ({
      produtoId: l._id ? String(l._id) : null,
      nome: l.nome,
      quantidade: Math.round(l.quantidade * 1000) / 1000,
      faturamento: dinheiro(l.faturamento),
      lucro: dinheiro(l.lucro),
    }));
  }

  private async porForma(periodo: PipelineStage.Match) {
    const linhas = await this.vendas.aggregate<{
      _id: string;
      valor: number;
      qtd: number;
    }>([
      periodo,
      { $unwind: '$pagamentos' },
      {
        $group: {
          _id: '$pagamentos.forma',
          valor: { $sum: '$pagamentos.valor' },
          qtd: { $sum: 1 },
        },
      },
      { $sort: { valor: -1 } },
    ]);

    return linhas.map((l) => ({
      forma: l._id,
      valor: dinheiro(l.valor),
      qtd: l.qtd,
    }));
  }

  private async porCategoria(periodo: PipelineStage.Match) {
    const linhas = await this.vendas.aggregate<{
      _id: string | null;
      categoria: string | null;
      cor: string | null;
      faturamento: number;
      quantidade: number;
    }>([
      periodo,
      { $unwind: '$itens' },
      {
        $lookup: {
          from: 'produtos',
          localField: 'itens.produto',
          foreignField: '_id',
          as: 'produto',
        },
      },
      { $unwind: { path: '$produto', preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          from: 'categorias',
          localField: 'produto.categoria',
          foreignField: '_id',
          as: 'categoria',
        },
      },
      { $unwind: { path: '$categoria', preserveNullAndEmptyArrays: true } },
      {
        $group: {
          _id: '$categoria._id',
          categoria: { $first: '$categoria.nome' },
          cor: { $first: '$categoria.cor' },
          faturamento: { $sum: '$itens.total' },
          quantidade: { $sum: '$itens.quantidade' },
        },
      },
      { $sort: { faturamento: -1 } },
    ]);

    return linhas.map((l) => ({
      categoria: l.categoria ?? 'Sem categoria',
      cor: l.cor ?? '#94A3B8',
      faturamento: dinheiro(l.faturamento),
      quantidade: Math.round(l.quantidade * 1000) / 1000,
    }));
  }

  /** Fiado em aberto — não depende do período, é o de hoje. */
  private async pendencias() {
    const abertas = await this.parcelas.find({ pago: false }).exec();
    const agora = new Date();

    return {
      aReceber: dinheiro(
        abertas.reduce((s, p) => s + (p.valor - p.valorPago), 0),
      ),
      aReceberVencido: dinheiro(
        abertas
          .filter((p) => p.vencimento < agora)
          .reduce((s, p) => s + (p.valor - p.valorPago), 0),
      ),
    };
  }

  private async estoque() {
    const [contagem, valor] = await Promise.all([
      this.produtos
        .countDocuments({
          ativo: true,
          controlaEstoque: true,
          $expr: { $lte: ['$estoqueAtual', '$estoqueMinimo'] },
        })
        .exec(),
      this.produtos.aggregate<{ valorEstoque: number }>([
        { $match: { ativo: true, controlaEstoque: true } },
        {
          $group: {
            _id: null,
            valorEstoque: {
              $sum: { $multiply: ['$estoqueAtual', '$precoCompra'] },
            },
          },
        },
      ]),
    ]);

    return {
      estoqueBaixo: contagem,
      valorEstoque: dinheiro(valor[0]?.valorEstoque ?? 0),
    };
  }
}
