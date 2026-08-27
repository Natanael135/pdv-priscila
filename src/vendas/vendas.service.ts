import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import dayjs from 'dayjs';
import { ClientSession, Connection, Model, QueryFilter, Types } from 'mongoose';
import { Cliente, ClienteDocument } from '../clientes/cliente.schema';
import { ContadorService } from '../common/contador.service';
import { fimDoDia, inicioDoDia } from '../common/fuso';
import { custoDoItem, precoDaTabela } from '../common/precos';
import type { TabelaDePreco } from '../common/precos';
import { dinheiro, moeda } from '../common/margem';
import { Configuracao } from '../configuracoes/configuracao.schema';
import { EstoqueService } from '../estoque/estoque.service';
import { Parcela } from '../parcelas/parcela.schema';
import { Produto, Variacao } from '../produtos/produto.schema';
import { Venda, VendaDocument, VendaItem } from './venda.schema';
import type { OrigemVenda } from './venda.schema';
import { RegistrarVendaDto } from './vendas.dto';

export interface FiltroVendas {
  inicio?: string;
  fim?: string;
  cliente?: string;
  situacao?: 'pago' | 'parcial' | 'fiado';
  /** 'catalogo' = veio de pedido pela internet */
  origem?: OrigemVenda;
  incluirCanceladas?: boolean;
  busca?: string;
  limite?: number;
}

/**
 * Campos que só o fluxo INTERNO preenche.
 *
 * Não entram no DTO da requisição de propósito: quem vende pelo balcão
 * não escolhe a própria procedência, e aceitar isso do corpo deixaria
 * qualquer um marcar uma venda como vinda do catálogo.
 */
interface DadosInternosDaVenda {
  origem?: OrigemVenda;
  pedidoId?: Types.ObjectId | null;
}

@Injectable()
export class VendasService {
  constructor(
    @InjectConnection() private readonly conexao: Connection,
    @InjectModel(Venda.name) private readonly modelo: Model<VendaDocument>,
    @InjectModel(Produto.name) private readonly produtos: Model<Produto>,
    @InjectModel(Cliente.name) private readonly clientes: Model<ClienteDocument>,
    @InjectModel(Parcela.name) private readonly parcelas: Model<Parcela>,
    @InjectModel(Configuracao.name)
    private readonly configuracoes: Model<Configuracao>,
    private readonly estoque: EstoqueService,
    private readonly contador: ContadorService,
  ) {}

  /**
   * Fecha a venda inteira — itens, pagamentos, parcelas e baixa de
   * estoque — dentro de UMA transação.
   *
   * É o ponto mais delicado do sistema. Sem transação, um erro no meio
   * deixaria estoque baixado sem venda registrada (ou o contrário), e
   * ninguém descobre isso no mesmo dia. Com transação, ou tudo entra ou
   * nada entra.
   *
   * Requer replica set — o Atlas já é. Num mongod standalone local o
   * driver recusa a transação, e a mensagem de erro diz isso.
   */
  async registrar(dto: RegistrarVendaDto & DadosInternosDaVenda) {
    const session = await this.conexao.startSession();

    try {
      let vendaId: Types.ObjectId | null = null;

      await session.withTransaction(async () => {
        vendaId = await this.gravarVenda(dto, session);
      });

      return this.obter(String(vendaId));
    } finally {
      await session.endSession();
    }
  }

