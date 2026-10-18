import { create } from 'zustand';

import { AdminSession, getSession, setSession } from '../api';

interface SessionState {
  session: AdminSession | null;
  signIn: (s: AdminSession) => void;
  signOut: () => void;
}

export const useSession = create<SessionState>((set) => ({
  session: getSession(),
  signIn: (s) => {
    setSession(s);
    set({ session: s });
  },
  signOut: () => {
    setSession(null);
    set({ session: null });
  },
}));

export function useRole() {
  return useSession((s) => s.session?.admin.role ?? 'STAFF');
}
