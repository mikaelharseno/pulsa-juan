import { NextFunction, Request, Response } from 'express';

/** Thrown by services; converted to `{ error, code?, ...extra }` by errorMiddleware. */
export class HttpError extends Error {
  status: number;
  code?: string;
  extra?: Record<string, unknown>;
  constructor(status: number, message: string, code?: string, extra?: Record<string, unknown>) {
    super(message);
    this.status = status;
    this.code = code;
    this.extra = extra;
  }
}

export const badRequest = (message: string, code?: string, extra?: Record<string, unknown>) =>
  new HttpError(400, message, code, extra);
export const notFound = (message = 'Data tidak ditemukan') => new HttpError(404, message, 'NOT_FOUND');
export const conflict = (message: string, code?: string, extra?: Record<string, unknown>) =>
  new HttpError(409, message, code, extra);
export const forbidden = (message = 'Tidak diizinkan') => new HttpError(403, message, 'FORBIDDEN');

type Handler = (req: Request, res: Response, next: NextFunction) => Promise<unknown> | unknown;

export function asyncHandler(fn: Handler) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorMiddleware(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: err.message, ...(err.code ? { code: err.code } : {}), ...(err.extra ?? {}) });
  }
  if (err instanceof SyntaxError && 'body' in (err as object)) {
    return res.status(400).json({ error: 'Body JSON tidak valid' });
  }
  console.error(err);
  return res.status(500).json({ error: 'Terjadi kesalahan pada server' });
}
