import 'dotenv/config';
import { z } from 'zod';

/**
 * Environment schema. Everything the app needs comes from env vars — no secrets
 * are ever hardcoded. Validation happens once at boot; a bad config fails fast.
 */
const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(3000),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
    .default('info'),

  IG_APP_ID: z.string().min(1, 'IG_APP_ID is required'),
  IG_APP_SECRET: z.string().min(1, 'IG_APP_SECRET is required'),
  IG_ACCESS_TOKEN: z.string().min(1, 'IG_ACCESS_TOKEN is required'),
  IG_BUSINESS_ACCOUNT_ID: z.string().min(1, 'IG_BUSINESS_ACCOUNT_ID is required'),
  IG_PAGE_HANDLE: z.string().min(1, 'IG_PAGE_HANDLE is required'),
  IG_GRAPH_API_VERSION: z.string().default('v21.0'),

  // API host. Use graph.instagram.com for "Instagram API with Instagram Login"
  // (tokens that start with IGAA/IGQ), or graph.facebook.com for the Facebook
  // Login path (Page tokens that start with EAA).
  IG_GRAPH_BASE_URL: z
    .string()
    .url()
    .default('https://graph.instagram.com'),

  IG_VERIFY_TOKEN: z.string().min(1, 'IG_VERIFY_TOKEN is required'),

  API_KEY: z.string().min(1, 'API_KEY is required'),

  // ---- Admin login (the /auth/login page) ----
  // Credentials for the single admin user. The email/password are the source of
  // truth here in the env; on boot we persist only a scrypt hash of the password
  // to MongoDB (never the plaintext).
  ADMIN_EMAIL: z.string().email('ADMIN_EMAIL must be a valid email'),
  ADMIN_PASSWORD: z.string().min(8, 'ADMIN_PASSWORD must be at least 8 characters'),
  // Secret used to sign admin session tokens (HMAC-SHA256). Keep it long/random.
  AUTH_SECRET: z.string().min(16, 'AUTH_SECRET must be at least 16 characters'),
  // How long an issued session token stays valid, in hours.
  AUTH_TOKEN_TTL_HOURS: z.coerce.number().positive().default(12),

  // Allowed origin(s) for the admin panel (CORS). Comma-separated, or "*".
  CORS_ORIGIN: z.string().default('*'),

  // Path to the built admin panel (Vite output). When this directory exists the
  // server also serves the admin SPA (single-origin deploy). Defaults to
  // ../admin/dist relative to the compiled server.
  ADMIN_DIST_PATH: z.string().optional(),

  MONGODB_URI: z.string().min(1, 'MONGODB_URI is required'),
  MONGODB_DB: z.string().min(1).default('insta_agent'),
  // How long the driver waits to find a reachable server before failing. Atlas
  // over the public internet needs more headroom than a local mongod.
  MONGODB_SERVER_SELECTION_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(15000),
  MONGODB_MAX_POOL_SIZE: z.coerce.number().int().positive().default(10),
});

export type AppConfig = z.infer<typeof envSchema>;

let cached: AppConfig | null = null;

/**
 * Parse + validate the environment once and cache it. Throws (with a readable
 * message) if anything is missing/invalid so we never boot in a half-configured
 * state.
 */
export function loadConfig(): AppConfig {
  if (cached) return cached;

  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }

  cached = parsed.data;
  return cached;
}

export const config = loadConfig();

/** True when running with NODE_ENV=production. */
export const isProduction = config.NODE_ENV === 'production';
/** True when running the local dev environment. */
export const isDevelopment = config.NODE_ENV === 'development';

/**
 * Extra safety checks that only apply to production deploys (e.g. AWS). Returns
 * a list of human-readable problems; the caller decides whether to warn or hard
 * fail. Kept out of the zod schema so the same schema works for dev/test.
 */
export function getProductionConfigIssues(cfg: AppConfig = config): string[] {
  if (cfg.NODE_ENV !== 'production') return [];

  const issues: string[] = [];

  // A local Mongo URI in production almost always means the Atlas string wasn't
  // wired into the environment.
  if (/(127\.0\.0\.1|localhost)/i.test(cfg.MONGODB_URI)) {
    issues.push(
      'MONGODB_URI points at localhost in production — set your MongoDB Atlas connection string.',
    );
  }

  // Never ship the placeholder/dev secrets to production.
  if (/change-me|dev-only/i.test(cfg.AUTH_SECRET)) {
    issues.push('AUTH_SECRET is still a placeholder — set a strong random value.');
  }
  if (/change-me/i.test(cfg.API_KEY)) {
    issues.push('API_KEY is still a placeholder — set a strong random value.');
  }
  if (/change-me/i.test(cfg.ADMIN_PASSWORD)) {
    issues.push('ADMIN_PASSWORD is still a placeholder — set a real password.');
  }

  // Wide-open CORS in production is risky for a credentialed admin panel.
  if (cfg.CORS_ORIGIN === '*') {
    issues.push(
      'CORS_ORIGIN is "*" in production — restrict it to your admin panel origin(s).',
    );
  }

  return issues;
}
