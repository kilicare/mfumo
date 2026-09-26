import { Module, NestModule, MiddlewareConsumer } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
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
import { JwtStrategy } from './auth/strategies/jwt.strategy';

// Controllers
import { AppController } from './app.controller';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', '.env.production'],
    }),
    JwtModule.register({
      secret: process.env.JWT_SECRET,
      signOptions: { expiresIn: (process.env.JWT_EXPIRATION || '24h') as any },
      global: true,
    }),
    PassportModule.register({ defaultStrategy: 'jwt' }),
    DatabaseModule,
    CommonModule,
  ],
  controllers: [AppController],
  providers: [
    PrismaService,
    JwtStrategy,

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
