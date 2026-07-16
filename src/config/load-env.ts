import { existsSync } from 'node:fs';
import path from 'node:path';
import { config as loadDotenv } from 'dotenv';

/**
 * Environment bootstrap. The app runs in exactly two environments:
 *
 *   development  -> loads local credentials from `.env.development`
 *   production   -> loads live credentials from `.env.production`
 *
 * Files are layered so shared, non-secret defaults live in a single base `.env`
 * and each environment file overrides only what differs (URLs, keys, DB, ...).
 *
 * Load order (later files override earlier ones):
 *   1. .env                       (shared base defaults + the APP_ENV selector)
 *   2. .env.<environment>         (per-environment credentials)
 *   3. .env.local                 (optional personal overrides, gitignored)
 *   4. .env.<environment>.local   (optional personal overrides, gitignored)
 *
 * The active environment is chosen from `APP_ENV` (or `NODE_ENV`) — either set
 * as a real OS/host env var (which always wins) or via `APP_ENV` in the base
 * `.env`. Anything other than "production" resolves to "development".
 */

export type Environment = 'development' | 'production';

const cwd = process.cwd();

function load(file: string, override = false): void {
  const full = path.resolve(cwd, file);
  if (existsSync(full)) {
    loadDotenv({ path: full, override });
  }
}

// A selector provided by the host/CLI (real env var) takes precedence over any
// value that later comes from the base `.env` file.
const externalSelector = (
  process.env.APP_ENV ??
  process.env.NODE_ENV ??
  ''
).toLowerCase();

// Whether the process was started by a test runner (vitest sets NODE_ENV=test).
const isTestRuntime = process.env.NODE_ENV === 'test';

// 1. Base defaults + (optionally) the APP_ENV selector.
load('.env');

const selector =
  externalSelector || (process.env.APP_ENV ?? '').toLowerCase() || 'development';

export const environment: Environment = selector.startsWith('prod')
  ? 'production'
  : 'development';

// 2-4. Environment-specific credentials + optional local overrides.
load(`.env.${environment}`, true);
load('.env.local', true);
load(`.env.${environment}.local`, true);

// Normalize NODE_ENV for the rest of the app. Preserve "test" so the test suite
// keeps its own runtime semantics.
if (!isTestRuntime) {
  process.env.NODE_ENV = environment;
}
process.env.APP_ENV = environment;
