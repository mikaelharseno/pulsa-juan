import { create } from 'zustand';

import { setAuthDeniedHandler } from '../api/client';
import { AgentProfile, Session } from '../api/types';
import { getToken, setToken } from '../storage';

interface AuthState {
  hydrated: boolean;
  token: string | null;
  agent: AgentProfile | null;
  hydrate: () => Promise<void>;
  signIn: (session: Session) => Promise<void>;
  signOut: () => Promise<void>;
  setAgent: (agent: AgentProfile) => void;
}

export const useAuth = create<AuthState>((set) => ({
  hydrated: false,
  token: null,
  agent: null,
  hydrate: async () => {
    const token = await getToken();
    set({ token, hydrated: true });
  },
  signIn: async (session) => {
    await setToken(session.token);
    set({ token: session.token, agent: session.agent });
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
