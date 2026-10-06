// src/main.ts
import { NestFactory } from '@nestjs/core';
import { Logger, ValidationPipe } from '@nestjs/common';
import helmet from 'helmet';
import { corsOrigins, isOriginAllowed } from './common/cors-origins';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';

const logger = new Logger('Bootstrap');

const configBool = (v: string | undefined): boolean => v === 'true' || v === '1';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // ✅ INCREASE BODY SIZE LIMIT (for audio files)
  app.use(require('express').json({ limit: '50mb' }));
  app.use(require('express').urlencoded({ limit: '50mb', extended: true }));

  // Security headers. The API serves JSON, not pages, so a restrictive policy
  // costs nothing — but Swagger UI is a page, and it needs inline styles and
  // its own scripts, so the directives below keep it working.
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", "'unsafe-inline'"],
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

  // Swagger documentation
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
    .addServer('https://afyascribe-backend.onrender.com', 'Production')
    .build();
  
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document, {
    swaggerOptions: {
      persistAuthorization: true,
    },
    customSiteTitle: 'SOAP Notes API Documentation',
  });

  const port = process.env.PORT ?? 3000;
  
  await app.listen(port, '0.0.0.0');
  
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║                                                            ║');
  console.log(`║  🚀 Application is running on: http://localhost:${port}       ║`);
  console.log(`║  📚 Swagger docs: http://localhost:${port}/api/docs          ║`);
  console.log('║  🌐 Production: https://afyascribe-backend.onrender.com    ║');
  console.log('║                                                            ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
}
bootstrap();