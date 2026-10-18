import axios from 'axios';

export const API_BASE = (import.meta.env.VITE_API_BASE as string | undefined) ?? 'http://localhost:3030/api';
const KEY = 'pulsajuanAdminSession';

export interface AdminSession {
  token: string;
  admin: { id: string; email: string; name: string; role: 'OWNER' | 'ADMIN' | 'STAFF' };
}

function decodeExp(token: string): number | null {
  try {
    const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    return typeof payload.exp === 'number' ? payload.exp * 1000 : null;
  } catch {
    return null;
  }
}

export function getSession(): AdminSession | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as AdminSession;
    const exp = decodeExp(s.token);
    if (exp && exp < Date.now()) {
      localStorage.removeItem(KEY);
      return null;
    }
    return s;
  } catch {
    return null;
  }
}

export function setSession(s: AdminSession | null) {
  if (s) localStorage.setItem(KEY, JSON.stringify(s));
  else localStorage.removeItem(KEY);
}

export const api = axios.create({ baseURL: API_BASE });
api.interceptors.request.use((cfg) => {
  const s = getSession();
  if (s) cfg.headers.Authorization = 'Bearer ' + s.token;
  return cfg;
});
api.interceptors.response.use(
  (r) => r,
  (err) => {
    if (err?.response?.data?.authDenied) {
      setSession(null);
      window.location.reload();
    }
    return Promise.reject(err);
  },
);

export function errMsg(e: unknown, fallback = 'Terjadi kesalahan'): string {
  const anyE = e as { response?: { data?: { error?: string } }; message?: string };
  return anyE?.response?.data?.error ?? anyE?.message ?? fallback;
}

export function fmtRp(n: number | string | null | undefined): string {
  const v = Math.round(Number(n ?? 0));
  return 'Rp ' + v.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '-';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
