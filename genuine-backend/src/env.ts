import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production']).default('development'),
  DATABASE_URL: z.string().url('Invalid database URL'),
  JWT_SECRET: z.string().min(32, 'JWT secret must be at least 32 characters'),
  JWT_REFRESH_SECRET: z.string().min(32, 'JWT refresh secret must be at least 32 characters'),
  JWT_RESET_SECRET: z.string().min(32, 'JWT reset secret must be at least 32 characters'),
  JWT_ACCESS_EXPIRATION: z
    .string()
    .regex(/^\d+[smhd]$/, 'Use a JWT duration such as 15m')
    .default('15m'),
  JWT_REFRESH_EXPIRATION: z
    .string()
    .regex(/^\d+[smhd]$/, 'Use a JWT duration such as 30d')
    .default('30d'),
  SESSION_IDLE_TIMEOUT: z
    .string()
    .regex(/^\d+[smhd]$/, 'Use a session duration such as 7d')
    .default('7d'),
  SESSION_ABSOLUTE_TIMEOUT: z
    .string()
    .regex(/^\d+[smhd]$/, 'Use a session duration such as 30d')
    .default('30d'),
  API_PORT: z.coerce.number().default(3002),
  CORS_ORIGIN: z.string().default('http://localhost:3000'),
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug', 'verbose']).default('info'),
  ALLOW_NEGATIVE_STOCK: z
    .string()
    .transform((v) => v === 'true')
    .default('false'),
  DEFAULT_COSTING_METHOD: z.enum(['FIFO', 'WEIGHTED_AVERAGE']).default('WEIGHTED_AVERAGE'),
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(config: Record<string, unknown> = process.env): Env {
  try {
    const env = envSchema.parse(config);
    const toSeconds = (value: string) => {
      const match = /^(\d+)([smhd])$/.exec(value);
      if (!match) return 0;
      const scale = { s: 1, m: 60, h: 3600, d: 86_400 }[match[2] as 's' | 'm' | 'h' | 'd'];
      return Number(match[1]) * scale;
    };
    if (toSeconds(env.SESSION_IDLE_TIMEOUT) >= toSeconds(env.SESSION_ABSOLUTE_TIMEOUT)) {
      throw new Error('SESSION_IDLE_TIMEOUT must be shorter than SESSION_ABSOLUTE_TIMEOUT');
    }
    if (toSeconds(env.JWT_REFRESH_EXPIRATION) < toSeconds(env.SESSION_ABSOLUTE_TIMEOUT)) {
      throw new Error('JWT_REFRESH_EXPIRATION must cover SESSION_ABSOLUTE_TIMEOUT');
    }
    return env;
  } catch (error) {
    console.error('Environment validation failed:', error);
    process.exit(1);
  }
}
