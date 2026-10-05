import { LOGIN_PATH, isLoginError, isLoginSuccess, type LoginSuccess } from '@test-impact/api-contract';
import { buildLoginRequest } from './buildLoginRequest';

export class AuthClient {
  constructor(private readonly fetcher: typeof fetch = (...args) => fetch(...args)) {}

  async login(email: string, password: string): Promise<LoginSuccess> {
    const response = await this.fetcher(LOGIN_PATH, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(buildLoginRequest(email, password)),
    });
    const body: unknown = await response.json();
    if (response.status === 200 && isLoginSuccess(body)) return body;
    if (isLoginError(body, response.status)) throw new Error(body.error.message);
    throw new Error('Unexpected response from the login service.');
  }
}
