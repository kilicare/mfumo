import { Module, NestModule, MiddlewareConsumer } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core';

// Database
import { DatabaseModule } from './database/database.module';
import { PrismaService } from './database/prisma.service';

// Common
import { CommonModule } from './common/common.module';
import { HttpExceptionFilter, AllExceptionsFilter } from './common/filters';
import { LoggingInterceptor, TransformInterceptor } from './common/interceptors';
import { JwtAuthGuard } from './common/guards';
import { createValidationPipe } from './common/pipes';
import { LoggerMiddleware, RequestIdMiddleware } from './common/middleware';

// Auth
import { AuthModule } from './auth/auth.module';

// Business
import { BusinessModule } from './business/business.module';

// Products
import { ProductModule } from './products/product.module';

// Suppliers & Customers
import { SuppliersCustomersModule } from './suppliers-customers/suppliers-customers.module';

// Purchases
import { PurchasesModule } from './purchases/purchases.module';
import { SalesModule } from './sales/sales.module';
import { InventoryModule } from './inventory/inventory.module';
import { PaymentsModule } from './payments/payments.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { NotificationsModule } from './notifications/notifications.module';
import { SupportModule } from './support/support.module';
import { validateEnv } from './env';

// Controllers
import { AppController } from './app.controller';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', '.env.production'],
      validate: (config) => validateEnv(config),
    }),
    DatabaseModule,
    CommonModule,
    AuthModule,
    BusinessModule,
    ProductModule,
    SuppliersCustomersModule,
    PurchasesModule,
    SalesModule,
    InventoryModule,
    PaymentsModule,
    AnalyticsModule,
    NotificationsModule,
    SupportModule,
  ],
  controllers: [AppController],
  providers: [
    PrismaService,

    // Global Filters
    {
      provide: APP_FILTER,
      useClass: HttpExceptionFilter,
    },
    {
      provide: APP_FILTER,
      useClass: AllExceptionsFilter,
    },

    // Global Guards
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },

    // Global Pipes
    {
      provide: APP_PIPE,
      useValue: createValidationPipe(),
    },

    // Global Interceptors
    {
      provide: APP_INTERCEPTOR,
      useClass: LoggingInterceptor,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: TransformInterceptor,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestIdMiddleware).forRoutes('*').apply(LoggerMiddleware).forRoutes('*');
  }
}
