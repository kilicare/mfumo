import { NestFactory } from '@nestjs/core';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import cors from 'cors';
import compression from 'compression';
import express from 'express';
import type { ErrorRequestHandler } from 'express';
import { AppModule } from './app.module';
import { LoggerService } from './common/logger/logger.service';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: new LoggerService(),
    bodyParser: false,
  });

  // Product photos are compressed to WebP in the browser before upload.
  // Allow a bounded batch while keeping request size finite.
  app.use(express.json({ limit: '2mb' }));
  app.use(express.urlencoded({ extended: true, limit: '2mb' }));
  const bodyParserErrorHandler: ErrorRequestHandler = (error, _request, response, next) => {
    const type = (error as { type?: unknown } | null)?.type;
    if (type === 'entity.parse.failed') {
      response.status(400).json({ statusCode: 400, message: 'Malformed JSON request body' });
      return;
    }
    if (type === 'entity.too.large') {
      response.status(413).json({ statusCode: 413, message: 'Request body is too large' });
      return;
    }
    next(error);
  };
  app.use(bodyParserErrorHandler);

  const logger = new LoggerService();

  // CORS Configuration
  app.use(
    cors({
      origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
      credentials: true,
      methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
      allowedHeaders: 'Content-Type,Authorization',
    }),
  );

  // Compression
  app.use(compression());

  // Global prefix
  app.setGlobalPrefix('api/v1');

  // Swagger Documentation
  const config = new DocumentBuilder()
    .setTitle('Genuine Liquor Store API')
    .setDescription('Distribution & Business Management System API')
    .setVersion('1.0.0')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
      },
      'JWT',
    )
    .addTag('auth', 'Authentication')
    .addTag('business', 'Business Profile')
    .addTag('products', 'Products Management')
    .addTag('customers', 'Customers Management')
    .addTag('suppliers', 'Suppliers Management')
    .addTag('purchases', 'Purchase Orders')
    .addTag('sales', 'Sales Invoices')
    .addTag('inventory', 'Inventory Management')
    .addTag('payments', 'Payments')
    .addTag('expenses', 'Expenses Management')
    .addTag('reports', 'Reports & Analytics')
    .addTag('notifications', 'Notifications, templates, inbox and delivery')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  const port = process.env.API_PORT || 3002;
  await app.listen(port);

  logger.log(`🚀 Application is running on: http://localhost:${port}`);
  logger.log(`📚 Swagger docs: http://localhost:${port}/api/docs`);
}

bootstrap().catch((error) => {
  console.error('Failed to start application:', error);
  process.exit(1);
});