  private async gravarVenda(
    dto: RegistrarVendaDto & DadosInternosDaVenda,
    session: ClientSession,
  ): Promise<Types.ObjectId> {
    // ── Itens ──────────────────────────────────────────────────────
    const tabela: TabelaDePreco = dto.tabelaPreco ?? 'avista';
    const ids = dto.itens.map((i) => new Types.ObjectId(i.produto));
    const produtos = await this.produtos
      .find({ _id: { $in: ids } })
      .session(session)
      .exec();

    const porId = new Map(produtos.map((p) => [String(p._id), p]));

    const config = await this.configuracoes.findOne().session(session).exec();
    const permiteNegativo = config?.permitirVendaSemEstoque ?? false;

    const itens: VendaItem[] = [];
    let subtotal = 0;
    let custoTotal = 0;
    const semEstoque: string[] = [];

    for (const entrada of dto.itens) {
      const produto = porId.get(entrada.produto);
      if (!produto) {
        throw new NotFoundException(`Produto ${entrada.produto} não encontrado`);
      }

      // ── Variação (cor/tamanho) ──────────────────────────────────
      const temGrade = (produto.variacoes?.length ?? 0) > 0;
      let variacao: Variacao | null = null;

      if (temGrade) {
        if (!entrada.variacao) {
          throw new BadRequestException(
            `Escolha a cor/tamanho de "${produto.nome}" antes de vender.`,
          );
        }

        variacao =
          produto.variacoes.find(
            (v) =>
              String((v as unknown as { _id: Types.ObjectId })._id) ===
              entrada.variacao,
          ) ?? null;

        if (!variacao) {
          throw new NotFoundException(
            `Variação não encontrada em "${produto.nome}"`,
          );
        }
      }

      // O saldo conferido é o da VARIAÇÃO quando existe grade. Olhar o
      // total do produto deixaria vender a calça 36 azul (zero) só
      // porque há 15 da 44 preta — o caso que motivou a grade.
      const saldo = variacao ? variacao.estoqueAtual : produto.estoqueAtual;
      const nomeCompleto = variacao
        ? `${produto.nome} (${descreverVariacao(variacao)})`
        : produto.nome;

      // Confere o estoque ANTES de gravar qualquer coisa. Juntamos todos
      // os itens que faltam numa lista só: avisar de um em um faria a
      // pessoa tentar salvar cinco vezes para descobrir cinco problemas.
      if (!permiteNegativo && produto.controlaEstoque && entrada.quantidade > saldo) {
        semEstoque.push(
          `${nomeCompleto} (tem ${formatarQtd(saldo)} ` +
            `${produto.unidade}, pediu ${formatarQtd(entrada.quantidade)})`,
        );
      }

      /*
       * O preço vem da tabela da venda (à vista, crédito ou fiado).
       *
       * Só quando o app manda um preço explícito é que ele vence — é o
       * caso de quem mexeu no preço da linha ali no carrinho.
       */
      const precoUnitario =
        entrada.precoUnitario ?? precoDaTabela(produto, variacao, tabela);
      const custoUnitario = custoDoItem(produto, variacao);
      const desconto = entrada.desconto ?? 0;
      const total = dinheiro(entrada.quantidade * precoUnitario - desconto);

      if (total < 0) {
        throw new BadRequestException(
          `O desconto em "${produto.nome}" é maior que o valor do item`,
        );
      }

      itens.push({
        produto: produto._id as Types.ObjectId,
        // fotografia do momento: preço e custo de hoje ficam congelados
        produtoNome: produto.nome,
        variacao: entrada.variacao ?? null,
        variacaoDescricao: variacao ? descreverVariacao(variacao) : null,
        quantidade: entrada.quantidade,
        precoUnitario,
        custoUnitario,
        desconto,
        total,
      });

      subtotal = dinheiro(subtotal + total);
      custoTotal = dinheiro(custoTotal + entrada.quantidade * custoUnitario);
    }

    if (semEstoque.length) {
      throw new BadRequestException(
        `Sem estoque suficiente: ${semEstoque.join('; ')}. ` +
          'Dê entrada no estoque ou ajuste a quantidade. ' +
          '(Para permitir venda sem estoque, mude em Ajustes.)',
      );
    }

    // ── Totais ─────────────────────────────────────────────────────
    const desconto = dinheiro(dto.desconto ?? 0);

    if (desconto > subtotal) {
      throw new BadRequestException(
        `O desconto (${moeda(desconto)}) é maior que o subtotal (${moeda(subtotal)})`,
      );
    }

    const total = dinheiro(subtotal - desconto);

    // ── Pagamentos ─────────────────────────────────────────────────
    const somaPagamentos = dinheiro(
      dto.pagamentos.reduce((s, p) => s + p.valor, 0),
    );

    // um centavo de folga para arredondamento de parcela
    if (Math.abs(somaPagamentos - total) > 0.01) {
      throw new BadRequestException(
        `Os pagamentos somam ${moeda(somaPagamentos)}, mas a venda deu ` +
          `${moeda(total)}. Ajuste os valores.`,
      );
    }

    const totalFiado = dinheiro(
      dto.pagamentos
        .filter((p) => p.forma === 'fiado')
        .reduce((s, p) => s + p.valor, 0),
    );

    // Fiado sem cliente é dívida de fantasma: no dia da cobrança não há
    // para quem ligar. Melhor barrar aqui do que descobrir depois.
    if (totalFiado > 0 && !dto.cliente) {
      throw new BadRequestException(
        'Venda no fiado exige um cliente identificado',
      );
    }

    const situacao =
      totalFiado === 0 ? 'pago' : totalFiado >= total ? 'fiado' : 'parcial';

    // ── Cliente ────────────────────────────────────────────────────
    const cliente = dto.cliente
      ? await this.clientes.findById(dto.cliente).session(session).exec()
      : null;

    if (dto.cliente && !cliente) {
      throw new NotFoundException('Cliente não encontrado');
    }

    // ── Grava ──────────────────────────────────────────────────────
    const numero = await this.contador.proximo('venda', session);

    const [venda] = await this.modelo.create(
      [
        {
          numero,
          cliente: cliente?._id ?? null,
          clienteNome: cliente?.nome ?? null,
          data: new Date(),
          itens,
          pagamentos: dto.pagamentos.map((p) => ({
            forma: p.forma,
            valor: p.valor,
            parcelas: p.parcelas ?? 1,
          })),
          tabelaPreco: tabela,
          subtotal,
          desconto,
          total,
          custoTotal,
          lucro: dinheiro(total - custoTotal),
          situacao,
          /**
           * Procedência. Só o fluxo de pedido manda 'catalogo'; a venda
           * de balcão nem informa, e o padrão do schema resolve.
           */
          origem: dto.origem ?? 'balcao',
          pedido: dto.pedidoId ?? null,
          observacao: dto.observacao ?? null,
        },
      ],
      { session, ordered: true },
    );

    // ── Baixa do estoque ───────────────────────────────────────────
    for (const item of itens) {
      if (!item.produto) continue;
      await this.estoque.movimentar(
        {
          produtoId: item.produto,
          variacaoId: item.variacao,
          tipo: 'venda',
          quantidade: item.quantidade,
          custoUnitario: item.custoUnitario,
          motivo: `Venda #${numero}`,
          vendaId: venda._id as Types.ObjectId,
        },
        session,
      );
    }

    // ── Parcelas (fiado e crédito parcelado) ───────────────────────
    await this.gerarParcelas(dto, venda, cliente, session);

    return venda._id as Types.ObjectId;
  }

