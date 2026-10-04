import { LoginForm } from './components/LoginForm';

export function LoginPage() {
  return <main className="card">
    <p className="eyebrow">TEST IMPACT LAB / APPLICATION</p>
    <h1>Sign in</h1>
    <p className="intro">One login journey. Real code, real tests.</p>
    <LoginForm onSuccess={path => window.location.assign(path)} />
    <aside>Demo account<br /><code>demo@example.com</code><br /><code>impact-demo</code></aside>
  </main>;
}
