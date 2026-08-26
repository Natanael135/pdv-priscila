import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { randomBytes } from 'crypto';
import { Model, Types } from 'mongoose';
import { Cliente } from '../clientes/cliente.schema';
import { ContadorService } from '../common/contador.service';
import { dinheiro, moeda } from '../common/margem';
import { Configuracao } from '../configuracoes/configuracao.schema';
import { NotificacoesService } from '../notificacoes/notificacoes.service';
import { ItemPedido, Pedido, PedidoDocument } from '../pedidos/pedido.schema';
import { Produto } from '../produtos/produto.schema';
import { PushService } from '../push/push.service';
import { CriarPedidoDto, PreCadastroDto } from './publico.dto';
import { SessaoPublica, SessaoPublicaDocument } from './sessao.schema';

@Injectable()
export class PublicoService {
  constructor(
    @InjectModel(Produto.name) private readonly produtos: Model<Produto>,
    @InjectModel(Cliente.name) private readonly clientes: Model<Cliente>,
    @InjectModel(Pedido.name) private readonly pedidos: Model<PedidoDocument>,
    @InjectModel(SessaoPublica.name)
    private readonly sessoes: Model<SessaoPublicaDocument>,
    @InjectModel(Configuracao.name)
    private readonly configuracoes: Model<Configuracao>,
    private readonly contador: ContadorService,
    private readonly push: PushService,
    private readonly notificacoes: NotificacoesService,
  ) {}

  /** Nome, logo e WhatsApp — o cabeçalho da loja no catálogo. */
  async loja() {
    const config = await this.configuracoes.findOne().lean().exec();

    return {
      nomeLoja: config?.nomeLoja ?? 'Catálogo',
      logoUrl: config?.logoUrl ?? null,
      telefone: config?.telefone ?? null,
      endereco: config?.endereco ?? null,
    };
  }

  /**
   * O catálogo como o cliente vê.
   *
   * Monta o objeto campo a campo em vez de devolver o produto inteiro.
   * É deliberado: o documento do produto carrega preço de compra,
   * margem, lucro e saldo de estoque, e devolvê-lo "só filtrando no
   * front" publicaria tudo isso na resposta da API para quem abrisse o
   * DevTools. Aqui esses campos nem saem do servidor.
   *
   * De estoque sai apenas disponível ou não — a mesma regra do catálogo
   * em PDF.
   */
  async catalogo() {
    const produtos = await this.produtos
      .find({ ativo: true })
      .populate('categoria', 'nome cor icone')
      .sort({ nome: 1 })
      .exec();

    return produtos.map((p) => {
      const variacoes = (p.variacoes ?? [])
        .filter((v) => v.ativo)
        .map((v) => {
          const id = (v as unknown as { _id: Types.ObjectId })._id;
          return {
            id: String(id),
            descricao:
              [v.tamanho, v.cor].filter(Boolean).join(' · ') || 'Padrão',
            preco: v.precoVenda ?? p.precoVenda,
            disponivel: !p.controlaEstoque || v.estoqueAtual > 0,
            fotoUrl:
              (p.fotos ?? []).find((f) => String(f.variacaoId) === String(id))
                ?.url ?? null,
          };
        });

      const categoria = p.categoria as unknown as { nome?: string } | null;

      return {
        id: String((p as unknown as { _id: Types.ObjectId })._id),
        nome: p.nome,
        descricao: p.descricao,
        preco: p.precoVenda,
        fotoUrl: p.fotos?.[0]?.url ?? null,
        fotos: (p.fotos ?? []).map((f) => f.url),
        categoria: categoria?.nome ?? 'Outros',
        disponivel: !p.controlaEstoque || p.estoqueAtual > 0,
        usaVariacoes: variacoes.length > 0,
        variacoes,
      };
    });
  }

