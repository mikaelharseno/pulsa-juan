import Constants from 'expo-constants';
import { Platform } from 'react-native';

import { getToken } from '../storage';

function defaultBase(): string {
  const configured = process.env.EXPO_PUBLIC_API_BASE ?? (Constants.expoConfig?.extra as { apiBase?: string } | undefined)?.apiBase;
  const base = configured ?? 'http://localhost:3030/api';
  // Android emulator reaches the host machine via 10.0.2.2
  if (Platform.OS === 'android' && base.includes('localhost')) return base.replace('localhost', '10.0.2.2');
  return base;
}

export const IS_MOCK = process.env.EXPO_PUBLIC_MOCK === '1';
export const API_BASE = IS_MOCK ? 'mock (data demo)' : defaultBase();

export class ApiError extends Error {
  status: number;
  code?: string;
  extra: Record<string, unknown>;
  authDenied: boolean;
  constructor(status: number, body: Record<string, unknown> | null) {
    super((body?.error as string) ?? `HTTP ${status}`);
    this.status = status;
    this.code = body?.code as string | undefined;
    this.authDenied = !!body?.authDenied;
    this.extra = body ?? {};
  }
}

let onAuthDenied: (() => void) | null = null;
export function setAuthDeniedHandler(fn: () => void) {
  onAuthDenied = fn;
}

export async function api<T>(path: string, init: RequestInit & { json?: unknown; query?: Record<string, unknown> } = {}): Promise<T> {
  if (IS_MOCK) {
    const { mockApi } = await import('./mock');
    const res = await mockApi(path, init.method ?? 'GET', init.json, init.query);
    if (res.status >= 400) throw new ApiError(res.status, res.body as Record<string, unknown>);
    return res.body as T;
  }
  const token = await getToken();
  const headers: Record<string, string> = { Accept: 'application/json', ...(init.headers as Record<string, string>) };
  if (token) headers.Authorization = 'Bearer ' + token;
  let body = init.body;
  if (init.json !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(init.json);
  }
  let url = API_BASE + path;
  if (init.query) {
    const qs = Object.entries(init.query)
      .filter(([, v]) => v !== undefined && v !== null && v !== '')
      .map(([k, v]) => encodeURIComponent(k) + '=' + encodeURIComponent(String(v)))
      .join('&');
    if (qs) url += (url.includes('?') ? '&' : '?') + qs;
  }
  const res = await fetch(url, { ...init, headers, body });
  const text = await res.text();
  let parsed: Record<string, unknown> | null = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = null;
  }
  if (!res.ok) {
    const err = new ApiError(res.status, parsed);
    if (err.authDenied && onAuthDenied) onAuthDenied();
    throw err;
  }
  return parsed as T;
}

export const get = <T>(path: string, query?: Record<string, unknown>) => api<T>(path, { method: 'GET', query });
export const post = <T>(path: string, json?: unknown) => api<T>(path, { method: 'POST', json: json ?? {} });
export const put = <T>(path: string, json?: unknown) => api<T>(path, { method: 'PUT', json: json ?? {} });
