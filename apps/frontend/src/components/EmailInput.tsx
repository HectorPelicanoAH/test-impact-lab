export function EmailInput({ disabled }: { disabled: boolean }) {
  return <label>Email<input name="email" type="email" autoComplete="username" maxLength={254} required disabled={disabled} /></label>;
}
