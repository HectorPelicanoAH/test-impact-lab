import type { LoginRequest } from '@test-impact/api-contract';
import { normalizeEmail } from './normalizeEmail';

export function buildLoginRequest(email: string, password: string): LoginRequest {
  return { email: normalizeEmail(email), password };
}
