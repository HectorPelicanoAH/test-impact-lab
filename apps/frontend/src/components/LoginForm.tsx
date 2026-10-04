import type { FormEvent } from 'react';
import { useLogin } from '../auth/useLogin';
import { EmailInput } from './EmailInput';
import { PasswordInput } from './PasswordInput';
import { LoginButton } from './LoginButton';

export function LoginForm({ onSuccess }: { onSuccess: (path: '/home') => void }) {
  const { login, loading, error } = useLogin(onSuccess);
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading) return;
    const data = new FormData(event.currentTarget);
    void login(String(data.get('email') ?? ''), String(data.get('password') ?? ''));
  }
  return <form onSubmit={submit} aria-label="Sign in">
    <EmailInput disabled={loading} />
    <PasswordInput disabled={loading} />
    {error && <p role="alert">{error}</p>}
    <LoginButton loading={loading} />
  </form>;
}
