import { config as loadEnv } from 'dotenv';
import { resolve } from 'node:path';
import { z } from 'zod';

loadEnv({ path: resolve(process.cwd(), '.env') });
loadEnv({ path: resolve(process.cwd(), '../../.env') });
loadEnv({ path: resolve(process.cwd(), '../../../.env') });
loadEnv();

const envSchema = z.object({
  APP_ENV: z.enum(['development', 'staging', 'production']).default('development'),
  APP_NAME: z.string().default('Marthi API'),
  PORT: z.coerce.number().default(8080),
  DATABASE_URL: z.string().optional(),
  DB_HOST: z.string().optional(),
  DB_PORT: z.coerce.number().default(5432),
  DB_DATABASE: z.string().optional(),
  DB_USERNAME: z.string().optional(),
  DB_PASSWORD: z.string().optional(),
  DB_SSLMODE: z.string().default('prefer'),
  GOOGLE_CLIENT_ID: z.string().optional(),
  JWT_SECRET: z.string().min(16).default('marthi-dev-secret-change-me'),
  AUTH_DEV_EMAIL: z.string().email().default('teste@marthi.com.br'),
  AUTH_DEV_PASSWORD: z.string().default('123'),
  EVOLUTION_BASE_URL: z.string().url().optional(),
  EVOLUTION_INSTANCE: z.string().optional(),
  EVOLUTION_API_KEY: z.string().optional(),
  EVOLUTION_STORE_NUMBER: z.string().optional(),
  EVOLUTION_NOTIFY_CUSTOMER: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
  TOTEM_LOCATION_LABEL: z.string().default(''),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('[marthi-api] invalid environment:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
