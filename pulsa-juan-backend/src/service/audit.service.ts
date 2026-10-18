import { prisma } from '../../prisma/client';

export async function audit(adminId: string, action: string, targetType: string, targetId: string, payload?: unknown) {
  try {
    await prisma.adminAuditLog.create({
      data: { adminId, action, targetType, targetId, payload: payload === undefined ? undefined : (payload as object) },
    });
  } catch (error) {
    console.warn('audit log failed', error);
  }
}
