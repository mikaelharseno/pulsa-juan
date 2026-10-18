import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';

import { prisma } from '../../prisma/client';
import { AdminClaims } from '../interfaces/http';

const TOKEN_TTL = '7d';

/** Mirrors terbebas loginStoreUser: bcrypt compare, HS256 JWT, 7-day TTL. */
export async function loginAdmin(email: string, password: string) {
  const admin = await prisma.adminUser.findUnique({ where: { email: email.toLowerCase().trim() } });
  if (!admin || admin.status !== 'ACTIVE') return null;
  if (!(await bcrypt.compare(password, admin.passwordHash))) return null;
  const claims: AdminClaims = { kind: 'admin', adminId: admin.id, email: admin.email, role: admin.role };
  const token = jwt.sign(claims, process.env.TOKEN_SECRET!, { expiresIn: TOKEN_TTL });
  return { token, admin: { id: admin.id, email: admin.email, name: admin.name, role: admin.role } };
}

export async function hashPassword(password: string) {
  return bcrypt.hash(password, 10);
}
