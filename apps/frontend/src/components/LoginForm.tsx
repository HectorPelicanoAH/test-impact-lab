import { useState, type FormEvent } from 'react';
import { useLogin } from '../auth/useLogin';
import { validateLogin, type LoginValidation } from '../auth/validateLogin';
import { EmailInput } from './EmailInput';
import { PasswordInput } from './PasswordInput';
import { LoginButton } from './LoginButton';

export function LoginForm({ onSuccess }: { onSuccess: (path: '/home') => void }) {
  const { login, loading, error } = useLogin(onSuccess);
  const [validation, setValidation] = useState<LoginValidation>({});
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading) return;
    const data = new FormData(event.currentTarget);
    const email = String(data.get('email') ?? '');
    const password = String(data.get('password') ?? '');
    const errors = validateLogin(email, password);
    setValidation(errors);
    if (Object.keys(errors).length) return;
    void login(email, password);
  }
  return <form onSubmit={submit} aria-label="Sign in" noValidate>
    <EmailInput disabled={loading} error={validation.email} />
    <PasswordInput disabled={loading} error={validation.password} />
    {error && <p role="alert">{error}</p>}
    <LoginButton loading={loading} />
  </form>;
}
