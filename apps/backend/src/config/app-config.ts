import { z } from 'zod';

const bool = z
  .enum(['true', 'false', '1', '0', 'yes', 'no'])
  .transform((v) => v === 'true' || v === '1' || v === 'yes');

const optionalDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'expected YYYY-MM-DD')
  .optional()
  .or(z.literal('').transform(() => undefined));

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LOG_LEVEL: z.enum(['error', 'warn', 'log', 'debug', 'verbose']).default('log'),
  HOST: z.string().default('0.0.0.0'),
  PORT: z.coerce.number().int().positive().default(3000),
  /** Reverse proxies in front of the API (Caddy = 1). Client IPs are read from X-Forwarded-For past them. */
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(5).default(1),
  CORS_ORIGINS: z.string().default(''),

  DATABASE_URL: z.string().min(1),
  DATABASE_POOL_MAX: z.coerce.number().int().min(2).max(50).default(10),
  REDIS_URL: z.string().min(1),
  OPENSEARCH_URL: z.string().url(),
  OPENSEARCH_USERNAME: z.string().optional(),
  OPENSEARCH_PASSWORD: z.string().optional(),
  OPENSEARCH_INDEX_ALIAS: z.string().regex(/^[a-z0-9_-]+$/).default('articles'),
  OPENSEARCH_REFRESH_INTERVAL: z.string().default('5s'),
  /** 0 keeps every accepted article searchable. Otherwise only the last N days are indexed. */
  OPENSEARCH_RETENTION_DAYS: z.coerce.number().int().min(0).default(0),

  DEFAULT_NICHE: z.string().default('tn-cm'),

  GDELT_DOC_API_URL: z.string().url().default('https://api.gdeltproject.org/api/v2/doc/doc'),
  GDELT_GKG_BASE_URL: z.string().url().default('https://data.gdeltproject.org/gdeltv2'),
  /** GDELT asks clients to send at most one DOC API request every 5 seconds; stay well above it. */
  GDELT_MIN_REQUEST_INTERVAL_MS: z.coerce.number().int().min(5000).default(10000),
  /** After a rate-limit answer GDELT keeps refusing for minutes; pause every DOC request this long. */
  GDELT_RATE_LIMIT_COOLDOWN_MS: z.coerce.number().int().min(10000).default(300000),
  GDELT_REQUEST_TIMEOUT_MS: z.coerce.number().int().min(1000).default(90000),
  /** The DOC API only searches roughly the last three months. Older ranges use GKG archive files. */
  GDELT_DOC_MAX_LOOKBACK_DAYS: z.coerce.number().int().min(1).max(365).default(85),
  GDELT_GKG_CONCURRENCY: z.coerce.number().int().min(1).max(4).default(2),
  GDELT_USER_AGENT: z.string().default('cmnews-tamilnadu/0.1 (+https://github.com/BlesslinJerishR/CmNewsTamilnadu)'),

  INGEST_ENABLED: bool.default('true'),
  INGEST_INTERVAL_MINUTES: z.coerce.number().int().min(5).max(1440).default(30),
  INITIAL_BACKFILL_FROM: optionalDate,
  INITIAL_BACKFILL_TO: optionalDate,

  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(120),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60000),
  AUTH_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(10),
  SESSION_TTL_DAYS: z.coerce.number().int().min(1).max(365).default(30),
  METRICS_TOKEN: z.string().optional(),

  RETENTION_REJECTED_DAYS: z.coerce.number().int().min(1).default(30),
  RETENTION_DUPLICATE_DAYS: z.coerce.number().int().min(1).default(60),
  RETENTION_PROVIDER_METADATA_DAYS: z.coerce.number().int().min(1).default(30),
  RETENTION_INGESTION_RUNS_DAYS: z.coerce.number().int().min(1).default(90),
  DISK_PATH: z.string().default('/'),
  DISK_WARN_PERCENT: z.coerce.number().min(1).max(100).default(80),
  DISK_CRITICAL_PERCENT: z.coerce.number().min(1).max(100).default(90),
});

export type AppConfig = z.infer<typeof envSchema>;

export const APP_CONFIG = Symbol('APP_CONFIG');

let cached: AppConfig | undefined;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  if (cached && env === process.env) return cached;
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('\n  ');
    throw new Error(`Invalid environment configuration:\n  ${issues}`);
  }
  if (env === process.env) cached = parsed.data;
  return parsed.data;
}
