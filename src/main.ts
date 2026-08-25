import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { MongoExceptionFilter } from './common/mongo-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // O app roda no celular, em outro domínio (e no Expo, em outra porta).
  // Sem login ainda, então não há cookie/credencial para proteger.
  app.enableCors({ origin: true });

  app.setGlobalPrefix('api');

  // sem isso, índice único violado vira 500 sem explicação
  app.useGlobalFilters(new MongoExceptionFilter());

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // descarta campo que não está no DTO
      forbidNonWhitelisted: true, // e avisa em vez de ignorar em silêncio
      transform: true, // converte "12.5" do JSON em number de verdade
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  const porta = process.env.PORT ?? 3000;
  await app.listen(porta, '0.0.0.0'); // 0.0.0.0: o celular precisa alcançar

  console.log(`API do PDV rodando em http://localhost:${porta}/api`);
}

void bootstrap();
