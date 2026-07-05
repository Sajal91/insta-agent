import type {
  LogEntry,
  MediaItem,
  ReelConfig,
  ReelConfigInput,
  Templates,
} from './types';

const BASE_URL =
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ??
  'http://localhost:3000';

const API_KEY_STORAGE = 'insta-agent.apiKey';

export function getApiKey(): string {
  return localStorage.getItem(API_KEY_STORAGE) ?? '';
}

export function setApiKey(key: string): void {
  localStorage.setItem(API_KEY_STORAGE, key);
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
  options: { method?: string; body?: unknown } = {},
): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: options.method ?? 'GET',
    headers: {
      'content-type': 'application/json',
      'x-api-key': getApiKey(),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const text = await res.text();
  const data = text ? JSON.parse(text) : null;

  if (!res.ok) {
    const msg =
      (data && (data.error || JSON.stringify(data))) || `Request failed (${res.status})`;
    throw new ApiError(msg, res.status);
  }
  return data as T;
}

export const api = {
  baseUrl: BASE_URL,

  health: () => request<{ status: string }>('/health'),

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
