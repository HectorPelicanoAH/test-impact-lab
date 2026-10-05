import type { Email } from '../../../domain/Email';
import type { User } from '../../../domain/User';
import type { UserRepository } from '../../../domain/UserRepository';

export class InMemoryUserRepository implements UserRepository {
  private readonly users: Map<string, User>;

  constructor(users: readonly User[]) {
    this.users = new Map(users.map(user => [user.email.value, user]));
    if (this.users.size !== users.length) throw new Error('Duplicate email');
  }

  async findByEmail(email: Email): Promise<User | undefined> {
    return this.users.get(email.value);
  }

  get size(): number {
    return this.users.size;
  }
}