  /**
   * Pré-cadastro: nome e WhatsApp, sem senha.
   *
   * Reaproveita o cliente que já existe com aquele telefone em vez de
   * criar um duplicado — assim o pedido do catálogo cai na mesma ficha
   * de quem já compra no balcão, e a loja não fica com dois cadastros
   * da mesma pessoa.
   */
  async preCadastro(dto: PreCadastroDto) {
    const telefone = dto.telefone.replace(/\D/g, '');

    let cliente = await this.clientes.findOne({ telefone }).exec();

    if (!cliente) {
      cliente = await this.clientes.create({
        nome: dto.nome.trim(),
        telefone,
      });
    }

    const token = randomBytes(32).toString('hex');

    const endereco = dto.endereco?.trim() || null;

    /**
     * O endereço também vai para a ficha do cliente quando ela ainda
     * não tem um. Assim a loja consulta a entrega pelo cadastro de
     * sempre, sem precisar abrir o pedido.
     */
    if (endereco && !cliente.endereco) {
      cliente.endereco = endereco;
      await cliente.save();
    }

    const sessao = await this.sessoes.create({
      token,
      cliente: (cliente as unknown as { _id: Types.ObjectId })._id,
      nome: dto.nome.trim(),
      telefone,
      endereco,
    });

    return {
      token: sessao.token,
      nome: sessao.nome,
      telefone: sessao.telefone,
      endereco: sessao.endereco,
    };
  }

  /**
   * Entrar com o número já conhecido.
   *
   * Devolve 404 quando o telefone não está cadastrado — é o que o site
   * usa para decidir entre "entrar" e "pedir nome e endereço".
   */
  async entrar(telefoneBruto: string) {
    const telefone = telefoneBruto.replace(/\D/g, '');

    const cliente = await this.clientes.findOne({ telefone, ativo: true }).exec();

    if (!cliente) {
      throw new NotFoundException(
        'Não encontrei esse número. Vamos fazer seu cadastro.',
      );
    }

    const token = randomBytes(32).toString('hex');

    const sessao = await this.sessoes.create({
      token,
      cliente: (cliente as unknown as { _id: Types.ObjectId })._id,
      nome: cliente.nome,
      telefone,
      endereco: cliente.endereco ?? null,
    });

    return {
      token: sessao.token,
      nome: sessao.nome,
      telefone: sessao.telefone,
      endereco: sessao.endereco,
    };
  }

  /** Traduz o token do navegador na sessão. */
  private async sessaoPeloToken(token: string | undefined) {
    if (!token) throw new UnauthorizedException('Faça seu cadastro primeiro');

    const sessao = await this.sessoes.findOne({ token }).exec();
    if (!sessao) throw new UnauthorizedException('Cadastro não encontrado');

    return sessao;
  }

  /**
   * Quem é, e o que ainda dá para preencher.
   *
   * `travados` diz quais campos já têm valor. É por ele que o site
   * mostra o cadeado e o recado de falar com a loja, em vez de exibir
   * um campo editável que a API vai recusar depois.
   */
  async euSou(token: string | undefined) {
    const sessao = await this.sessaoPeloToken(token);

    sessao.ultimoUso = new Date();
    await sessao.save();

    const cliente = await this.clientes.findById(sessao.cliente).lean().exec();

    return {
      nome: cliente?.nome ?? sessao.nome,
      telefone: cliente?.telefone ?? sessao.telefone,
      endereco: cliente?.endereco ?? sessao.endereco,
      email: cliente?.email ?? null,
      documento: cliente?.documento ?? null,
      travados: {
        nome: true,
        telefone: true,
        endereco: !!cliente?.endereco,
        email: !!cliente?.email,
        documento: !!cliente?.documento,
      },
    };
  }

