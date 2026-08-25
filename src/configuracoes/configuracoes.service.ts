import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Configuracao, ConfiguracaoDocument } from './configuracao.schema';

@Injectable()
export class ConfiguracoesService {
  constructor(
    @InjectModel(Configuracao.name)
    private readonly modelo: Model<ConfiguracaoDocument>,
  ) {}

  /**
   * Sempre devolve um documento: se ainda não existe, cria com os
   * padrões. Assim o app nunca precisa tratar "configuração não
   * encontrada" na primeira abertura.
   */
  async obter() {
    const existente = await this.modelo.findOne().exec();
    if (existente) return existente;

    return this.modelo.create({});
  }

  async atualizar(mudancas: Partial<Configuracao>) {
    const config = await this.obter();

    config.set(mudancas);
    return config.save();
  }
}
