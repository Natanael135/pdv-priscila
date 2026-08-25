import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';
import { MongoServerError } from 'mongodb';

/**
 * Traduz erro do Mongo em resposta que dá para mostrar na tela.
 *
 * Sem isso, violar um índice único devolve "Internal server error" com
 * status 500 — o app não consegue explicar nada ao usuário, e parece
 * que o sistema quebrou quando na verdade foi só um cadastro repetido.
 */
@Catch(MongoServerError)
export class MongoExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(MongoExceptionFilter.name);

  catch(erro: MongoServerError, host: ArgumentsHost) {
    const resposta = host.switchToHttp().getResponse<Response>();

    // 11000 = chave duplicada
    if (erro.code === 11000) {
      const campo = Object.keys(erro.keyPattern ?? {})[0] ?? 'campo';
      const valor = erro.keyValue?.[campo];

      return resposta.status(HttpStatus.CONFLICT).json({
        statusCode: HttpStatus.CONFLICT,
        error: 'Conflict',
        message: mensagemDuplicado(campo, valor),
      });
    }

    // Transação pedida num Mongo que não é replica set (mongod solto)
    if (erro.codeName === 'IllegalOperation' || erro.code === 20) {
      this.logger.error(`Mongo recusou a operação: ${erro.message}`);
      return resposta.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        error: 'Internal Server Error',
        message:
          'O banco recusou a transação. Isso acontece quando o MongoDB não ' +
          'está em replica set — o Atlas já vem configurado; um mongod local ' +
          'precisa ser iniciado como replica set.',
      });
    }

    this.logger.error(`Erro do Mongo (${erro.code}): ${erro.message}`);

    return resposta.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      error: 'Internal Server Error',
      message: 'Erro ao gravar no banco de dados.',
    });
  }
}

function mensagemDuplicado(campo: string, valor: unknown): string {
  const rotulos: Record<string, string> = {
    nome: 'Já existe um cadastro com esse nome',
    codigoBarras: 'Esse código de barras já está em outro produto',
    numero: 'Número de venda repetido',
    telefone: 'Esse telefone já está em outro cliente',
  };

  const base = rotulos[campo] ?? `Já existe um registro com esse ${campo}`;
  return valor ? `${base}: ${String(valor)}` : base;
}
