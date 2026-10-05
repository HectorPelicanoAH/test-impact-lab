import { Email } from './Email';
import { PasswordHash } from './PasswordHash';

export type Authentication = 'authenticated' | 'invalid-credentials' | 'locked';

export class User {
  constructor(
    readonly id: string,
    readonly email: Email,
    private readonly passwordHash: PasswordHash,
    private readonly locked = false,
  ) {
    if (!id.trim()) throw new Error('A user must have an identity');
  }

  async authenticate(password: string): Promise<Authentication> {
    if (this.locked) return 'locked';
    return await this.passwordHash.matches(password) ? 'authenticated' : 'invalid-credentials';
  }
}
