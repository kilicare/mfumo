import { CallHandler, ExecutionContext, Injectable, Logger, NestInterceptor } from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger(LoggingInterceptor.name);

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const { method, path } = request;
    const startTime = Date.now();

    return next.handle().pipe(
      tap(
        () => {
          const duration = Date.now() - startTime;
          this.logger.log(`${method} ${path} - ${duration}ms`);
        },
        () => {
          const duration = Date.now() - startTime;
          this.logger.error(`${method} ${path} - ${duration}ms - request failed`);
        },
      ),
    );
  }
}
