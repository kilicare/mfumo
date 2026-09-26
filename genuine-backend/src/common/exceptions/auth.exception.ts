import { UnauthorizedException as NestUnauthorizedException } from '@nestjs/common';

export class InvalidCredentialsException extends NestUnauthorizedException {
  constructor() {
    super('Invalid email or password');
  }
}

export class TokenExpiredException extends NestUnauthorizedException {
  constructor() {
    super('Token has expired');
  }
}

export class InvalidTokenException extends NestUnauthorizedException {
  constructor() {
    super('Invalid token');
  }
}
