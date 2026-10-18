import { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';

import { prisma } from '../../prisma/client';
import { AgentClaims } from '../interfaces/http';

/** Verifies the agent JWT and attaches the live Agent row (blocks DISABLED). */
export async function authenticateAgent(req: Request, res: Response, next: NextFunction) {
  const header = req.headers['authorization'];
  const token = header && header.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Silakan login' });
  let claims: AgentClaims;
  try {
    const decoded = jwt.verify(token, process.env.TOKEN_SECRET!);
    if (typeof decoded !== 'object' || (decoded as AgentClaims).kind !== 'agent') throw new Error('bad');
    claims = decoded as AgentClaims;
  } catch {
    return res.status(403).json({ error: 'Sesi tidak valid', authDenied: true });
  }
  const agent = await prisma.agent.findUnique({ where: { id: claims.agentId } });
  if (!agent) return res.status(403).json({ error: 'Akun tidak ditemukan', authDenied: true });
  if (agent.status === 'DISABLED') return res.status(403).json({ error: 'Akun dinonaktifkan. Hubungi CS.' });
  req.agent = agent;
  next();
}