  private async gerarParcelas(
    dto: RegistrarVendaDto,
    venda: VendaDocument,
    cliente: ClienteDocument | null,
    session: ClientSession,
  ) {
    const config = await this.configuracoes.findOne().session(session).exec();
    const diasPadrao = config?.diasFiadoPadrao ?? 30;

    const primeiroVencimento = dto.vencimentoFiado
      ? dayjs(dto.vencimentoFiado)
      : dayjs().add(diasPadrao, 'day');

    const novas: Record<string, unknown>[] = [];

    for (const pagamento of venda.pagamentos) {
      const parcelas = pagamento.parcelas ?? 1;
      const ehFiado = pagamento.forma === 'fiado';

      // fiado sempre vira conta a receber; cartão só quando parcelado
      if (!ehFiado && parcelas <= 1) continue;

      const valorParcela = dinheiro(pagamento.valor / parcelas);
      // a diferença de arredondamento vai toda na última parcela, senão
      // a soma das parcelas não fecha com o valor do pagamento
      const resto = dinheiro(pagamento.valor - valorParcela * parcelas);

      for (let i = 1; i <= parcelas; i++) {
        const vence = ehFiado
          ? primeiroVencimento.add(i - 1, 'month').toDate()
          : dayjs().add(i, 'month').toDate();

        novas.push({
          venda: venda._id,
          vendaNumero: venda.numero,
          cliente: cliente?._id ?? null,
          clienteNome: cliente?.nome ?? null,
          clienteTelefone: cliente?.telefone ?? null,
          forma: pagamento.forma,
          numero: i,
          totalParcelas: parcelas,
          valor: i === parcelas ? dinheiro(valorParcela + resto) : valorParcela,
          vencimento: vence,
          vencimentoOriginal: vence,
          historico: [{ tipo: 'criada', em: new Date(), vencimentoNovo: vence }],
        });
      }
    }

    if (novas.length) {
      await this.parcelas.create(novas, { session, ordered: true });
    }
  }

