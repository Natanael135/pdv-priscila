import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { dinheiro } from '../common/margem';
import { Venda } from '../vendas/venda.schema';
import { Caixa, CaixaDocument } from './caixa.schema';

@Injectable()
export class CaixaService {
  constructor(
    @InjectModel(Caixa.name) private readonly modelo: Model<CaixaDocument>,
    @InjectModel(Venda.name) private readonly vendas: Model<Venda>,
  ) {}

  /** O caixa aberto agora, ou null. */
  aberto() {
    return this.modelo.findOne({ status: 'aberto' }).exec();
  }

  async abrir(valorAbertura = 0) {
    const jaAberto = await this.aberto();
    if (jaAberto) {
      throw new BadRequestException(
        'Já existe um caixa aberto. Feche o atual antes de abrir outro.',
      );
    }

    return this.modelo.create({ valorAbertura: dinheiro(valorAbertura) });
  }

  async obter(id: string) {
    const caixa = await this.modelo.findById(id).exec();
    if (!caixa) throw new NotFoundException('Caixa não encontrado');
    return caixa;
  }

  historico(limite = 30) {
    return this.modelo.find().sort({ abertoEm: -1 }).limit(limite).exec();
  }

  vendasDoCaixa(id: string) {
    return this.vendas
      .find({ caixa: id, status: 'concluida' })
      .sort({ data: -1 })
      .exec();
  }

  /**
   * O que deveria estar na gaveta.
   *
   * Só dinheiro vivo entra na conta: Pix e cartão caem na conta do
   * banco, não na gaveta. Somá-los aqui faria toda conferência acusar
   * uma falta enorme que não existe.
   */
  async previa(id: string) {
    const caixa = await this.obter(id);

    const porForma = await this.vendas.aggregate<{ _id: string; valor: number }>([
      { $match: { caixa: new Types.ObjectId(id), status: 'concluida' } },
      { $unwind: '$pagamentos' },
      {
        $group: {
          _id: '$pagamentos.forma',
          valor: { $sum: '$pagamentos.valor' },
        },
      },
    ]);

    const formas: Record<string, number> = {};
    for (const f of porForma) formas[f._id] = dinheiro(f.valor);

    const sangria = caixa.movimentos
      .filter((m) => m.tipo === 'sangria')
      .reduce((s, m) => s + m.valor, 0);

    const suprimento = caixa.movimentos
      .filter((m) => m.tipo === 'suprimento')
      .reduce((s, m) => s + m.valor, 0);

    const dinheiroVendas = formas.dinheiro ?? 0;

    return {
      caixaId: String(caixa._id),
      abertura: caixa.valorAbertura,
      dinheiro: dinheiroVendas,
      suprimento: dinheiro(suprimento),
      sangria: dinheiro(sangria),
      esperado: dinheiro(
        caixa.valorAbertura + dinheiroVendas + suprimento - sangria,
      ),
      totalVendas: dinheiro(
        Object.values(formas).reduce((s, v) => s + v, 0),
      ),
      porForma: formas,
    };
  }

  async fechar(valorInformado: number, observacao?: string) {
    const caixa = await this.aberto();
    if (!caixa) throw new BadRequestException('Nenhum caixa aberto');

    const previa = await this.previa(String(caixa._id));
    const informado = dinheiro(valorInformado);

    caixa.status = 'fechado';
    caixa.fechadoEm = new Date();
    caixa.valorInformado = informado;
    caixa.valorEsperado = previa.esperado;
    caixa.diferenca = dinheiro(informado - previa.esperado);
    caixa.observacao = observacao ?? null;
    await caixa.save();

    return { ...previa, informado, diferenca: caixa.diferenca, caixa };
  }

  async registrarMovimento(
    id: string,
    dados: { tipo: 'sangria' | 'suprimento'; valor: number; motivo?: string },
  ) {
    const caixa = await this.obter(id);

    if (caixa.status === 'fechado') {
      throw new BadRequestException('Este caixa já foi fechado');
    }

    caixa.movimentos.push({
      tipo: dados.tipo,
      valor: dinheiro(dados.valor),
      motivo: dados.motivo ?? null,
    });

    await caixa.save();
    return caixa;
  }

  async excluirMovimento(id: string, movimentoId: string) {
    const caixa = await this.obter(id);

    if (caixa.status === 'fechado') {
      throw new BadRequestException(
        'Este caixa já foi fechado — a conferência não pode mudar depois.',
      );
    }

    const antes = caixa.movimentos.length;
    caixa.movimentos = caixa.movimentos.filter(
      (m) => String((m as unknown as { _id: Types.ObjectId })._id) !== movimentoId,
    );

    if (caixa.movimentos.length === antes) {
      throw new NotFoundException('Movimento não encontrado');
    }

    await caixa.save();
    return caixa;
  }
}
