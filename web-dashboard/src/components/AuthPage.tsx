import { useState } from 'react';
import type { FormEvent } from 'react';
import { api, ApiError } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { LogoIcon } from './Icons';
import { ThemeToggle } from './ThemeToggle';

export function AuthPage() {
  const { login } = useAuth();

  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [loginBusy, setLoginBusy] = useState(false);

  async function handleLogin(e: FormEvent) {
    e.preventDefault();
    setLoginError('');
    setLoginBusy(true);
    try {
      const data = await api.login(loginEmail, loginPassword);
      login(data);
    } catch (err) {
      if (err instanceof ApiError && err.status === 403 && err.message === 'subscription_suspended') {
        setLoginError("Klinikangiz obunasi to'xtatilgan. Iltimos, ta'minotchi bilan bog'laning.");
      } else {
        setLoginError(err instanceof ApiError ? err.message : 'Server bilan aloqa xato');
      }
    } finally {
      setLoginBusy(false);
    }
  }

  return (
    <div className="auth-screen">
      <div className="auth-top">
        <a href="/" className="brand">
          <span className="brand-mark">
            <LogoIcon />
          </span>
          <span className="brand-text">NurseCall</span>
        </a>
        <ThemeToggle />
      </div>

      <div className="auth-wrap">
        <div className="auth-card glass">
          <p className="eyebrow">Klinika paneli</p>
          <h1>Xush kelibsiz</h1>

          <form className="auth-form" onSubmit={handleLogin}>
            <label htmlFor="login-email">Email</label>
            <input
              id="login-email"
              type="email"
              required
              autoComplete="username"
              placeholder="siz@klinika.uz"
              value={loginEmail}
              onChange={(e) => setLoginEmail(e.target.value)}
            />
            <label htmlFor="login-password">Parol</label>
            <input
              id="login-password"
              type="password"
              required
              autoComplete="current-password"
              placeholder="••••••••"
              value={loginPassword}
              onChange={(e) => setLoginPassword(e.target.value)}
            />
            <button type="submit" className="btn btn-primary btn-block" disabled={loginBusy}>
              Kirish →
            </button>
            <p className="auth-error">{loginError}</p>
          </form>
        </div>
        <p className="auth-note">Hisob olish uchun ta'minotchi bilan bog'laning</p>
      </div>
    </div>
  );
}
