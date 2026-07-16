import { config } from '../config/env';
import { logger } from '../utils/logger';

/**
 * "Instagram API with Instagram Login" (Business Login) OAuth helper.
 *
 * Self-serve connection flow for a single platform Meta app (IG_APP_ID /
 * IG_APP_SECRET):
 *   1. buildAuthorizeUrl(state)  -> send the user to Instagram to authorize
 *   2. exchangeCode(code)        -> short-lived token + ig user id
 *   3. exchangeForLongLived()    -> ~60-day long-lived token
 *   4. fetchProfile(token)       -> user_id + username
 *   5. subscribeWebhooks()       -> receive comment/message webhooks for them
 */

const AUTHORIZE_BASE = 'https://www.instagram.com/oauth/authorize';
const TOKEN_EXCHANGE_URL = 'https://api.instagram.com/oauth/access_token';
const GRAPH_BASE = 'https://graph.instagram.com';

/** True when the platform Instagram app is configured for self-serve connect. */
export function isInstagramOAuthConfigured(): boolean {
  return Boolean(
    config.IG_APP_ID && config.IG_APP_SECRET && config.IG_OAUTH_REDIRECT_URI,
  );
}

export class InstagramOAuthError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body: unknown,
  ) {
    super(message);
    this.name = 'InstagramOAuthError';
  }
}

/** Build the Business Login authorize URL the user is redirected to. */
export function buildAuthorizeUrl(state: string): string {
  const url = new URL(AUTHORIZE_BASE);
  url.searchParams.set('client_id', config.IG_APP_ID);
  url.searchParams.set('redirect_uri', config.IG_OAUTH_REDIRECT_URI);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', config.IG_SCOPES.split(',').map((s) => s.trim()).join(','));
  url.searchParams.set('state', state);
  return url.toString();
}

export interface ShortLivedToken {
  accessToken: string;
  userId: string;
}

/** Exchange the authorization code for a short-lived token + IG user id. */
export async function exchangeCode(code: string): Promise<ShortLivedToken> {
  const form = new URLSearchParams({
    client_id: config.IG_APP_ID,
    client_secret: config.IG_APP_SECRET,
    grant_type: 'authorization_code',
    redirect_uri: config.IG_OAUTH_REDIRECT_URI,
    // Meta strips a trailing "#_" from the code on some flows.
    code: code.replace(/#_$/, ''),
  });

  const res = await fetch(TOKEN_EXCHANGE_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: form.toString(),
  });
  const data = (await parseJson(res)) as {
    access_token?: string;
    user_id?: number | string;
  };
  if (!res.ok || !data.access_token || data.user_id == null) {
    throw new InstagramOAuthError(
      'Failed to exchange authorization code',
      res.status,
      data,
    );
  }
  return { accessToken: data.access_token, userId: String(data.user_id) };
}

export interface LongLivedToken {
  accessToken: string;
  /** Seconds until expiry (~60 days). */
  expiresIn: number;
}

/** Exchange a short-lived token for a long-lived (~60 day) token. */
export async function exchangeForLongLived(
  shortToken: string,
): Promise<LongLivedToken> {
  const url = new URL(`${GRAPH_BASE}/access_token`);
  url.searchParams.set('grant_type', 'ig_exchange_token');
  url.searchParams.set('client_secret', config.IG_APP_SECRET);
  url.searchParams.set('access_token', shortToken);

  const res = await fetch(url, { method: 'GET' });
  const data = (await parseJson(res)) as {
    access_token?: string;
    expires_in?: number;
  };
  if (!res.ok || !data.access_token) {
    throw new InstagramOAuthError(
      'Failed to obtain long-lived token',
      res.status,
      data,
    );
  }
  return { accessToken: data.access_token, expiresIn: data.expires_in ?? 0 };
}

export interface InstagramProfile {
  userId: string;
  username: string;
}

/** Fetch the connected account's IG user id + username. */
export async function fetchProfile(
  accessToken: string,
): Promise<InstagramProfile> {
  const url = new URL(`${GRAPH_BASE}/me`);
  url.searchParams.set('fields', 'user_id,username');
  url.searchParams.set('access_token', accessToken);

  const res = await fetch(url, { method: 'GET' });
  const data = (await parseJson(res)) as {
    user_id?: number | string;
    id?: number | string;
    username?: string;
  };
  const userId = data.user_id ?? data.id;
  if (!res.ok || userId == null) {
    throw new InstagramOAuthError('Failed to fetch profile', res.status, data);
  }
  return { userId: String(userId), username: data.username ?? '' };
}

/**
 * Subscribe the connected account to this app's webhooks so we receive comment
 * and message events. Best-effort: logs and swallows failures so a transient
 * subscribe error doesn't block the connection.
 */
export async function subscribeWebhooks(
  igUserId: string,
  accessToken: string,
): Promise<boolean> {
  const url = new URL(
    `${GRAPH_BASE}/${config.IG_GRAPH_API_VERSION}/${igUserId}/subscribed_apps`,
  );
  url.searchParams.set('subscribed_fields', 'comments,messages');
  url.searchParams.set('access_token', accessToken);

  try {
    const res = await fetch(url, { method: 'POST' });
    const data = (await parseJson(res)) as { success?: boolean };
    if (!res.ok) {
      logger.warn(
        { igUserId, status: res.status, body: data },
        'Failed to subscribe Instagram account to webhooks',
      );
      return false;
    }
    return data.success ?? true;
  } catch (err) {
    logger.warn(
      { igUserId, err: (err as Error).message },
      'Error subscribing Instagram account to webhooks',
    );
    return false;
  }
}

async function parseJson(res: Response): Promise<unknown> {
  const text = await res.text();
  try {
    return text ? JSON.parse(text) : null;
  } catch {
    return text;
  }
}
