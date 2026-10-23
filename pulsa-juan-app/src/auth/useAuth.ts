import { create } from 'zustand';

import { setAuthDeniedHandler } from '../api/client';
import { AgentProfile, Session } from '../api/types';
import { getToken, setToken } from '../storage';

/** Google account that still has to verify a phone before it can register. */
export interface PendingGoogle {
  googleTicket: string;
  name: string;
  email: string;
}

interface AuthState {
  hydrated: boolean;
  token: string | null;
  agent: AgentProfile | null;
  pendingGoogle: PendingGoogle | null;
  setPendingGoogle: (p: PendingGoogle | null) => void;
  hydrate: () => Promise<void>;
  signIn: (session: Session) => Promise<void>;
  signOut: () => Promise<void>;
  setAgent: (agent: AgentProfile) => void;
}

export const useAuth = create<AuthState>((set) => ({
  hydrated: false,
  token: null,
  agent: null,
  pendingGoogle: null,
  setPendingGoogle: (pendingGoogle) => set({ pendingGoogle }),
  hydrate: async () => {
    const token = await getToken();
    set({ token, hydrated: true });
  },
  signIn: async (session) => {
    await setToken(session.token);
    set({ token: session.token, agent: session.agent, pendingGoogle: null });
  },
  signOut: async () => {
    await setToken(null);
    set({ token: null, agent: null });
  },
  setAgent: (agent) => set({ agent }),
}));

setAuthDeniedHandler(() => {
  useAuth.getState().signOut();
});
