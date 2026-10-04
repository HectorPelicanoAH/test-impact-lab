import { isLoginRequest, type LoginResponse } from '@test-impact/api-contract';
import { AuthenticateUser } from '../../../application/AuthenticateUser';

export class LoginController {
  constructor(private readonly authenticateUser: AuthenticateUser) {}

  async handle(body: unknown): Promise<LoginResponse> {
    if (!isLoginRequest(body)) {
      return { status: 400, body: { error: { code: 'INVALID_REQUEST', message: 'Enter a valid email and password.' } } };
    }
    try {
      const result = await this.authenticateUser.execute(body.email, body.password);
      if (result.kind === 'invalid-credentials') {
        return { status: 401, body: { error: { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password.' } } };
      }
      if (result.kind === 'locked') {
        return { status: 403, body: { error: { code: 'USER_LOCKED', message: 'This account is locked.' } } };
      }
      return { status: 200, body: { user: result.user, redirectTo: '/home' } };
    } catch {
      return { status: 500, body: { error: { code: 'INTERNAL_ERROR', message: 'Unable to sign in. Try again later.' } } };
    }
  }
}
