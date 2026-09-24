import { create } from 'zustand';

export interface AuthUser {
  id: string;
  email: string;
  fullName: string;
  role: string;
}

interface AuthState {
  token: string | null;
  user: AuthUser | null;
  setSession: (token: string, user: AuthUser) => void;
  logout: () => void;
}

const STORAGE_KEY = 'iis.auth';

function loadInitial(): { token: string | null; user: AuthUser | null } {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { token: null, user: null };
    return JSON.parse(raw);
  } catch {
    return { token: null, user: null };
  }
}

export const useAuthStore = create<AuthState>((set) => ({
  ...loadInitial(),
  setSession: (token, user) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ token, user }));
    set({ token, user });
  },
  logout: () => {
    localStorage.removeItem(STORAGE_KEY);
    set({ token: null, user: null });
  },
}));

// Mirrors the backend's RBAC: INVESTIGATOR/SUPERVISOR/ADMINISTRATOR can create
// cases, upload evidence, and act on resolution/hypothesis reviews. AUDITOR is
// a read-only oversight role - the backend would 403 these anyway, so the UI
// doesn't offer buttons that can't work.
export function canAct(role: string | undefined): boolean {
  return role === 'INVESTIGATOR' || role === 'SUPERVISOR' || role === 'ADMINISTRATOR';
}
