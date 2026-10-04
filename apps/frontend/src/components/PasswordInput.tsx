export function PasswordInput({ disabled }: { disabled: boolean }) {
  return <label>Password<input name="password" type="password" autoComplete="current-password" maxLength={256} required disabled={disabled} /></label>;
}
