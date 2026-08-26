import { Controller, Get, Header } from '@nestjs/common';
import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * A vitrine em si — o HTML que o cliente abre pelo link do WhatsApp.
 *
 * Fica fora do prefixo /api (ver main.ts) para o endereço ser curto o
 * bastante para caber numa conversa: /loja em vez de /api/publico/loja.
 *
 * O arquivo é lido uma vez e guardado em memória. São poucos KB, e
 * reler do disco a cada visita seria I/O à toa num servidor pequeno.
 */
@Controller('loja')
export class LojaController {
  private readonly pagina = carregarPagina();

  @Get()
  @Header('Content-Type', 'text/html; charset=utf-8')
  @Header('Cache-Control', 'public, max-age=300')
  abrir() {
    return this.pagina;
  }
}

function carregarPagina(): string {
  /**
   * __dirname aponta para dist/ depois do build, e o nest não copia
   * .html por conta própria — o `assets` no nest-cli.json é que faz
   * isso. Se algum dia sumir de lá, é aqui que estoura.
   */
  return readFileSync(join(__dirname, 'loja.html'), 'utf8');
}
