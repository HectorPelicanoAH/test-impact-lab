import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { LoginPage } from './LoginPage';
import { OrdersPage } from './OrdersPage';
import './styles.css';

const root = document.getElementById('root');
if (!root) throw new Error('Missing root element');
createRoot(root).render(<StrictMode>{window.location.pathname === '/orders'
  ? <OrdersPage /> : window.location.pathname === '/home'
  ? <main className="card"><p className="eyebrow">TEST IMPACT LAB / APPLICATION</p><h1>Welcome home</h1>
    <p>The login journey completed successfully.</p><p>This demo does not create a persistent session.</p><a href="/orders">Open orders demo</a><br /><a href="/">Back to sign in</a></main>
  : <LoginPage />}</StrictMode>);
