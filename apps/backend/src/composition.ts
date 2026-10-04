import { Email } from './auth/domain/Email';
import { PasswordHash } from './auth/domain/PasswordHash';
import { User } from './auth/domain/User';
import type { UserRepository } from './auth/domain/UserRepository';
import { AuthenticateUser } from './auth/application/AuthenticateUser';
import { LoginController } from './auth/infrastructure/inbound/http/LoginController';
import { InMemoryUserRepository } from './auth/infrastructure/outbound/persistence/InMemoryUserRepository';

export async function createLoginController(repository?: UserRepository): Promise<LoginController> {
  const users = repository ?? new InMemoryUserRepository([
    new User('demo-user', new Email('demo@example.com'), await PasswordHash.fromPassword('impact-demo')),
    new User('locked-user', new Email('locked@example.com'), await PasswordHash.fromPassword('impact-demo'), true),
  ]);
  return new LoginController(new AuthenticateUser(users));
}
