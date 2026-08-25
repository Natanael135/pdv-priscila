import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model, Schema as MongooseSchema } from 'mongoose';

/**
 * Numeração sequencial de venda (o "nº do cupom").
 *
 * No Postgres isso seria um `identity`. No Mongo não existe sequência,
 * e contar documentos para descobrir o próximo número dá número repetido
 * assim que duas vendas saem no mesmo instante. O jeito certo é um
 * documento contador incrementado atomicamente com $inc.
 */
export const CONTADOR = 'Contador';

export const ContadorSchema = new MongooseSchema(
  {
    _id: { type: String, required: true },
    valor: { type: Number, default: 0 },
  },
  { versionKey: false },
);

interface ContadorDoc {
  _id: string;
  valor: number;
}

@Injectable()
export class ContadorService {
  constructor(
    @InjectModel(CONTADOR) private readonly modelo: Model<ContadorDoc>,
  ) {}

  async proximo(nome: string, session?: ClientSession): Promise<number> {
    const doc = await this.modelo
      .findByIdAndUpdate(
        nome,
        { $inc: { valor: 1 } },
        { new: true, upsert: true, session },
      )
      .lean<ContadorDoc>()
      .exec();

    return doc!.valor;
  }
}
