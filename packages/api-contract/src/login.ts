export const LOGIN_PATH = '/login';

export interface LoginRequest { email: string; password: string }
export interface LoginSuccess { user: { id: string; email: string }; redirectTo: '/home' }
export type LoginErrorCode = 'INVALID_REQUEST' | 'INVALID_CREDENTIALS' | 'USER_LOCKED' | 'INTERNAL_ERROR';
export interface LoginError { error: { code: LoginErrorCode; message: string } }
export type LoginResponse =
  | { status: 200; body: LoginSuccess }
  | { status: 400 | 401 | 403 | 500; body: LoginError };

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isLoginRequest(value: unknown): value is LoginRequest {
  return record(value) && Object.keys(value).length === 2
    && typeof value.email === 'string' && value.email.length <= 254
    && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.email.trim())
    && typeof value.password === 'string' && value.password.length > 0 && value.password.length <= 256;
}

export function isLoginSuccess(value: unknown): value is LoginSuccess {
  return record(value) && Object.keys(value).length === 2 && value.redirectTo === '/home'
    && record(value.user) && Object.keys(value.user).length === 2
    && typeof value.user.id === 'string' && value.user.id.length > 0
    && typeof value.user.email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.user.email);
}

export function isLoginError(value: unknown, status: number): value is LoginError {
  const codes: Record<number, LoginErrorCode> = {
    400: 'INVALID_REQUEST', 401: 'INVALID_CREDENTIALS', 403: 'USER_LOCKED', 500: 'INTERNAL_ERROR',
  };
  return record(value) && Object.keys(value).length === 1 && record(value.error)
    && Object.keys(value.error).length === 2 && codes[status] !== undefined
    && value.error.code === codes[status] && typeof value.error.message === 'string'
    && value.error.message.length > 0;
}
