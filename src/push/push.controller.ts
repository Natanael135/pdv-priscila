import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Headers,
  Param,
  Post,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RegistrarDispositivoDto } from './push.dto';
import { PushService } from './push.service';

@Controller()
export class PushController {
  constructor(
    private readonly push: PushService,
    private readonly config: ConfigService,
  ) {}

  @Post('dispositivos')
  registrar(@Body() dto: RegistrarDispositivoDto) {
    return this.push.registrar(dto);
  }

  @Delete('dispositivos/:token')
  remover(@Param('token') token: string) {
    return this.push.remover(token);
  }

  /**
   * Dispara o resumo dos avisos pendentes.
   *
   * Existe como endpoint, e não como agendamento interno, porque a API
   * hiberna no plano gratuito do Render — um cron dentro do processo
   * simplesmente não roda enquanto ele está dormindo. Assim quem chama
   * é um cron externo, que de quebra acorda a API.
   *
   * Protegido por segredo: sem ele, qualquer um na internet faria o
   * celular da loja apitar.
   */
  @Post('push/disparar')
  disparar(@Headers('x-push-segredo') segredo: string) {
    const esperado = this.config.get<string>('PUSH_SEGREDO');

    if (!esperado) {
      throw new ForbiddenException(
        'PUSH_SEGREDO não configurado no servidor — disparo desativado',
      );
    }
    if (segredo !== esperado) {
      throw new ForbiddenException('Segredo inválido');
    }

    return this.push.enviarResumoPendente();
  }
}
