import { create } from 'zustand';

export interface AdminUser {
  id: string;
  email: string;
  fullName: string;
  role: string;
}

interface AuthState {
  token: string | null;
  user: AdminUser | null;
  setSession: (token: string, user: AdminUser) => void;
  logout: () => void;
}

// Deliberately a DIFFERENT localStorage key from the investigator dashboard
// ("admin-portal.auth" vs "iis.auth") - these are two separate applications
// with two separate sessions, even when opened in the same browser.
const STORAGE_KEY = 'admin-portal.auth';

function loadInitial(): { token: string | null; user: AdminUser | null } {
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
