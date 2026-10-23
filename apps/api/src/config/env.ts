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
  JWT_SECRET: z.string().min(16).default(
    process.env.JWT_SECRET ||
    'fd8de888699d045d11573928a658e500d222a071be8339cc625c2f870b4214ad'
  ),
  EVOLUTION_BASE_URL: z.string().url().optional(),
  EVOLUTION_INSTANCE: z.string().optional(),
  EVOLUTION_API_KEY: z.string().optional(),
  /** Chave mestra (AUTHENTICATION_API_KEY) do servidor Evolution. Usada só no backend para
   *  provisionar automaticamente uma instância exclusiva por loja; nunca é enviada ao front. */
  EVOLUTION_MASTER_API_KEY: z.string().optional(),
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
  // Marthi ADS (Meta). Sem app/segredo/chave a conexão fica bloqueada com a explicação na tela.
  META_APP_ID: z.string().optional(),
  META_APP_SECRET: z.string().optional(),
  /** Configuração do Facebook Login for Business (opcional; sem ela o login usa `scope`). */
  META_LOGIN_CONFIG_ID: z.string().optional(),
  /** Chave de 32 bytes em base64 para criptografar os tokens (AES-256-GCM). */
  META_TOKEN_KEY: z.string().optional(),
  META_GRAPH_VERSION: z.string().regex(/^v\d+\.\d+$/).default('v26.0'),
  /** URL pública da API (retorno do OAuth e exclusão de dados). Padrão: FRONTEND_URL. */
  PUBLIC_API_URL: z.string().optional(),
  /** test | production — o painel avisa quando é ambiente de teste. */
  ADS_ENVIRONMENT: z.enum(['test', 'production']).default(process.env.NODE_ENV === 'production' || process.env.DISCLOUD_APP_ID ? 'production' : 'test'),
  FRONTEND_URL: z.string().default(
    process.env.FRONTEND_URL ||
    (process.env.DISCLOUD_APP_ID || process.env.NODE_ENV === 'production'
      ? 'https://marthi-totem.discloud.dev'
      : 'http://localhost:5173')
  ),
  /** URL HTTPS do APK Android (EAS / CDN). Vazio = painel mostra empty state honesto. */
  MOBILE_ANDROID_APK_URL: z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? undefined : typeof value === 'string' ? value.trim() : value),
    z.string().url().optional(),
  ),
  /** URL HTTPS de instalação iOS (TestFlight / Ad Hoc / link EAS). */
  MOBILE_IOS_INSTALL_URL: z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? undefined : typeof value === 'string' ? value.trim() : value),
    z.string().url().optional(),
  ),
  /**
   * Deep link vivo do bundler Expo (tunnel `exp://` / `https://expo.dev/go?url=…` / EAS Update).
   * Quando setado, Operações e `/app-lojista` preferem este link a APK/TestFlight ausentes.
   */
  EXPO_DEV_CLIENT_URL: z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? undefined : typeof value === 'string' ? value.trim() : value),
    z.string().min(1).optional(),
  ),
  /**
   * Fallback da chave Pix de recebimento da Marthi quando `platform_payout_settings` estiver vazio.
   * Preferir gravar em /admin/recebimentos (MarthiDB). Default operacional: e-mail oficial.
   */
  PLATFORM_PIX_KEY: z.string().optional(),
  PLATFORM_PIX_KEY_TYPE: z.enum(['email', 'cpf_cnpj', 'telefone', 'aleatoria']).optional(),
  PLATFORM_PIX_RECEIVER_NAME: z.string().optional(),
  /**
   * Chave RapidAPI (DeviceSpecs) da plataforma — fallback quando a loja não cadastrou a própria
   * em /erp/api-aparelhos. Nunca commitar; colar só nas Variáveis do Site Discloud (marthi-totem / backend).
   */
  DEVICE_CATALOG_API_KEY: z.string().optional(),
  /**
   * Máximo de consultas por dia à API de aparelhos (por chave: plataforma ou loja). O plano gratuito
   * da RapidAPI tem 15/dia e cobra cada consulta a mais; 0 = sem trava (plano pago).
   */
  DEVICE_CATALOG_DAILY_LIMIT: z.coerce.number().int().min(0).default(15),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('[marthi-api] invalid environment:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;

const hasDatabase =
  Boolean(env.DATABASE_URL) ||
  Boolean(env.DB_HOST && env.DB_DATABASE && env.DB_USERNAME && env.DB_PASSWORD);

if (!hasDatabase) {
  const onDiscloud = Boolean(process.env.DISCLOUD_APP_ID || process.env.DISCLOUD_APP_TYPE);
  if (env.APP_ENV === 'production' || onDiscloud) {
    console.error(
      '[marthi-api] FATAL: MarthiDB obrigatório em produção/Discloud. Defina DATABASE_URL (sem gravar senha no git).',
    );
    process.exit(1);
  }
  console.warn(
    '[marthi-api] MarthiDB não configurado. Rotas de negócio retornarão 503 até definir DATABASE_URL ou DB_*.',
  );
}
