import { Email } from '../domain/Email';
import type { UserRepository } from '../domain/UserRepository';

export type AuthenticationResult =
  | { kind: 'authenticated'; user: { id: string; email: string } }
  | { kind: 'invalid-credentials' }
  | { kind: 'locked' };

export class AuthenticateUser {
  constructor(private readonly users: UserRepository) {}

  async execute(email: string, password: string): Promise<AuthenticationResult> {
    const user = await this.users.findByEmail(new Email(email));
    if (!user) return { kind: 'invalid-credentials' };
    const result = await user.authenticate(password);
    if (result !== 'authenticated') return { kind: result };
    return { kind: result, user: { id: user.id, email: user.email.value } };
  }
}
