export function LoginButton({ loading, disabled = false }: { loading: boolean; disabled?: boolean }) {
  return <button type="submit" disabled={disabled || loading} aria-busy={loading}>
    {loading ? 'Signing in…' : 'Sign in'}
  </button>;
}