  /**
   * Preencher o que falta na ficha — só o que está vazio.
   *
   * Corrigir um dado já preenchido exige falar com a loja, e isso é
   * decisão do negócio, não limitação técnica: o endereço e o
   * documento entram em entrega e em nota, e deixar o cliente
   * reescrevê-los sozinho abriria caminho para pedido desviado ou nota
   * emitida no nome errado. Preencher o que falta é seguro; reescrever
   * o que existe, não.
   */
  async completarPerfil(
    token: string | undefined,
    dados: { email?: string; endereco?: string; documento?: string },
  ) {
    const sessao = await this.sessaoPeloToken(token);

    const cliente = await this.clientes.findById(sessao.cliente).exec();
    if (!cliente) throw new NotFoundException('Cadastro não encontrado');

    const travados: string[] = [];
    const campos: Record<string, string> = {};

    const tentar = (campo: 'email' | 'endereco' | 'documento', valor?: string) => {
      const limpo = valor?.trim();
      if (!limpo) return;

      if (cliente[campo]) {
        travados.push(campo);
        return;
      }
      campos[campo] = limpo;
    };

    tentar('email', dados.email);
    tentar('endereco', dados.endereco);
    tentar('documento', dados.documento?.replace(/\D/g, ''));

    if (travados.length) {
      const nomes: Record<string, string> = {
        email: 'e-mail',
        endereco: 'endereço',
        documento: 'CPF',
      };

      throw new BadRequestException(
        `Para alterar ${travados.map((t) => nomes[t]).join(' e ')}, ` +
          'fale com a loja pelo WhatsApp.',
      );
    }

    Object.assign(cliente, campos);
    await cliente.save();

    // o endereço novo vale para o próximo pedido sem redigitar
    if (campos.endereco) {
      sessao.endereco = campos.endereco;
      await sessao.save();
    }

    return this.euSou(token);
  }

  /**
   * Registra o pedido.
   *
   * Os preços vêm do BANCO, nunca do que o navegador mandou: o corpo da
   * requisição é editável por qualquer um, e aceitar preço de lá
   * deixaria um lençol de R$ 300 ser pedido por R$ 3. O cliente só diz
   * o que quer e quanto — o valor quem decide é o servidor.
   *
   * Também NÃO baixa estoque. Pedido é intenção; a mercadoria só sai
   * quando a loja confirma e a venda nasce.
   */
  async criarPedido(token: string | undefined, dto: CriarPedidoDto) {
    const sessao = await this.sessaoPeloToken(token);

    /**
     * Entrega sem endereço é um pedido que a loja não consegue cumprir.
     * A validação mora aqui, e não no DTO, porque depende de OUTRO
     * campo do mesmo corpo — e é o tipo de regra que o class-validator
     * expressa mal.
     */
    const endereco = dto.endereco?.trim() || sessao.endereco || null;

    if (dto.entrega === 'entrega' && !endereco) {
      throw new BadRequestException(
        'Informe o endereço para entrega, ou escolha retirar na loja',
      );
    }

    const itens: ItemPedido[] = [];

    for (const pedido of dto.itens) {
      const produto = await this.produtos.findById(pedido.produto).exec();

      if (!produto || !produto.ativo) {
        throw new BadRequestException('Um dos produtos não está mais à venda');
      }

      let variacaoId: Types.ObjectId | null = null;
      let variacaoDescricao: string | null = null;
      let preco = produto.precoVenda;

      if ((produto.variacoes ?? []).length > 0) {
        if (!pedido.variacao) {
          throw new BadRequestException(
            `Escolha a opção de "${produto.nome}"`,
          );
        }

        const variacao = produto.variacoes.find(
          (v) =>
            String((v as unknown as { _id: Types.ObjectId })._id) ===
            pedido.variacao,
        );

        if (!variacao || !variacao.ativo) {
          throw new BadRequestException(
            `A opção escolhida de "${produto.nome}" não está mais disponível`,
          );
        }

        variacaoId = (variacao as unknown as { _id: Types.ObjectId })._id;
        variacaoDescricao =
          [variacao.tamanho, variacao.cor].filter(Boolean).join(' · ') ||
          'Padrão';
        preco = variacao.precoVenda ?? produto.precoVenda;
      }

      itens.push({
        produto: (produto as unknown as { _id: Types.ObjectId })._id,
        produtoNome: produto.nome,
        variacao: variacaoId,
        variacaoDescricao,
        quantidade: pedido.quantidade,
        precoUnitario: preco,
        total: dinheiro(preco * pedido.quantidade),
      });
    }

    const total = dinheiro(itens.reduce((s, i) => s + i.total, 0));
    const numero = await this.contador.proximo('pedido');

    if (
      dto.formaPagamento === 'dinheiro' &&
      dto.trocoPara != null &&
      dto.trocoPara > 0 &&
      dto.trocoPara < total
    ) {
      throw new BadRequestException(
        `O troco pedido (${moeda(dto.trocoPara)}) é menor que o total ` +
          `(${moeda(total)}). Confira o valor.`,
      );
    }

    // guarda o endereço na sessão para o próximo pedido já vir preenchido
    if (endereco && endereco !== sessao.endereco) {
      sessao.endereco = endereco;
      await sessao.save();
    }

    const criado = await this.pedidos.create({
      numero,
      cliente: sessao.cliente,
      clienteNome: sessao.nome,
      clienteTelefone: sessao.telefone,
      sessao: (sessao as unknown as { _id: Types.ObjectId })._id,
      itens,
      total,
      entrega: dto.entrega,
      endereco: dto.entrega === 'entrega' ? endereco : null,
      formaPagamento: dto.formaPagamento,
      trocoPara:
        dto.formaPagamento === 'dinheiro' ? (dto.trocoPara ?? null) : null,
      observacao: dto.observacao?.trim() || null,
      status: 'novo',
    });

    await this.avisarALoja(criado);

    return this.paraOCliente(criado);
  }

