import { Controller, Get, HttpCode, Res } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import type { Response } from 'express';
import { Connection } from 'mongoose';

const ESTADOS = ['desconectado', 'conectado', 'conectando', 'desconectando'];

/**
 * Endpoint de saúde, feito para monitor automático.
 *
 * A regra que importa aqui é o CÓDIGO HTTP, não o texto: um bot de
 * monitoramento olha o status, não lê JSON. Por isso devolve 503
 * quando o banco não está conectado — antes respondia 200 sempre, e um
 * monitor jamais perceberia a API no ar porém inútil, sem banco.
 */
@Controller('health')
export class HealthController {
  private readonly inicio = Date.now();

  constructor(@InjectConnection() private readonly conexao: Connection) {}

  @Get()
  status(@Res() resposta: Response) {
    // 1 = conectado (readyState do Mongoose)
    const bancoOk = this.conexao.readyState === 1;

    const corpo = {
      status: bancoOk ? 'ok' : 'degradado',
      api: 'ok',
      banco: ESTADOS[this.conexao.readyState] ?? 'desconhecido',
      uptimeSegundos: Math.floor((Date.now() - this.inicio) / 1000),
      horario: new Date().toISOString(),
    };

    return resposta.status(bancoOk ? 200 : 503).json(corpo);
  }

  /**
   * Checagem mínima, sem tocar no banco.
   *
   * Serve para o Render saber se o processo está vivo durante um
   * problema no Mongo — usar /health ali faria a plataforma reiniciar
   * o contêiner à toa quando quem caiu foi o banco.
   */
  @Get('vivo')
  @HttpCode(200)
  vivo() {
    return { vivo: true };
  }
}
