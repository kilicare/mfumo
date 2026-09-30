import { NestFactory } from '@nestjs/core';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import cors from 'cors';
import compression from 'compression';
import { AppModule } from './app.module';
import { LoggerService } from './common/logger/logger.service';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: new LoggerService(),
  });

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
