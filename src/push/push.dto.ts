import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';

export class RegistrarDispositivoDto {
  /**
   * Token da Expo. O formato é validado aqui porque um token inválido
   * só falharia lá na frente, no envio, e sem dizer de qual aparelho
   * veio — barrar na entrada é bem mais barato de diagnosticar.
   */
  @IsString()
  @Matches(/^Expo(nent)?PushToken\[[^\]]+\]$/, {
    message: 'Token de push inválido',
  })
  token: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  plataforma?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  nome?: string;
}
