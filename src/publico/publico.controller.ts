import { Body, Controller, Get, Headers, Post } from '@nestjs/common';
import { CriarPedidoDto, PreCadastroDto } from './publico.dto';
import { PublicoService } from './publico.service';

/**
 * Tudo que o CLIENTE acessa, sem login.
 *
 * Separado dos controllers da loja de propósito: aqui nada devolve
 * custo, margem ou saldo de estoque, e essa fronteira fica óbvia por
 * estar num módulo só. Misturar as rotas seria a forma mais fácil de
 * vazar dado do dono numa resposta pública sem ninguém perceber.
 *
 * A identificação vem do cabeçalho `x-sessao`, guardado no navegador
 * do cliente depois do pré-cadastro.
 */
@Controller('publico')
export class PublicoController {
  constructor(private readonly service: PublicoService) {}

  @Get('loja')
  loja() {
    return this.service.loja();
  }

  @Get('catalogo')
  catalogo() {
    return this.service.catalogo();
  }

  @Post('cadastro')
  preCadastro(@Body() dto: PreCadastroDto) {
    return this.service.preCadastro(dto);
  }

  @Get('eu')
  eu(@Headers('x-sessao') token: string) {
    return this.service.euSou(token);
  }

  @Post('pedidos')
  criarPedido(@Headers('x-sessao') token: string, @Body() dto: CriarPedidoDto) {
    return this.service.criarPedido(token, dto);
  }

  @Get('pedidos')
  meusPedidos(@Headers('x-sessao') token: string) {
    return this.service.meusPedidos(token);
  }
}
