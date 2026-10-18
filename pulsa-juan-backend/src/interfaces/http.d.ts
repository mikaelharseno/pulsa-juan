import { AdminRole } from '../../prisma/generated';
import type { AgentRow } from '../service/agentAuth.service';

export interface AdminClaims {
  kind: 'admin';
  adminId: string;
  email: string;
  role: AdminRole;
}

export interface AgentClaims {
  kind: 'agent';
  agentId: string;
}

declare global {
  namespace Express {
    interface Request {
      admin?: AdminClaims;
      agent?: AgentRow;
      rawBody?: Buffer;
    }
  }
}
