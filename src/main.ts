// src/main.ts
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Logger, ValidationPipe } from '@nestjs/common';
import helmet from 'helmet';
import { corsOrigins, isOriginAllowed } from './common/cors-origins';
import { trustProxySetting } from './common/client-ip';
import { apiDocsEnabled } from './common/api-docs';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';

const DEFAULT_BODY_LIMIT = '2mb';
const TRANSCRIBE_PATH = '/transcription/transcribe';
const TRANSCRIBE_BODY_LIMIT = '34mb';

const logger = new Logger('Bootstrap');

const configBool = (v: string | undefined): boolean => v === 'true' || v === '1';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // How many proxies to believe about the caller's address. Rate limiting and
  // the audit trail both key on req.ip, so getting this wrong either lumps
  // every user behind the proxy into one bucket, or lets a caller choose the
  // address recorded against them. See common/client-ip.ts.
  app.set('trust proxy', trustProxySetting());

  // Request body limits. Only dictation sends a large body — audio as base64
  // text, up to Groq's 25 MB file limit, so about 34 MB encoded — and only its
  // route gets a large limit. Everything else is capped at 2 MB, so a caller
  // cannot make every endpoint parse tens of megabytes (penetration test
  // F-08). Uploaded files are multipart and capped by their own routes.
  // Registered before Nest's own parsers, which then leave a parsed body be.
  const express = require('express');
  app.use(TRANSCRIBE_PATH, express.json({ limit: TRANSCRIBE_BODY_LIMIT }));
  app.use(express.json({ limit: DEFAULT_BODY_LIMIT }));
  app.use(express.urlencoded({ limit: DEFAULT_BODY_LIMIT, extended: true }));

  // Security headers. The API serves JSON, not pages, so a restrictive policy
  // costs nothing — but Swagger UI is a page, and it needs inline styles and
  // its own scripts, so the directives below keep it working.
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          // Inline script is needed only by the Swagger page, so it is
          // allowed only while that page is served.
          scriptSrc: apiDocsEnabled() ? ["'self'", "'unsafe-inline'"] : ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:', 'https:'],
          connectSrc: ["'self'"],
          objectSrc: ["'none'"],
          frameAncestors: ["'none'"],
          upgradeInsecureRequests: [],
        },
      },
      // The API is HTTPS-only in front of Render's proxy; a year of HSTS with
      // subdomains is the usual baseline.
      hsts: { maxAge: 31_536_000, includeSubDomains: true, preload: false },
      crossOriginEmbedderPolicy: false,
    }),
  );

  // CORS — an allow-list, not a wildcard.
  //
  // `origin: '*'` with `credentials: true` is not even valid per the CORS
  // spec; browsers refuse the pair. More to the point, DHA's Technical
  // Specifications call for a restrictive allow-list.
  //
  // CORS_ORIGINS is authoritative when set (comma-separated). Otherwise the
  // list is built from FRONTEND_URL plus the local dev servers, so a fresh
  // checkout works without configuration. CORS_ALLOW_ALL=true restores the old
  // behaviour — an escape hatch, not a setting to leave on.
  const allowAll = configBool(process.env.CORS_ALLOW_ALL);
  const origins = corsOrigins();
  if (allowAll) {
    logger.warn('CORS_ALLOW_ALL is set — every origin is accepted. Do not leave this on.');
  } else {
    logger.log(`CORS allow-list: ${origins.join(', ') || '(empty — browser calls will fail)'}`);
  }

  app.enableCors({
    origin: allowAll
      ? true
      : (origin, callback) => {
          if (isOriginAllowed(origin, origins)) return callback(null, true);
          logger.warn(`CORS refused origin ${origin}`);
          return callback(null, false);
        },
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    credentials: true,
  });

  // Global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
    }),
  );

  // Swagger documentation — development only unless API_DOCS=true (api-docs.ts).
  if (apiDocsEnabled()) {
    const config = new DocumentBuilder()
      .setTitle('SOAP Notes API')
      .setDescription('Medical transcription and SOAP notes management system')
      .setVersion('1.0')
      .addBearerAuth(
        {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          name: 'JWT',
          description: 'Enter JWT token',
          in: 'header',
        },
        'JWT-auth',
      )
      .addTag('auth', 'Authentication endpoints')
      .addTag('soap-notes', 'SOAP notes management')
      .addTag('patients', 'Patient management')
      .addTag('transcription', 'Audio transcription')
      .addServer('http://localhost:3000', 'Local development')
      .addServer(process.env.PUBLIC_API_URL || 'https://api.afyascribe.co.ke', 'Production')
      .build();
  
    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api/docs', app, document, {
      swaggerOptions: {
        persistAuthorization: true,
      },
      customSiteTitle: 'SOAP Notes API Documentation',
    });
  }

  const port = process.env.PORT ?? 3000;
  
  await app.listen(port, '0.0.0.0');
  
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║                                                            ║');
  console.log(`║  🚀 Application is running on: http://localhost:${port}       ║`);
  console.log(
    apiDocsEnabled()
      ? `║  📚 Swagger docs: http://localhost:${port}/api/docs          ║`
      : `║  📚 Swagger docs: off (production; API_DOCS=true to enable) ║`,
  );
  console.log('║                                                            ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
}
bootstrap();