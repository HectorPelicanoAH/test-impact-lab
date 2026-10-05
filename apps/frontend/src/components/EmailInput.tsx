export function EmailInput({ disabled, error }: { disabled: boolean; error?: string }) {
  return <label>Email<input name="email" type="email" autoComplete="username" maxLength={254} required disabled={disabled}
    aria-invalid={Boolean(error)} aria-describedby={error ? 'email-error' : undefined} />
    {error && <span id="email-error" role="alert">{error}</span>}
  </label>;
}
