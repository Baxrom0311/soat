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

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editRole, setEditRole] = useState<StaffRole>('nurse');
  const [editPassword, setEditPassword] = useState('');
  const [editError, setEditError] = useState('');
  const [editBusy, setEditBusy] = useState(false);
  const [rowError, setRowError] = useState('');

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

  function startEdit(s: Staff) {
    setEditingId(s.id);
    setEditName(s.name);
    setEditEmail(s.email);
    setEditRole(s.role);
    setEditPassword('');
    setEditError('');
  }

  async function saveEdit(staffId: number) {
    setEditError('');
    setEditBusy(true);
    try {
      await api.updateStaff(staffId, {
        name: editName,
        email: editEmail,
        role: editRole,
        ...(editPassword ? { password: editPassword } : {}),
      });
      setEditingId(null);
      await load();
    } catch (err) {
      setEditError(err instanceof ApiError ? err.message : 'Server bilan aloqa xato');
    } finally {
      setEditBusy(false);
    }
  }

  async function remove(s: Staff) {
    setRowError('');
    if (!window.confirm(`"${s.name}" (${s.email}) o'chirilsinmi? Bu amalni ortga qaytarib bo'lmaydi.`)) return;
    try {
      await api.deleteStaff(s.id);
      await load();
    } catch (err) {
      setRowError(err instanceof ApiError ? err.message : 'Server bilan aloqa xato');
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

      {rowError && <p className="form-error">{rowError}</p>}

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
                {isAdmin && <th>Amallar</th>}
              </tr>
            </thead>
            <tbody>
              {staff.map((s) =>
                editingId === s.id ? (
                  <tr key={s.id}>
                    <td data-label="Ism">
                      <input
                        type="text"
                        className="table-input"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                      />
                    </td>
                    <td data-label="Email">
                      <input
                        type="email"
                        className="table-input"
                        value={editEmail}
                        onChange={(e) => setEditEmail(e.target.value)}
                      />
                    </td>
                    <td data-label="Rol">
                      <select
                        className="bind-select"
                        value={editRole}
                        onChange={(e) => setEditRole(e.target.value as StaffRole)}
                      >
                        <option value="nurse">Hamshira</option>
                        <option value="admin">Admin</option>
                      </select>
                    </td>
                    <td data-label="Amallar">
                      <input
                        type="password"
                        className="table-input"
                        placeholder="Yangi parol (ixtiyoriy)"
                        value={editPassword}
                        onChange={(e) => setEditPassword(e.target.value)}
                      />
                      <div className="row-actions">
                        <button
                          className="btn btn-primary btn-sm"
                          onClick={() => saveEdit(s.id)}
                          disabled={editBusy}
                          type="button"
                        >
                          Saqlash
                        </button>
                        <button
                          className="btn btn-ghost btn-sm"
                          onClick={() => setEditingId(null)}
                          type="button"
                        >
                          Bekor
                        </button>
                      </div>
                      {editError && <p className="form-error">{editError}</p>}
                    </td>
                  </tr>
                ) : (
                  <tr key={s.id}>
                    <td data-label="Ism">{s.name}</td>
                    <td data-label="Email">{s.email}</td>
                    <td data-label="Rol">
                      <span className="role-pill">{s.role}</span>
                    </td>
                    {isAdmin && (
                      <td data-label="Amallar">
                        <div className="row-actions">
                          <button className="btn btn-ghost btn-sm" onClick={() => startEdit(s)} type="button">
                            Tahrirlash
                          </button>
                          <button className="btn btn-ghost btn-sm" onClick={() => remove(s)} type="button">
                            O'chirish
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                )
              )}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
