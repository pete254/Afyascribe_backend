// src/main.ts
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // ✅ INCREASE BODY SIZE LIMIT (for audio files)
  app.use(require('express').json({ limit: '50mb' }));
  app.use(require('express').urlencoded({ limit: '50mb', extended: true }));

  // Enable CORS
  app.enableCors({
    origin: '*',
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