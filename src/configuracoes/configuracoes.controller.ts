import { Body, Controller, Get, Patch } from '@nestjs/common';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { ConfiguracoesService } from './configuracoes.service';

const vazioVirarNulo = () =>
  Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' && value.trim() === '' ? null : value,
  );

class AtualizarConfiguracaoDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  nomeLoja?: string;

  @IsOptional()
  @vazioVirarNulo()
  @IsString()
  telefone?: string | null;

  @IsOptional()
  @vazioVirarNulo()
  @IsString()
  endereco?: string | null;

  @IsOptional()
  @IsBoolean()
  alertaEstoque?: boolean;

  @IsOptional()
  @IsInt()
  @Min(1, { message: 'O prazo do fiado precisa ser de pelo menos 1 dia' })
  diasFiadoPadrao?: number;
}

@Controller('configuracoes')
export class ConfiguracoesController {
  constructor(private readonly service: ConfiguracoesService) {}

  @Get()
  obter() {
    return this.service.obter();
  }

  @Patch()
  atualizar(@Body() dto: AtualizarConfiguracaoDto) {
    return this.service.atualizar(dto);
  }
}
