export class SuccessResponse<T> {
  statusCode!: number;
  message!: string;
  data!: T;
  timestamp!: string;
}

export class ErrorResponse {
  statusCode!: number;
  message!: string;
  errors?: Record<string, string[]>;
  timestamp!: string;
  path?: string;
  method?: string;
}
