import { Controller, Get } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection } from 'mongoose';

/**
 * Serve para responder rápido a "a API está no ar e enxerga o banco?"
 * — útil ao testar o túnel do celular, quando qualquer erro parece a
 * mesma coisa na tela.
 */
@Controller('health')
export class HealthController {
  constructor(@InjectConnection() private readonly conexao: Connection) {}

  @Get()
  status() {
    const estados = ['desconectado', 'conectado', 'conectando', 'desconectando'];

    return {
      api: 'ok',
      banco: estados[this.conexao.readyState] ?? 'desconhecido',
      horario: new Date().toISOString(),
    };
  }
}
