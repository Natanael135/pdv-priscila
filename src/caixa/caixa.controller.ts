import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import {
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { CaixaService } from './caixa.service';

class AbrirCaixaDto {
  @IsOptional()
  @IsNumber()
  @Min(0)
  valorAbertura?: number;
}

class FecharCaixaDto {
  @IsNumber({}, { message: 'Informe quanto tinha na gaveta' })
  @Min(0)
  valorInformado: number;

  @IsOptional()
  @IsString()
  observacao?: string;
}

class MovimentoCaixaDto {
  @IsEnum(['sangria', 'suprimento'], {
    message: 'tipo deve ser sangria ou suprimento',
  })
  tipo: 'sangria' | 'suprimento';

  @IsNumber({}, { message: 'Informe o valor' })
  @Min(0.01, { message: 'O valor precisa ser maior que zero' })
  valor: number;

  @IsOptional()
  @IsString()
  motivo?: string;
}

@Controller('caixa')
export class CaixaController {
  constructor(private readonly service: CaixaService) {}

  @Get('aberto')
  aberto() {
    return this.service.aberto();
  }

  @Get('historico')
  historico(@Query('limite') limite?: string) {
    return this.service.historico(Number(limite) || 30);
  }

  @Post('abrir')
  abrir(@Body() dto: AbrirCaixaDto) {
    return this.service.abrir(dto.valorAbertura ?? 0);
  }

  @Post('fechar')
  fechar(@Body() dto: FecharCaixaDto) {
    return this.service.fechar(dto.valorInformado, dto.observacao);
  }

  @Get(':id')
  obter(@Param('id') id: string) {
    return this.service.obter(id);
  }

  /** Prévia da conferência, sem fechar nada. */
  @Get(':id/previa')
  previa(@Param('id') id: string) {
    return this.service.previa(id);
  }

  @Get(':id/vendas')
  vendas(@Param('id') id: string) {
    return this.service.vendasDoCaixa(id);
  }

  @Post(':id/movimentos')
  registrarMovimento(@Param('id') id: string, @Body() dto: MovimentoCaixaDto) {
    return this.service.registrarMovimento(id, dto);
  }

  @Delete(':id/movimentos/:movimentoId')
  excluirMovimento(
    @Param('id') id: string,
    @Param('movimentoId') movimentoId: string,
  ) {
    return this.service.excluirMovimento(id, movimentoId);
  }
}
