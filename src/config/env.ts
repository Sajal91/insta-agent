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

  MONGODB_URI: z.string().min(1, 'MONGODB_URI is required'),
  MONGODB_DB: z.string().min(1).default('insta_agent'),
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
