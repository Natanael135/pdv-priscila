import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { MongoExceptionFilter } from './common/mongo-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  /**
   * Três clientes, todos em outro domínio: o app no celular, o Expo em
   * outra porta, e o catálogo publicado na Vercel/Netlify.
   *
   * `origin: true` reflete a origem de quem pediu, liberando todas.
   * Não há cookie nem sessão de navegador a proteger aqui — a API ainda
   * não tem login, o que é um assunto à parte e mais sério do que CORS.
   */
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
