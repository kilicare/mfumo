import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Logger } from '@nestjs/common';
import { Response } from 'express';

@Catch(HttpException)
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: HttpException, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest();
    const status = exception.getStatus();
    const exceptionResponse = exception.getResponse();

    const errorResponse = {
      statusCode: status,
      timestamp: new Date().toISOString(),
      path: request.path,
      method: request.method,
      message:
        typeof exceptionResponse === 'string'
          ? exceptionResponse
          : (exceptionResponse as any).message ||
            (exceptionResponse as any).error ||
            exception.message,
      ...(typeof exceptionResponse === 'object' && exceptionResponse),
    };

    // Exception payloads can contain user supplied notes or identifiers. Keep them
    // in the HTTP response when intentionally safe, but never duplicate them to logs.
    this.logger.error(`${request.method} ${request.path} ${status}`);

    response.status(status).json(errorResponse);
  }
}
