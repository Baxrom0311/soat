import { useState } from 'react';
import type { FormEvent } from 'react';
import { api, ApiError } from '../api/client';

export function ChangePasswordModal({ onClose }: { onClose: () => void }) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    if (newPassword !== confirmPassword) {
      setError("Yangi parollar mos kelmadi");
      return;
    }
    if (newPassword.length < 8) {
      setError("Yangi parol kamida 8 belgidan iborat bo'lishi kerak");
      return;
    }
    setBusy(true);
    try {
      await api.changePassword(currentPassword, newPassword);
      setSuccess(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Server bilan aloqa xato');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal glass" onClick={(e) => e.stopPropagation()}>
        <h3>Parolni o'zgartirish</h3>
        {success ? (
          <>
            <p className="modal-success">Parol muvaffaqiyatli o'zgartirildi.</p>
            <div className="modal-actions">
              <button className="btn btn-primary" onClick={onClose} type="button">
                Yopish
              </button>
            </div>
          </>
        ) : (
          <form className="auth-form" onSubmit={handleSubmit}>
            <label htmlFor="cp-current">Joriy parol</label>
            <input
              id="cp-current"
              type="password"
              required
              autoComplete="current-password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
            />
            <label htmlFor="cp-new">Yangi parol</label>
            <input
              id="cp-new"
              type="password"
              required
              autoComplete="new-password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
            />
            <label htmlFor="cp-confirm">Yangi parolni takrorlang</label>
            <input
              id="cp-confirm"
              type="password"
              required
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
            />
            <div className="modal-actions">
              <button className="btn btn-ghost" onClick={onClose} type="button">
                Bekor qilish
              </button>
              <button className="btn btn-primary" type="submit" disabled={busy}>
                {busy ? '...' : 'Saqlash'}
              </button>
            </div>
            {error && <p className="form-error">{error}</p>}
          </form>
        )}
      </div>
    </div>
  );
}
