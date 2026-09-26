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

// Controllers
import { AppController } from './app.controller';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', '.env.production'],
    }),
    DatabaseModule,
    CommonModule,
    AuthModule,
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
