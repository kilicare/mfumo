import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest();

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const exceptionResponse = exception.getResponse();
      const message =
        typeof exceptionResponse === 'string'
          ? exceptionResponse
          : (exceptionResponse as any).message ||
            (exceptionResponse as any).error ||
            exception.message;

      const errorResponse = {
        statusCode: status,
        timestamp: new Date().toISOString(),
        path: request.path,
        method: request.method,
        message,
        ...(typeof exceptionResponse === 'object' && exceptionResponse),
      };

      this.logger.error(`${request.method} ${request.path} ${status}`);
      return response.status(status).json(errorResponse);
    }

    const status = HttpStatus.INTERNAL_SERVER_ERROR;
    // Do not log exception messages/stacks: database drivers may embed SQL,
    // customer data, credentials, or request values in them.
    this.logger.error(`Unhandled exception for ${request.method} ${request.path}`);

    const errorResponse = {
      statusCode: status,
      timestamp: new Date().toISOString(),
      path: request.url,
      method: request.method,
      message: 'Internal server error',
    };

    response.status(status).json(errorResponse);
  }
}
