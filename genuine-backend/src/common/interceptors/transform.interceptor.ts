import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

@Injectable()
export class TransformInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const response = context.switchToHttp().getResponse<{ statusCode: number }>();
    return next.handle().pipe(
      map((data) => ({
        statusCode: response.statusCode || 200,
        timestamp: new Date().toISOString(),
        data,
      })),
    );
  }
}
