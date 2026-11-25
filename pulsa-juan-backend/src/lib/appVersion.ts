import { NextFunction, Request, Response } from 'express';

import { getConfig } from '../service/config.service';

// The agent app sends its version (app.json expo.version) as X-App-Version
// since 1.3.0. Older apps send nothing.

export const VERSION_RE = /^\d+\.\d+\.\d+$/;

/** -1 / 0 / 1 like a comparator; both must be x.y.z */
export function compareVersions(a: string, b: string) {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if (pa[i] !== pb[i]) return pa[i] < pb[i] ? -1 : 1;
  }
  return 0;
}

/** The calling app's version, or null for apps older than 1.3.0 (no header). */
export function clientVersion(req: Request): string | null {
  const v = req.headers['x-app-version'];
  const s = Array.isArray(v) ? v[0] : v;
  return s && VERSION_RE.test(s.trim()) ? s.trim() : null;
}

/** true when the caller runs at least `min` (apps without the header count as older than anything). */
export function appAtLeast(req: Request, min: string) {
  const v = clientVersion(req);
  return !!v && compareVersions(v, min) >= 0;
}

// StoreConfig is read on every agent request; keep it for a few seconds.
let cached: { at: number; min: string; url: string } | null = null;
const CACHE_MS = 15_000;
export function resetAppVersionCache() {
  cached = null;
}

/**
 * Forced update: with StoreConfig.minAppVersion set, an app below it (or one
 * that sends no version: 1.2.0 and older) gets 426 APP_UPDATE_REQUIRED on
 * every agent route except GET /config, which 1.3.0+ reads to show its
 * blocking "Perbarui aplikasi" dialog.
 */
export async function appVersionGate(req: Request, res: Response, next: NextFunction) {
  try {
    if (req.method === 'GET' && req.path === '/config') return next();
    if (!cached || Date.now() - cached.at > CACHE_MS) {
      const c = await getConfig();
      cached = { at: Date.now(), min: c.minAppVersion, url: c.appDownloadUrl };
    }
    const { min, url } = cached;
    if (!min || !VERSION_RE.test(min)) return next();
    const v = clientVersion(req);
    if (v && compareVersions(v, min) >= 0) return next();
    return res.status(426).json({
      error: `Versi aplikasi terlalu lama. Silakan update aplikasi Murah Kuota di ${url}`,
      code: 'APP_UPDATE_REQUIRED',
      minAppVersion: min,
      appDownloadUrl: url,
    });
  } catch (error) {
    next(error);
  }
}
