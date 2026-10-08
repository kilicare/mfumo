import { ConfigService } from '@nestjs/config';

const UNIT_SECONDS: Record<string, number> = { s: 1, m: 60, h: 3600, d: 86_400 };

export function durationSeconds(config: ConfigService, key: string, fallback: string): number {
  const value = config.get<string>(key) || fallback;
  const match = /^(\d+)([smhd])$/.exec(value);
  if (!match) throw new Error(`Invalid duration configured for ${key}`);
  const seconds = Number(match[1]) * UNIT_SECONDS[match[2]];
  if (!Number.isSafeInteger(seconds) || seconds <= 0) {
    throw new Error(`Invalid duration configured for ${key}`);
  }
  return seconds;
}
