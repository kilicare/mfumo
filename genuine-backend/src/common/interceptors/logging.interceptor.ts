import { CallHandler, ExecutionContext, Injectable, Logger, NestInterceptor } from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger(LoggingInterceptor.name);

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const { method, url } = request;
    const startTime = Date.now();

    return next.handle().pipe(
      tap(
        (data) => {
          const duration = Date.now() - startTime;
          this.logger.log(
            `${method} ${url} - ${duration}ms`,
            `Response: ${JSON.stringify(data).substring(0, 100)}...`,
          );
        },
        (error) => {
          const duration = Date.now() - startTime;
          this.logger.error(`${method} ${url} - ${duration}ms`, `Error: ${error.message}`);
        },
      ),
    );
  }
}
