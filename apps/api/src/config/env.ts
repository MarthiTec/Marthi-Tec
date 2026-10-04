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
  DATABASE_URL: z.string().default(''),
  DB_HOST: z.string().optional(),
  DB_PORT: z.coerce.number().default(5432),
  DB_DATABASE: z.string().optional(),
  DB_USERNAME: z.string().optional(),
  DB_PASSWORD: z.string().optional(),
  DB_SSLMODE: z.string().default('prefer'),
  GOOGLE_CLIENT_ID: z.string().optional(),
  JWT_SECRET: z.string().min(16, 'Configure JWT_SECRET com pelo menos 16 caracteres.'),
  EVOLUTION_BASE_URL: z.string().url().optional(),
  EVOLUTION_INSTANCE: z.string().optional(),
  EVOLUTION_API_KEY: z.string().optional(),
  EVOLUTION_STORE_NUMBER: z.string().optional(),
  EVOLUTION_NOTIFY_CUSTOMER: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
  TOTEM_LOCATION_LABEL: z.string().default(''),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().default(587),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_SECURE: z.preprocess((value) => value === true || value === 'true', z.boolean()).default(false),
  SMTP_FROM: z.string().default('Marthi Tecnologia <marthi.tecnologia@gmail.com>'),
  INTERNAL_NOTIFICATION_EMAIL: z.string().email().default('marthi.tecnologia@gmail.com'),
  FRONTEND_URL: z.string().default(
    process.env.FRONTEND_URL ||
    (process.env.DISCLOUD_APP_ID || process.env.NODE_ENV === 'production'
      ? 'https://marthi-totem.discloud.dev'
      : 'http://localhost:5173')
  ),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('[marthi-api] invalid environment:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;

if (!env.DATABASE_URL && !(env.DB_HOST && env.DB_DATABASE && env.DB_USERNAME && env.DB_PASSWORD)) {
  console.warn('[marthi-api] MarthiDB não configurado com credenciais completas.');
}
