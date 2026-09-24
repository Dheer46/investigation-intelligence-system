import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { json, urlencoded } from 'express';
import { AppModule } from './app.module';

async function bootstrap() {
  // Default body-parser limit is 100kb - fine for normal API calls, but
  // enrollment/gate-verify post ~18 base64-encoded JPEG webcam frames in
  // one request (several MB), which "Request Entity Too Large" otherwise
  // rejects outright before it ever reaches AuthController.
  const app = await NestFactory.create(AppModule, { cors: true, bodyParser: false });
  app.use(json({ limit: '25mb' }));
  app.use(urlencoded({ extended: true, limit: '25mb' }));
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.setGlobalPrefix('api');
  const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
  await app.listen(port, '0.0.0.0');
  console.log(`IIS backend listening on :${port}`);
}
bootstrap();
