import type {
  BillingInfo,
  LogEntry,
  MediaItem,
  ReelConfig,
  ReelConfigInput,
  Templates,
  User,
  UserRole,
} from './types';

// When the panel is served by the Express backend (production/AWS), the API is
// same-origin, so BASE_URL is empty (relative paths). For local dev the Vite
// server sets VITE_API_BASE_URL to the backend, e.g. http://localhost:3000.
const BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? '';

const TOKEN_STORAGE = 'insta-agent.token';

export function getToken(): string {
  return localStorage.getItem(TOKEN_STORAGE) ?? '';
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_STORAGE, token);
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_STORAGE);
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

async function request<T>(
  path: string,
  options: { method?: string; body?: unknown; auth?: boolean } = {},
): Promise<T> {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
  };
  if (options.auth !== false) {
    const token = getToken();
    if (token) headers['authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(`${BASE_URL}${path}`, {
    method: options.method ?? 'GET',
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const text = await res.text();
  const data = text ? JSON.parse(text) : null;

  if (!res.ok) {
    // A 401 on an authed request means the session expired / is invalid.
    if (res.status === 401 && options.auth !== false) {
      clearToken();
    }
    const msg =
      (data && (data.error || JSON.stringify(data))) ||
      `Request failed (${res.status})`;
    throw new ApiError(msg, res.status);
  }
  return data as T;
}

export const api = {
  baseUrl: BASE_URL,

  health: () => request<{ status: string }>('/health', { auth: false }),

  // Exchange a Google ID token (from Google Identity Services) for a session.
  googleLogin: (credential: string) =>
    request<{ token: string; expiresAt: string; user: User }>('/auth/google', {
      method: 'POST',
      body: { credential },
      auth: false,
    }),

  me: () => request<{ user: User }>('/auth/me'),

  // ---- Instagram self-serve connect (Business Login OAuth) ----
  getInstagramLoginUrl: () =>
    request<{ url: string }>('/auth/instagram/login'),

  disconnectInstagram: () =>
    request<{ user: User }>('/auth/instagram', { method: 'DELETE' }),

  // ---- Billing (Razorpay subscriptions) ----
  getBilling: () => request<BillingInfo>('/billing'),

  createSubscription: () =>
    request<{
      subscriptionId: string;
      keyId: string;
      shortUrl?: string;
      reused: boolean;
      user?: User;
    }>('/billing/subscription', { method: 'POST' }),

  verifyPayment: (payload: {
    razorpay_payment_id: string;
    razorpay_subscription_id: string;
    razorpay_signature: string;
  }) => request<{ user: User }>('/billing/verify', {
    method: 'POST',
    body: payload,
  }),

  // ---- Admin: user management ----
  listUsers: () => request<{ users: User[] }>('/users'),

  setUserRole: (id: string, role: UserRole) =>
    request<{ user: User }>(`/users/${encodeURIComponent(id)}/role`, {
      method: 'PATCH',
      body: { role },
    }),

  listMedia: () => request<{ items: MediaItem[] }>('/media'),

  publishMedia: (input: {
    mediaType: 'IMAGE' | 'REELS';
    mediaUrl: string;
    caption?: string;
  }) => request<{ mediaId: string }>('/media', { method: 'POST', body: input }),

  saveReelConfig: (input: ReelConfigInput) =>
    request<{ reel: ReelConfig }>('/reels', { method: 'POST', body: input }),

  deleteReelConfig: (reelId: string) =>
    request<void>(`/reels/${encodeURIComponent(reelId)}`, { method: 'DELETE' }),

  getTemplates: () => request<{ templates: Templates }>('/templates'),

  putTemplates: (templates: Partial<Templates>) =>
    request<{ templates: Templates }>('/templates', {
      method: 'PUT',
      body: templates,
    }),

  getLogs: (limit = 50, offset = 0) =>
    request<{ total: number; items: LogEntry[] }>(
      `/logs?limit=${limit}&offset=${offset}`,
    ),
};
