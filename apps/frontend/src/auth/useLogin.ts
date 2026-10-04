import { useState } from 'react';
import { AuthClient } from './AuthClient';

const defaultClient = new AuthClient();

export function useLogin(onSuccess: (path: '/home') => void, client = defaultClient) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function login(email: string, password: string) {
    setLoading(true);
    setError(null);
    try {
      const result = await client.login(email, password);
      onSuccess(result.redirectTo);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to sign in.');
    } finally {
      setLoading(false);
    }
  }
  return { login, loading, error };
}
