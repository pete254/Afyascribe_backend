import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { GlobalExceptionFilter } from './common/filters/http-exception.filter';
import { ValidationExceptionFilter } from './common/filters/validation-exception.filter';
import { DatabaseExceptionFilter } from './common/filters/database-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn', 'log', 'debug', 'verbose'],
  });

  // Enable CORS
  app.enableCors({
    origin: process.env.FRONTEND_URL || 'http://localhost:3001',
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  // Global exception filters (order matters - more specific first)
  app.useGlobalFilters(
    new DatabaseExceptionFilter(),
    new ValidationExceptionFilter(),
    new GlobalExceptionFilter(),
  );

  // Enable global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
      exceptionFactory: (errors) => {
        // Custom error messages formatting
        const messages = errors.map((error) => ({
          field: error.property,
          errors: Object.values(error.constraints || {}),
        }));
        return new Error(JSON.stringify(messages));
      },
    }),
  );

  // Setup Swagger documentation
  const config = new DocumentBuilder()
    .setTitle('SOAP Notes API')
    .setDescription(
      'Medical SOAP notes management system API\n\n' +
      'Features:\n' +
      '- JWT Authentication\n' +
      '- SOAP notes CRUD operations\n' +
      '- Pagination and filtering\n' +
      '- User-scoped data access\n' +
      '- Status tracking and statistics'
    )
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
    .addTag('auth', 'Authentication endpoints - Register and login')
    .addTag('soap-notes', 'SOAP notes management - Create, read, update, delete notes')
    .addServer('http://localhost:3000', 'Local development')
    .addServer('https://api.example.com', 'Production')
    .build();
  
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document, {
    swaggerOptions: {
      persistAuthorization: true,
      tagsSorter: 'alpha',
      operationsSorter: 'alpha',
    },
    customSiteTitle: 'SOAP Notes API Documentation',
  });

  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║                                                            ║');
  console.log(`║  🚀 Application is running on: http://localhost:${port}       ║`);
  console.log(`║  📚 Swagger docs: http://localhost:${port}/api/docs          ║`);
  console.log('║                                                            ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
}
bootstrap();