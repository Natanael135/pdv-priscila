import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  IsDateString,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  MaxLength,
} from 'class-validator';
import { ParcelasService } from './parcelas.service';

class ReceberParcelaDto {
  /** sem valor, quita o saldo inteiro */
  @IsOptional()
  @IsNumber()
  @IsPositive()
  valor?: number;
}

class AlterarVencimentoDto {
  @IsDateString({}, { message: 'Data de vencimento inválida' })
  vencimento: string;

  /** o combinado, em texto: "cliente pediu para deixar para o dia 10" */
  @IsOptional()
  @IsString()
  @MaxLength(140)
  motivo?: string;
}

@Controller('parcelas')
export class ParcelasController {
  constructor(private readonly service: ParcelasService) {}

  @Get()
  listar(
    @Query('cliente') cliente?: string,
    @Query('somenteVencidas') somenteVencidas?: string,
    @Query('incluirPagas') incluirPagas?: string,
  ) {
    return this.service.listar({
      cliente,
      somenteVencidas: somenteVencidas === 'true',
      incluirPagas: incluirPagas === 'true',
    });
  }

  @Get('resumo')
  resumo() {
    return this.service.resumo();
  }

  /** O app chama ao abrir, para gerar os avisos de atraso do dia. */
  @Post('sincronizar-avisos')
  sincronizar() {
    return this.service.sincronizarAvisos();
  }

  @Get(':id')
  obter(@Param('id') id: string) {
    return this.service.obter(id);
  }

  @Post(':id/receber')
  receber(@Param('id') id: string, @Body() dto: ReceberParcelaDto) {
    return this.service.receber(id, dto.valor);
  }

  @Patch(':id/vencimento')
  alterarVencimento(@Param('id') id: string, @Body() dto: AlterarVencimentoDto) {
    return this.service.alterarVencimento(id, dto.vencimento, dto.motivo);
  }

  @Delete(':id')
  @HttpCode(204)
  excluir(@Param('id') id: string) {
    return this.service.excluir(id);
  }
}
