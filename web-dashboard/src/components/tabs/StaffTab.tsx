import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { api, ApiError } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import type { Staff, StaffRole } from '../../api/types';
import { PlusIcon } from '../Icons';

export function StaffTab() {
  const { session } = useAuth();
  const isAdmin = session?.role === 'admin';

  const [staff, setStaff] = useState<Staff[]>([]);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<StaffRole>('nurse');
  const [error, setError] = useState('');
  const [loadError, setLoadError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function load() {
    setLoadError('');
    try {
      setStaff(await api.getStaff());
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : "Xodimlarni yuklab bo'lmadi");
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await api.createStaff({ name, email, password, role });
      setName('');
      setEmail('');
      setPassword('');
      setRole('nurse');
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Server bilan aloqa xato');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="tab-panel">
      <div className="section-head">
        <h2>Xodimlar</h2>
      </div>

      {isAdmin && (
        <div className="panel-card glass">
          <h3>
            <PlusIcon /> Yangi xodim qo'shish (faqat admin)
          </h3>
          <form className="inline-form" onSubmit={handleSubmit}>
            <input type="text" placeholder="Ism" required value={name} onChange={(e) => setName(e.target.value)} />
            <input
              type="email"
              placeholder="Email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <input
              type="password"
              placeholder="Parol"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <select value={role} onChange={(e) => setRole(e.target.value as StaffRole)}>
              <option value="nurse">Hamshira</option>
              <option value="admin">Admin</option>
            </select>
            <button type="submit" className="btn btn-primary" disabled={submitting}>
              {submitting ? '...' : "Qo'shish"}
            </button>
          </form>
          {error && <p className="form-error">{error}</p>}
        </div>
      )}

      {loadError ? (
        <div className="form-error">
          {loadError}{' '}
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => load()}>
            Qayta urinish
          </button>
        </div>
      ) : (
        <div className="table-wrap glass">
          <table>
            <thead>
              <tr>
                <th>Ism</th>
                <th>Email</th>
                <th>Rol</th>
              </tr>
            </thead>
            <tbody>
              {staff.map((s) => (
                <tr key={s.id}>
                  <td>{s.name}</td>
                  <td>{s.email}</td>
                  <td>
                    <span className="role-pill">{s.role}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
