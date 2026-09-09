/**
 * Auth utilities — JWT storage in localStorage.
 * All functions are client-side only.
 */

export interface JwtPayload {
  sub: string;
  email: string;
  role: 'user' | 'admin' | 'superadmin';
  username: string;
  exp: number;
}

export function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('SwiTF01-hit3_token');
}

export function setToken(token: string): void {
  localStorage.setItem('SwiTF01-hit3_token', token);
  document.cookie = `access_token=${token}; path=/; max-age=7200; samesite=lax`;
}

export function clearToken(): void {
  localStorage.removeItem('SwiTF01-hit3_token');
  localStorage.removeItem('SwiTF01-hit3_role');
  document.cookie = 'access_token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';
}

export function decodeToken(token: string): JwtPayload | null {
  try {
    const base64 = token.split('.')[1];
    const decoded = JSON.parse(atob(base64));
    return decoded as JwtPayload;
  } catch {
    return null;
  }
}

export function getRole(): string | null {
  const token = getToken();
  if (!token) return null;
  const payload = decodeToken(token);
  if (!payload) return null;
  if (payload.exp * 1000 < Date.now()) {
    clearToken();
    return null;
  }
  return payload.role;
}

export function getUsername(): string | null {
  const token = getToken();
  if (!token) return null;
  return decodeToken(token)?.username ?? null;
}

export function getUserId(): string | null {
  const token = getToken();
  if (!token) return null;
  return decodeToken(token)?.sub ?? null;
}


export function isAuthenticated(): boolean {
  return getRole() !== null;
}

export function authHeader(): Record<string, string> {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export function redirectForRole(role: string): string {
  switch (role) {
    case 'superadmin': return '/superadmin';
    case 'admin': return '/admin';
    default: return '/dashboard';
  }
}
