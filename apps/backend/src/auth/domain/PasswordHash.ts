import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';

function derive(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCallback(password, salt, 64, (error, key) => error ? reject(error) : resolve(key));
  });
}

export class PasswordHash {
  private constructor(private readonly salt: Buffer, private readonly digest: Buffer) {}

  static async fromPassword(password: string): Promise<PasswordHash> {
    if (password.length < 1 || password.length > 256) throw new Error('Invalid password length');
    const salt = randomBytes(16);
    return new PasswordHash(salt, await derive(password, salt));
  }

  async matches(candidate: string): Promise<boolean> {
    if (candidate.length < 1 || candidate.length > 256) return false;
    return timingSafeEqual(this.digest, await derive(candidate, this.salt));
  }
}
