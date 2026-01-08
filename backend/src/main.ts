import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe, BadRequestException } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import compression from 'compression';
import * as bodyParser from 'body-parser';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Aumentar limite de upload para 200MB
  app.use(bodyParser.json({ limit: '200mb' }));
  app.use(bodyParser.urlencoded({ limit: '200mb', extended: true }));

  // CORS
  app.enableCors({
    origin: process.env.CORS_ORIGINS
      ? process.env.CORS_ORIGINS.split(',').map((o) => o.trim())
      : ['http://localhost:5173', 'http://localhost:3001'],
    credentials: true,
  });

  // Compression
  app.use(compression());

  // Global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
      exceptionFactory: (errors) => {
        const messages = errors.map(error => {
          const constraints = Object.values(error.constraints || {});
          return `${error.property}: ${constraints.join(', ')}`;
        });
        return new BadRequestException({
          statusCode: 400,
          message: 'Erro de validação',
          errors: messages,
        });
      },
    }),
  );

  // Swagger/OpenAPI Documentation
  const config = new DocumentBuilder()
    .setTitle('NewVend API')
    .setDescription('API para gerenciamento de atendimento WhatsApp')
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
    .addTag('auth', 'Autenticação')
    .addTag('users', 'Usuários')
    .addTag('conversations', 'Conversas')
    .addTag('lines', 'Linhas')
    .addTag('campaigns', 'Campanhas')
    .addTag('reports', 'Relatórios')
    .addTag('control-panel', 'Painel de Controle')
    .addTag('api-messages', 'API de Mensagens')
    .addServer(process.env.API_URL || 'http://localhost:3000', 'Servidor Principal')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document, {
    swaggerOptions: {
      persistAuthorization: true,
      tagsSorter: 'alpha',
      operationsSorter: 'alpha',
    },
  });

  // Global interceptor para charset UTF-8
  app.use((req, res, next) => {
    if (req.url.startsWith('/api/') && res.getHeader('Content-Type')?.toString().includes('json')) {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
    }
    next();
  });

  const port = process.env.PORT || 3000;
  await app.listen(port);
  console.log(`🚀 Application is running on: http://localhost:${port}`);
  console.log(`📚 Swagger documentation: http://localhost:${port}/api/docs`);
}

bootstrap();