  /**
   * Avisa a loja na hora.
   *
   * Aqui o push é imediato, ao contrário dos avisos de estoque: pedido
   * é evento, e um cliente esperando resposta não pode depender do
   * resumo do dia seguinte. Falhar não pode derrubar o pedido — ele já
   * está gravado, e a tela de pedidos mostra de qualquer jeito.
   */
  private async avisarALoja(pedido: PedidoDocument) {
    const itens = pedido.itens.reduce((s, i) => s + i.quantidade, 0);

    try {
      await this.push.enviar(
        'Novo pedido',
        `${pedido.clienteNome} pediu ${itens} ${itens === 1 ? 'item' : 'itens'} · ` +
          pedido.total.toLocaleString('pt-BR', {
            style: 'currency',
            currency: 'BRL',
          }),
        { tela: 'PedidoDetalhe', id: String(pedido._id) },
      );
    } catch {
      // sem push a loja ainda vê o pedido na tela; perder o aviso é
      // ruim, perder o pedido seria pior
    }

    await this.notificacoes.avisarPedidoNovo({
      pedidoId: pedido._id,
      numero: pedido.numero,
      clienteNome: pedido.clienteNome,
      total: pedido.total,
    });
  }

  /** Os pedidos deste navegador, do mais novo para trás. */
  async meusPedidos(token: string | undefined) {
    const sessao = await this.sessaoPeloToken(token);

    /**
     * Por CLIENTE, não por sessão.
     *
     * Antes era por sessão, para ninguém digitar o telefone de outra
     * pessoa e ler as compras dela. Com o login por número, essa
     * proteção deixou de existir por decisão de produto — e prender o
     * histórico à sessão só faria o login não mostrar nada em aparelho
     * novo, que é justamente para o que ele serve.
     *
     * O que protege agora é só conhecer o número. Confirmação por
     * código no WhatsApp resolveria; ainda não existe.
     */
    const pedidos = await this.pedidos
      .find({ cliente: sessao.cliente })
      .sort({ criadoEm: -1 })
      .limit(50)
      .exec();

    return pedidos.map((p) => this.paraOCliente(p));
  }

  /**
   * O pedido como o cliente pode ver.
   *
   * Recorta os campos de propósito: o documento guarda o motivo da
   * recusa e o id da venda, que são anotações internas da loja.
   */
  private paraOCliente(pedido: PedidoDocument) {
    return {
      id: String(pedido._id),
      numero: pedido.numero,
      status: pedido.status,
      total: pedido.total,
      entrega: pedido.entrega,
      endereco: pedido.endereco,
      formaPagamento: pedido.formaPagamento,
      trocoPara: pedido.trocoPara,
      observacao: pedido.observacao,
      criadoEm: pedido.criadoEm,
      itens: pedido.itens.map((i) => ({
        produtoNome: i.produtoNome,
        variacaoDescricao: i.variacaoDescricao,
        quantidade: i.quantidade,
        precoUnitario: i.precoUnitario,
        total: i.total,
      })),
    };
  }
}
