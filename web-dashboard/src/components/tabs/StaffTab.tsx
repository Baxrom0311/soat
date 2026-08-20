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

  async function load() {
    setStaff(await api.getStaff());
  }

  useEffect(() => {
    load();
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    try {
      await api.createStaff({ name, email, password, role });
      setName('');
      setEmail('');
      setPassword('');
      setRole('nurse');
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Server bilan aloqa xato');
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
            <button type="submit" className="btn btn-primary">
              Qo'shish
            </button>
          </form>
          <p className="form-error">{error}</p>
        </div>
      )}

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
    </section>
  );
}