  // ─── Consulta ────────────────────────────────────────────────────
  async listar(filtro: FiltroVendas = {}) {
    const query: QueryFilter<VendaDocument> = {};

    if (!filtro.incluirCanceladas) query.status = 'concluida';
    if (filtro.cliente) query.cliente = filtro.cliente;
    if (filtro.situacao) query.situacao = filtro.situacao;
    if (filtro.origem) query.origem = filtro.origem;

    if (filtro.inicio || filtro.fim) {
      // Mesmo cuidado do dashboard: o dia começa e termina no fuso da
      // loja, não no do servidor. Ver common/fuso.ts.
      query.data = {};
      if (filtro.inicio) query.data.$gte = inicioDoDia(filtro.inicio);
      if (filtro.fim) query.data.$lte = fimDoDia(filtro.fim);
    }

    if (filtro.busca?.trim()) {
      const termo = filtro.busca.trim();
      const numero = Number(termo);
      // digitou número? procura o cupom. senão, o nome do cliente
      query.$or = Number.isFinite(numero)
        ? [{ numero }, { clienteNome: new RegExp(escapar(termo), 'i') }]
        : [{ clienteNome: new RegExp(escapar(termo), 'i') }];
    }

    return this.modelo
      .find(query)
      .sort({ data: -1 })
      .limit(filtro.limite ?? 200)
      .exec();
  }

  async obter(id: string) {
    const venda = await this.modelo.findById(id).exec();
    if (!venda) throw new NotFoundException('Venda não encontrada');

    const parcelas = await this.parcelas
      .find({ venda: venda._id })
      .sort({ numero: 1 })
      .exec();

    return { ...venda.toJSON(), parcelas };
  }

  /**
   * Cancela e devolve tudo ao estoque, também em transação — cancelar
   * pela metade traria o mesmo problema de vender pela metade.
   */
  async cancelar(id: string, motivo?: string) {
    const session = await this.conexao.startSession();

    try {
      await session.withTransaction(async () => {
        const venda = await this.modelo.findById(id).session(session).exec();
        if (!venda) throw new NotFoundException('Venda não encontrada');
        if (venda.status === 'cancelada') {
          throw new BadRequestException('Esta venda já foi cancelada');
        }

        for (const item of venda.itens) {
          if (!item.produto) continue;
          await this.estoque.movimentar(
            {
              produtoId: item.produto,
              variacaoId: item.variacao,
              tipo: 'cancelamento',
              quantidade: item.quantidade,
              custoUnitario: item.custoUnitario,
              motivo: `Cancelamento da venda #${venda.numero}`,
              vendaId: venda._id as Types.ObjectId,
            },
            session,
          );
        }

        // cobranças em aberto somem; as já pagas ficam no histórico
        await this.parcelas
          .deleteMany({ venda: venda._id, pago: false })
          .session(session)
          .exec();

        venda.status = 'cancelada';
        venda.canceladaEm = new Date();
        venda.motivoCancelamento = motivo ?? null;
        await venda.save({ session });
      });

      return this.obter(id);
    } finally {
      await session.endSession();
    }
  }

  /**
   * Exclusão definitiva — só de venda já cancelada. Apagar venda
   * concluída faria o faturamento do mês mudar sem deixar rastro; o
   * caminho para desfazer uma venda é cancelar, que devolve o estoque.
   */
  async excluir(id: string) {
    const venda = await this.modelo.findById(id).exec();
    if (!venda) throw new NotFoundException('Venda não encontrada');

    if (venda.status !== 'cancelada') {
      throw new BadRequestException(
        'Só dá para excluir uma venda já cancelada. Cancele primeiro — ' +
          'assim o estoque volta e o histórico fica coerente.',
      );
    }

    await this.parcelas.deleteMany({ venda: venda._id }).exec();
    await this.modelo.findByIdAndDelete(id).exec();
  }
}


function escapar(texto: string) {
  return texto.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Quantidade sem zeros à toa: 3 vira "3", 0.5 vira "0,5". */
function formatarQtd(n: number): string {
  return Number.isInteger(n)
    ? String(n)
    : String(Number(n.toFixed(3))).replace('.', ',');
}

/** "44 · Preto" — mesmo rótulo usado no estoque e na tela. */
function descreverVariacao(v: Variacao): string {
  return [v.tamanho, v.cor].filter(Boolean).join(' · ') || 'Padrão';
}
