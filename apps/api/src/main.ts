import { NestFactory } from '@nestjs/core';
import { Logger, ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { json, urlencoded } from 'express';
import { AppModule } from './app.module';

/** Fail fast on a misconfigured production environment instead of booting insecurely. */
function validateEnv() {
  const prod = process.env.NODE_ENV === 'production';
  const errors: string[] = [];
  if (!process.env.DATABASE_URL) errors.push('DATABASE_URL is required');
  const secret = process.env.JWT_ACCESS_SECRET ?? '';
  if (prod) {
    if (!secret || secret === 'change-me-to-a-long-random-secret' || secret.length < 32) {
      errors.push('JWT_ACCESS_SECRET must be a strong (≥32 char) random value in production');
    }
    if (process.env.AUTH_DEV_TRUST_HEADER === 'true') {
      errors.push('AUTH_DEV_TRUST_HEADER must not be true in production');
    }
    if (!process.env.CORS_ORIGINS) {
      errors.push('CORS_ORIGINS must be set in production (the public web origin)');
    }
  }
  if (errors.length) {
    // eslint-disable-next-line no-console
    console.error('FATAL: invalid environment configuration:\n  - ' + errors.join('\n  - '));
    process.exit(1);
  }
}

async function bootstrap() {
  validateEnv();

  // Disable the default body parser so we can raise the limit — profile-photo data URLs
  // exceed Express's 100kb default and would otherwise 413.
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bodyParser: false });

  // Behind the Next.js proxy / a load balancer — trust the first X-Forwarded-* hop so the
  // real client IP is used for rate-limiting and logging.
  app.set('trust proxy', 1);

  app.use(helmet());
  app.use(cookieParser());
  app.use(json({ limit: '2mb' }));
  app.use(urlencoded({ extended: true, limit: '2mb' }));

  // CORS: pin to an explicit allow-list (never reflect arbitrary origins with credentials).
  // Normal app traffic is same-origin via the Next.js proxy, so this only matters for
  // direct cross-origin API callers. Configure with CORS_ORIGINS (comma-separated).
  const corsOrigins = (process.env.CORS_ORIGINS ?? 'http://localhost:3001,http://localhost:3000')
    .split(',').map((s) => s.trim()).filter(Boolean);
  app.enableCors({ origin: corsOrigins, credentials: true });

  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }),
  );
  app.enableShutdownHooks();

  const port = Number(process.env.API_PORT ?? 4000);
  await app.listen(port);
  Logger.log(`pdash API listening on :${port}/api/v1 (${process.env.NODE_ENV ?? 'development'})`, 'Bootstrap');
}

bootstrap();
