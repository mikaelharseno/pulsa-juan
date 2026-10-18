import { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';

import { AdminRole } from '../../prisma/generated';
import { AdminClaims } from '../interfaces/http';

// Same shape as terbebas-backend's authenticateStoreUser, minus the tenant.
export function authenticateAdmin(req: Request, res: Response, next: NextFunction) {
  const header = req.headers['authorization'];
  const token = header && header.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Silakan login' });
  jwt.verify(token, process.env.TOKEN_SECRET!, (err, decoded) => {
    if (err || typeof decoded !== 'object') return res.status(403).json({ error: 'Sesi tidak valid', authDenied: true });
    const claims = decoded as AdminClaims;
    if (claims.kind !== 'admin' || !claims.adminId || !claims.role) {
      return res.status(403).json({ error: 'Sesi tidak valid', authDenied: true });
    }
    req.admin = claims;
    next();
  });
}

export function requireRole(...roles: AdminRole[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.admin || !roles.includes(req.admin.role)) {
      return res.status(403).json({ error: 'Butuh hak akses ' + roles.join('/') });
    }
    next();
  };
}
