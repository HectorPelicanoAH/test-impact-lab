export function PasswordInput({ disabled, error }: { disabled: boolean; error?: string }) {
  return <label>Password<input name="password" type="password" autoComplete="current-password" maxLength={256} required disabled={disabled}
    aria-invalid={Boolean(error)} aria-describedby={error ? 'password-error' : undefined} />
    {error && <span id="password-error" role="alert">{error}</span>}
  </label>;
}
