import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';

export const API_URL =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, '') ||
  'http://localhost:3002/api/v1';

const ACCESS_TOKEN_KEY = 'genuine.accessToken';
const REFRESH_TOKEN_KEY = 'genuine.refreshToken';
const USER_KEY = 'genuine.user';
const SESSION_COOKIE = 'genuine-session';

type ApiEnvelope<T> = { data?: T; message?: string | string[] };

export interface AuthUser {
  id: string;
  email: string;
  name?: string;
  firstName: string;
  lastName: string;
  businessId: string;
  businessName?: string;
  roles: string[];
  permissions: string[];
  avatar?: string | null;
}

export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  user: AuthUser;
}

type RetriableRequest = InternalAxiosRequestConfig & { _authRetry?: boolean };

export const tokenStorage = {
  accessKey: ACCESS_TOKEN_KEY,
  refreshKey: REFRESH_TOKEN_KEY,
  readAccess: () => (typeof window === 'undefined' ? null : localStorage.getItem(ACCESS_TOKEN_KEY)),
  readRefresh: () => (typeof window === 'undefined' ? null : localStorage.getItem(REFRESH_TOKEN_KEY)),
  readUser: () => {
    if (typeof window === 'undefined') return null;
    try {
      const value = localStorage.getItem(USER_KEY);
      return value ? (JSON.parse(value) as AuthUser) : null;
    } catch {
      localStorage.removeItem(USER_KEY);
      return null;
    }
  },
  save(accessToken: string, refreshToken: string, user: AuthUser) {
    if (typeof window === 'undefined') return;
    localStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
    localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
    const secure = window.location.protocol === 'https:' ? '; Secure' : '';
    document.cookie = `${SESSION_COOKIE}=1; Path=/; Max-Age=604800; SameSite=Lax${secure}`;
  },
  updateAccess(accessToken: string) {
    if (typeof window !== 'undefined') localStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
  },
  updateTokens(accessToken: string, refreshToken: string) {
    if (typeof window === 'undefined') return;
    localStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
    localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
    const secure = window.location.protocol === 'https:' ? '; Secure' : '';
    document.cookie = `${SESSION_COOKIE}=1; Path=/; Max-Age=604800; SameSite=Lax${secure}`;
  },
  updateUser(user: AuthUser) {
    if (typeof window !== 'undefined') localStorage.setItem(USER_KEY, JSON.stringify(user));
  },
  clear() {
    if (typeof window === 'undefined') return;
    localStorage.removeItem(ACCESS_TOKEN_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    document.cookie = `${SESSION_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax`;
  },
};

export const apiClient = axios.create({
  baseURL: API_URL,
  headers: { 'Content-Type': 'application/json' },
  timeout: 20_000,
});

apiClient.interceptors.request.use((config) => {
  const token = tokenStorage.readAccess();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

let refreshInFlight: Promise<string> | null = null;

async function rotateRefreshToken(fallbackToken: string): Promise<string> {
  const rotate = async () => {
    // Refresh tokens live in shared localStorage; serialize requests across tabs where supported.
    const refreshToken = tokenStorage.readRefresh() || fallbackToken;
    const response = await axios.post<ApiEnvelope<{ accessToken: string; refreshToken: string }>>(
      `${API_URL}/auth/refresh`,
      { refreshToken },
      { timeout: 20_000 },
    );
    const payload = response.data.data ?? (response.data as unknown as { accessToken: string; refreshToken: string });
    if (!payload?.accessToken || !payload.refreshToken) {
      throw new Error('Refresh response did not include rotated tokens');
    }
    tokenStorage.updateTokens(payload.accessToken, payload.refreshToken);
    if (typeof window !== 'undefined') window.dispatchEvent(new Event('genuine:token-refreshed'));
    return payload.accessToken;
  };

  if (typeof navigator !== 'undefined' && navigator.locks) {
    return navigator.locks.request('genuine-auth-token-refresh', rotate);
  }
  return rotate();
}

apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError<ApiEnvelope<unknown>>) => {
    const original = error.config as RetriableRequest | undefined;
    const isAuthEntryRequest = /\/auth\/(login|register|refresh|forgot-password|reset-password)(\?|$)/.test(
      original?.url || '',
    );

    if (error.response?.status === 401 && original && !original._authRetry && !isAuthEntryRequest) {
      const refreshToken = tokenStorage.readRefresh();
      if (refreshToken) {
        original._authRetry = true;
        try {
          refreshInFlight ??= rotateRefreshToken(refreshToken).finally(() => {
            refreshInFlight = null;
          });
          const accessToken = await refreshInFlight;
          original.headers.Authorization = `Bearer ${accessToken}`;
          return apiClient(original);
        } catch {
          // Another tab may have rotated the shared refresh token first; do not erase its new session.
          const latestRefreshToken = tokenStorage.readRefresh();
          if (latestRefreshToken && latestRefreshToken !== refreshToken) {
            try {
              const response = await axios.post<ApiEnvelope<{ accessToken: string; refreshToken: string }>>(
                `${API_URL}/auth/refresh`,
                { refreshToken: latestRefreshToken },
                { timeout: 20_000 },
              );
              const payload = response.data.data ?? (response.data as unknown as { accessToken: string; refreshToken: string });
              if (!payload?.accessToken || !payload.refreshToken) throw new Error('Refresh response did not include rotated tokens');
              tokenStorage.updateTokens(payload.accessToken, payload.refreshToken);
              original.headers.Authorization = `Bearer ${payload.accessToken}`;
              return apiClient(original);
            } catch {
              if (tokenStorage.readRefresh() === latestRefreshToken) tokenStorage.clear();
            }
          } else {
            tokenStorage.clear();
          }
          if (typeof window !== 'undefined' && window.location.pathname !== '/login') {
            window.location.assign('/login?reason=session-expired');
          }
        }
      }
    }
    return Promise.reject(error);
  },
);

export function unwrap<T>(response: { data: ApiEnvelope<T> | T }): T {
  const body = response.data as ApiEnvelope<T>;
  return body && typeof body === 'object' && 'data' in body
    ? (body.data as T)
    : (body as T);
}

export function getApiError(error: unknown, fallback: string): string {
  if (axios.isAxiosError(error)) {
    const message = error.response?.data?.message;
    if (Array.isArray(message)) return message.join('. ');
    if (typeof message === 'string' && message.trim()) return message;
    if (error.code === 'ECONNABORTED') return 'The server took too long to respond. Please try again.';
    if (!error.response) return 'Could not connect to the server. Check your connection and try again.';
  }
  return fallback;
}

export interface RegisterRequest {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  businessName: string;
  businessType: string;
}

export interface UserProfile extends AuthUser {
  phone?: string;
  avatar?: string;
}

export const authAPI = {
  async login(data: { email: string; password: string }) {
    return unwrap<AuthResponse>(await apiClient.post('/auth/login', data));
  },
  async register(data: RegisterRequest) {
    return unwrap<AuthResponse>(await apiClient.post('/auth/register', data));
  },
  async forgotPassword(email: string) {
    return unwrap<{ message: string }>(await apiClient.post('/auth/forgot-password', { email }));
  },
  async resetPassword(token: string, newPassword: string) {
    return unwrap<{ message: string }>(await apiClient.post('/auth/reset-password', { token, newPassword }));
  },
  async changePassword(currentPassword: string, newPassword: string) {
    return unwrap<{ message: string }>(await apiClient.patch('/auth/change-password', { currentPassword, newPassword }));
  },
  async getProfile() {
    return unwrap<UserProfile>(await apiClient.get('/auth/me'));
  },
  async updateAvatar(avatar: string) {
    return unwrap<{ avatar: string | null }>(await apiClient.patch('/auth/profile/avatar', { avatar }));
  },
  async getAvatar() {
    return (await apiClient.get('/auth/profile/avatar', { responseType: 'blob' })).data as Blob;
  },
  async logout() {
    return unwrap<{ message: string }>(await apiClient.post('/auth/logout', {}));
  },
};
