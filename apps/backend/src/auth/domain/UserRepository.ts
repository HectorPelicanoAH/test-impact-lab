import type { Email } from './Email';
import type { User } from './User';

export interface UserRepository {
  findByEmail(email: Email): Promise<User | undefined>;
}
