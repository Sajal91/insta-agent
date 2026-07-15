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

  // ---- Instagram credentials for the ADMIN account only ----
  // In the multi-tenant SaaS model these env vars are NOT global anymore: they
  // belong exclusively to the admin's own Instagram account (the user whose
  // email matches ADMIN_EMAIL). Every other user's credentials are entered by
  // the admin through the panel and stored (encrypted) in MongoDB per-user.
  // They are therefore optional — a fresh SaaS deploy can run without them.
  IG_APP_ID: z.string().optional().default(''),
  IG_APP_SECRET: z.string().optional().default(''),
  IG_ACCESS_TOKEN: z.string().optional().default(''),
  IG_BUSINESS_ACCOUNT_ID: z.string().optional().default(''),
  IG_PAGE_HANDLE: z.string().optional().default(''),
  IG_GRAPH_API_VERSION: z.string().default('v21.0'),

  // API host. Use graph.instagram.com for "Instagram API with Instagram Login"
  // (tokens that start with IGAA/IGQ), or graph.facebook.com for the Facebook
  // Login path (Page tokens that start with EAA).
  IG_GRAPH_BASE_URL: z
    .string()
    .url()
    .default('https://graph.instagram.com'),

  // Webhook handshake token for the admin's own Meta app. Optional (each user
  // brings their own verify token stored in the DB).
  IG_VERIFY_TOKEN: z.string().optional().default(''),

  API_KEY: z.string().min(1, 'API_KEY is required'),

  // ---- Google Sign-In (OAuth) ----
  // Everyone (including the admin) logs in with Google. The frontend obtains an
  // ID token via Google Identity Services and posts it to /auth/google, which we
  // verify with GOOGLE_CLIENT_ID. GOOGLE_CLIENT_SECRET is reserved for the
  // server-side code flow (not required for the ID-token flow).
  GOOGLE_CLIENT_ID: z.string().optional().default(''),
  GOOGLE_CLIENT_SECRET: z.string().optional().default(''),

  // ---- Admin account ----
  // Identifies which Google account is the platform admin / owner of the env
  // Instagram credentials above. The matching user is auto-promoted to the admin
  // role on login. (You can also promote users manually in the DB.)
  ADMIN_EMAIL: z.string().email('ADMIN_EMAIL must be a valid email'),
  // Retained for backwards-compat only; no longer used for login.
  ADMIN_PASSWORD: z.string().optional(),
  // Secret used to sign session tokens (HMAC-SHA256) AND derive the key that
  // encrypts stored per-user credentials. Keep it long/random and stable.
  AUTH_SECRET: z.string().min(16, 'AUTH_SECRET must be at least 16 characters'),
  // How long an issued session token stays valid, in hours.
  AUTH_TOKEN_TTL_HOURS: z.coerce.number().positive().default(12),

  // ---- Razorpay (monthly subscriptions) ----
  // Key id/secret from the Razorpay dashboard (test or live). The monthly plan
  // is created once in the dashboard and its id set as RAZORPAY_PLAN_ID. The
  // setup fee is charged as a one-time addon on the first invoice.
  RAZORPAY_KEY_ID: z.string().optional().default(''),
  RAZORPAY_KEY_SECRET: z.string().optional().default(''),
  // Secret configured on the Razorpay webhook (used to verify signatures).
  RAZORPAY_WEBHOOK_SECRET: z.string().optional().default(''),
  // The monthly Plan id (e.g. plan_XXXXXXXX) created in the dashboard.
  RAZORPAY_PLAN_ID: z.string().optional().default(''),
  // One-time setup fee, in the smallest currency unit (paise for INR).
  RAZORPAY_SETUP_FEE_PAISE: z.coerce.number().int().nonnegative().default(0),
  // ISO currency code used for the setup-fee addon (must match the plan).
  RAZORPAY_CURRENCY: z.string().default('INR'),

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

/**
 * True when Razorpay is fully configured (keys + plan). Billing endpoints are
 * disabled (return a clear error) when this is false, so the app still boots
 * without payment configured.
 */
export function isRazorpayConfigured(cfg: AppConfig = config): boolean {
  return Boolean(
    cfg.RAZORPAY_KEY_ID && cfg.RAZORPAY_KEY_SECRET && cfg.RAZORPAY_PLAN_ID,
  );
}

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
  if (!cfg.GOOGLE_CLIENT_ID) {
    issues.push('GOOGLE_CLIENT_ID is not set — Google sign-in will not work.');
  }

  // Wide-open CORS in production is risky for a credentialed admin panel.
  if (cfg.CORS_ORIGIN === '*') {
    issues.push(
      'CORS_ORIGIN is "*" in production — restrict it to your admin panel origin(s).',
    );
  }

  // If Razorpay is partially configured, surface the gap; a webhook without a
  // secret cannot be verified and would be rejected.
  const anyRazorpay =
    cfg.RAZORPAY_KEY_ID ||
    cfg.RAZORPAY_KEY_SECRET ||
    cfg.RAZORPAY_PLAN_ID ||
    cfg.RAZORPAY_WEBHOOK_SECRET;
  if (anyRazorpay && !isRazorpayConfigured(cfg)) {
    issues.push(
      'Razorpay is partially configured — set RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET and RAZORPAY_PLAN_ID (billing is disabled until all are present).',
    );
  }
  if (isRazorpayConfigured(cfg) && !cfg.RAZORPAY_WEBHOOK_SECRET) {
    issues.push(
      'RAZORPAY_WEBHOOK_SECRET is not set — subscription webhooks cannot be verified.',
    );
  }

  return issues;
}
