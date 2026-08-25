import {
  Injectable,
  InternalServerErrorException,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UploadApiResponse, v2 as cloudinary } from 'cloudinary';

export interface FotoEnviada {
  url: string;
  publicId: string;
}

@Injectable()
export class UploadsService implements OnModuleInit {
  private readonly logger = new Logger(UploadsService.name);
  private configurado = false;

  constructor(private readonly config: ConfigService) {}

  onModuleInit() {
    const cloudName = this.config.get<string>('CLOUDINARY_CLOUD_NAME');
    const apiKey = this.config.get<string>('CLOUDINARY_API_KEY');
    const apiSecret = this.config.get<string>('CLOUDINARY_API_SECRET');

    if (!cloudName || !apiKey || !apiSecret) {
      // A API sobe mesmo assim: dá para cadastrar produto sem foto, e
      // travar tudo por causa de imagem seria pior. O erro aparece só
      // quando alguém tenta enviar uma foto de fato.
      this.logger.warn(
        'Cloudinary não configurado — o envio de fotos vai falhar. ' +
          'Preencha CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY e ' +
          'CLOUDINARY_API_SECRET no .env',
      );
      return;
    }

    cloudinary.config({
      cloud_name: cloudName,
      api_key: apiKey,
      api_secret: apiSecret,
      secure: true,
    });

    this.configurado = true;
  }

  /**
   * Sobe a imagem já redimensionada pelo Cloudinary.
   *
   * A transformação acontece no servidor deles: a foto chega com 4 MB
   * do celular e fica guardada em 900px de largura, com qualidade
   * automática. Sem isso, a lista de produtos no 4G da loja demoraria
   * para carregar cada miniatura.
   */
  async enviar(arquivo: Express.Multer.File): Promise<FotoEnviada> {
    if (!this.configurado) {
      throw new InternalServerErrorException(
        'Cloudinary não configurado no servidor. Confira o .env da API.',
      );
    }

    const resultado = await new Promise<UploadApiResponse>((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          folder: 'pdv/produtos',
          resource_type: 'image',
          transformation: [
            { width: 900, crop: 'limit' },
            { quality: 'auto:good' },
            { fetch_format: 'auto' },
          ],
        },
        (erro, resposta) => {
          if (erro || !resposta) {
            return reject(
              erro instanceof Error ? erro : new Error('Falha ao enviar a imagem'),
            );
          }
          resolve(resposta);
        },
      );

      stream.end(arquivo.buffer);
    });

    return { url: resultado.secure_url, publicId: resultado.public_id };
  }

  /**
   * Apaga a imagem antiga. Falha aqui não derruba a operação principal —
   * produto excluído com foto órfã é bem menos ruim que exclusão travada.
   *
   * `invalidate` pede ao Cloudinary que limpe também as cópias no CDN.
   * Sem isso o arquivo some do armazenamento mas a URL continua
   * respondendo por um tempo, servida do cache.
   */
  async remover(publicId: string): Promise<void> {
    if (!this.configurado || !publicId) return;

    try {
      await cloudinary.uploader.destroy(publicId, { invalidate: true });
    } catch (erro) {
      this.logger.warn(
        `Não consegui apagar a imagem ${publicId} do Cloudinary: ${String(erro)}`,
      );
    }
  }
}
