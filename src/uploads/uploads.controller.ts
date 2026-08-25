import {
  Controller,
  Delete,
  HttpCode,
  Param,
  ParseFilePipe,
  Post,
  UploadedFile,
  UseInterceptors,
  FileTypeValidator,
  MaxFileSizeValidator,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { UploadsService } from './uploads.service';

@Controller('uploads')
export class UploadsController {
  constructor(private readonly service: UploadsService) {}

  @Post('foto')
  @UseInterceptors(FileInterceptor('arquivo'))
  enviar(
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          // 8 MB: o celular manda foto grande; quem encolhe é o Cloudinary
          new MaxFileSizeValidator({ maxSize: 8 * 1024 * 1024 }),
          new FileTypeValidator({ fileType: /^image\/(jpeg|png|webp)$/ }),
        ],
      }),
    )
    arquivo: Express.Multer.File,
  ) {
    return this.service.enviar(arquivo);
  }

  /** publicId vem com barra ("pdv/produtos/abc"), por isso o wildcard. */
  @Delete('foto/*publicId')
  @HttpCode(204)
  remover(@Param('publicId') publicId: string[] | string) {
    const id = Array.isArray(publicId) ? publicId.join('/') : publicId;
    return this.service.remover(id);
  }
}
