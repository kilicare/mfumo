import { create } from 'zustand';
import axios from 'axios';
import { authAPI, AuthUser, getApiError, RegisterRequest, tokenStorage } from '@/lib/api';

type AuthStatus = 'loading' | 'authenticated' | 'anonymous';

interface AuthState {
  status: AuthStatus;
  user: AuthUser | null;
  accessToken: string | null;
  error: string | null;
  initialize: () => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  register: (input: RegisterRequest) => Promise<void>;
  logout: () => Promise<void>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
  clearError: () => void;
  syncToken: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  status: 'loading',
  user: null,
  accessToken: null,
  error: null,

  initialize: async () => {
    const accessToken = tokenStorage.readAccess();
    const savedUser = tokenStorage.readUser();
    if (!accessToken) {
      tokenStorage.clear();
      set({ status: 'anonymous', user: null, accessToken: null });
      return;
    }
    set({ status: 'loading', accessToken, error: null });
    try {
      const profile = await authAPI.getProfile();
      const current = savedUser || useAuthStore.getState().user;
      set({
        status: 'authenticated',
        accessToken: tokenStorage.readAccess(),
        user: { ...current, ...profile, businessName: profile.businessName || current?.businessName },
      });
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 401) {
        tokenStorage.clear();
        set({ status: 'anonymous', user: null, accessToken: null });
        return;
      }
      if (savedUser) {
        set({ status: 'authenticated', user: savedUser, accessToken: tokenStorage.readAccess() });
      } else {
        set({ status: 'anonymous', user: null, accessToken: tokenStorage.readAccess() });
      }
    }
  },

  login: async (email, password) => {
    set({ status: 'loading', error: null });
    try {
      const result = await authAPI.login({ email: email.trim(), password });
      tokenStorage.save(result.accessToken, result.refreshToken, result.user);
      set({ status: 'authenticated', user: result.user, accessToken: result.accessToken, error: null });
    } catch (error) {
      const message = getApiError(error, 'Sign in failed. Check your details and try again.');
      set({ status: 'anonymous', error: message });
      throw new Error(message);
    }
  },

  register: async (input) => {
    set({ status: 'loading', error: null });
    try {
      const result = await authAPI.register(input);
      tokenStorage.save(result.accessToken, result.refreshToken, result.user);
      set({ status: 'authenticated', user: result.user, accessToken: result.accessToken, error: null });
    } catch (error) {
      const message = getApiError(error, 'We could not create your account. Please try again.');
      set({ status: 'anonymous', error: message });
      throw new Error(message);
    }
  },

  logout: async () => {
    try {
      if (tokenStorage.readAccess()) await authAPI.logout();
    } catch {
      // Local sign out still completes if the API is unavailable or the session expired.
    } finally {
      tokenStorage.clear();
      set({ status: 'anonymous', user: null, accessToken: null, error: null });
    }
  },

  changePassword: async (currentPassword, newPassword) => {
    await authAPI.changePassword(currentPassword, newPassword);
    tokenStorage.clear();
    set({ status: 'anonymous', user: null, accessToken: null, error: null });
  },

  clearError: () => set({ error: null }),
  syncToken: () => set({ accessToken: tokenStorage.readAccess() }),
}));
