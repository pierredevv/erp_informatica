import './common/load-env';
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';
import { config } from './common/config';

// Prisma expone algunas secuencias como BigInt; JSON.stringify no las soporta.
Object.defineProperty(BigInt.prototype, 'toJSON', {
  value: function (this: bigint) {
    return this.toString();
  },
  writable: true,
  configurable: true,
});

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  app.use(cookieParser());
  app.enableCors({ origin: config.corsOrigins, credentials: true });
  app.setGlobalPrefix('api');
  await app.listen(config.apiPort, '0.0.0.0');
  console.log(`API escuchando en http://localhost:${config.apiPort}/api`);
}

void bootstrap();
