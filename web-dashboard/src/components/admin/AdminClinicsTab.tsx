import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { api, ApiError } from '../../api/client';
import type { AdminClinic, EffectiveStatus, Payment, Plan, SubscriptionStatus } from '../../api/types';
import { PlusIcon } from '../Icons';

const STATUS_LABEL: Record<EffectiveStatus, string> = {
  trial: 'Sinov',
  active: 'Faol',
  suspended: "To'xtatilgan",
  overdue: "Muddat o'tgan",
};

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function fmtMoney(amount: number | null, currency: string): string {
  if (amount === null) return '—';
  const label = currency === 'UZS' ? "so'm" : currency;
  return `${amount.toLocaleString('ru-RU')} ${label}`;
}

function AddAdminModal({ clinic, onClose }: { clinic: AdminClinic; onClose: () => void }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const created = await api.createClinicAdmin(clinic.id, { email, password, name });
      setSuccess(`${created.email} admin sifatida qo'shildi.`);
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setError("Bu email allaqachon ro'yxatdan o'tgan.");
      } else {
        setError(err instanceof ApiError ? err.message : 'Server bilan aloqa xato');
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal glass" onClick={(e) => e.stopPropagation()}>
        <h3>Admin qo'shish</h3>
        <p className="modal-sub">{clinic.name} klinikasi uchun yangi admin hisobi</p>
        {success ? (
          <>
            <p className="modal-success">{success}</p>
            <div className="modal-actions">
              <button className="btn btn-primary" onClick={onClose} type="button">
                Yopish
              </button>
            </div>
          </>
        ) : (
          <form className="auth-form" onSubmit={handleSubmit}>
            <label htmlFor="adm-name">Ism</label>
            <input id="adm-name" type="text" required placeholder="Masalan: Dilnoza Karimova" value={name} onChange={(e) => setName(e.target.value)} />
            <label htmlFor="adm-email">Email</label>
            <input id="adm-email" type="email" required autoComplete="off" placeholder="admin@klinika.uz" value={email} onChange={(e) => setEmail(e.target.value)} />
            <label htmlFor="adm-password">Parol</label>
            <input id="adm-password" type="password" required autoComplete="new-password" placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} />
            <div className="modal-actions">
              <button className="btn btn-ghost" onClick={onClose} type="button">
                Bekor qilish
              </button>
              <button className="btn btn-primary" type="submit" disabled={busy}>
                Qo'shish
              </button>
            </div>
            <p className="form-error">{error}</p>
          </form>
        )}
      </div>
    </div>
  );
}

function PaymentModal({ clinic, onClose, onSaved }: { clinic: AdminClinic; onClose: () => void; onSaved: () => void }) {
  const perPeriod = clinic.billing.effective_price ?? 0;
  const [amount, setAmount] = useState(perPeriod ? String(perPeriod) : '');
  const [months, setMonths] = useState('1');
  const [note, setNote] = useState('');

  // Keep the suggested total in step with the period count (price × months) so a
  // multi-month payment doesn't record just one period's price; still fully editable.
  function changeMonths(value: string) {
    setMonths(value);
    const n = Number(value);
    if (perPeriod && n >= 1) setAmount(String(perPeriod * n));
  }
  const [history, setHistory] = useState<Payment[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function loadHistory() {
    try {
      setHistory(await api.getClinicPayments(clinic.id));
    } catch {
      // history is non-critical; the form still works
    }
  }

  useEffect(() => {
    loadHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await api.recordPayment(clinic.id, {
        amount: Number(amount),
        period_months: Number(months) || 1,
        note: note || undefined,
      });
      setNote('');
      await loadHistory();
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Server bilan aloqa xato');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal glass" onClick={(e) => e.stopPropagation()}>
        <h3>To'lov — {clinic.name}</h3>
        <p className="modal-sub">
          To'langan sana: <strong>{fmtDate(clinic.billing.paid_until)}</strong> · Holat:{' '}
          {STATUS_LABEL[clinic.billing.effective_status]}
        </p>
        <form className="auth-form" onSubmit={handleSubmit}>
          <label htmlFor="pay-amount">Summa (so'm)</label>
          <input id="pay-amount" type="number" min={0} required value={amount} onChange={(e) => setAmount(e.target.value)} />
          <label htmlFor="pay-months">Necha oyga</label>
          <input id="pay-months" type="number" min={1} max={60} required value={months} onChange={(e) => changeMonths(e.target.value)} />
          <label htmlFor="pay-note">Izoh (ixtiyoriy)</label>
          <input id="pay-note" type="text" placeholder="masalan: naqd, 3 oylik" value={note} onChange={(e) => setNote(e.target.value)} />
          <div className="modal-actions">
            <button className="btn btn-ghost" onClick={onClose} type="button">
              Yopish
            </button>
            <button className="btn btn-primary" type="submit" disabled={busy}>
              To'lovni qayd etish
            </button>
          </div>
          <p className="form-error">{error}</p>
        </form>

        {history.length > 0 && (
          <table className="pay-history">
            <thead>
              <tr>
                <th>Sana</th>
                <th>Summa</th>
                <th>Davr</th>
                <th>Kim</th>
                <th>Izoh</th>
              </tr>
            </thead>
            <tbody>
              {history.map((p) => (
                <tr key={p.id}>
                  <td>{fmtDate(p.paid_at)}</td>
                  <td>{fmtMoney(p.amount, clinic.billing.currency)}</td>
                  <td>{p.period_months} oy</td>
                  <td>{p.recorded_by || '—'}</td>
                  <td>{p.note || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

export function AdminClinicsTab() {
  const [clinics, setClinics] = useState<AdminClinic[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [newName, setNewName] = useState('');
  const [createError, setCreateError] = useState('');
  const [creating, setCreating] = useState(false);

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState('');
  const [editStatus, setEditStatus] = useState<SubscriptionStatus>('trial');
  const [editPlan, setEditPlan] = useState<string>(''); // '' == no plan
  const [editPrice, setEditPrice] = useState<string>(''); // '' == use plan price
  const [editError, setEditError] = useState('');
  const [editBusy, setEditBusy] = useState(false);

  const [adminModal, setAdminModal] = useState<AdminClinic | null>(null);
  const [payModal, setPayModal] = useState<AdminClinic | null>(null);
  const [loadError, setLoadError] = useState('');

  async function load() {
    try {
      const [c, p] = await Promise.all([api.getAdminClinics(), api.getPlans()]);
      setClinics(c);
      setPlans(p);
      setLoadError('');
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : "Klinikalarni yuklab bo'lmadi");
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setCreateError('');
    setCreating(true);
    try {
      await api.createAdminClinic({ name: newName });
      setNewName('');
      await load();
    } catch (err) {
      setCreateError(err instanceof ApiError ? err.message : 'Server bilan aloqa xato');
    } finally {
      setCreating(false);
    }
  }

  function startEdit(clinic: AdminClinic) {
    setEditingId(clinic.id);
    setEditName(clinic.name);
    setEditStatus(clinic.subscription_status);
    setEditPlan(clinic.billing.plan_id === null ? '' : String(clinic.billing.plan_id));
    setEditPrice(clinic.billing.custom_price_amount === null ? '' : String(clinic.billing.custom_price_amount));
    setEditError('');
  }

  async function saveEdit(clinicId: number) {
    setEditError('');
    setEditBusy(true);
    try {
      await api.updateAdminClinic(clinicId, {
        name: editName,
        subscription_status: editStatus,
        // plan: empty select clears the plan, otherwise assign it
        ...(editPlan === '' ? { clear_plan: true } : { plan_id: Number(editPlan) }),
        // custom price: empty input clears the override, otherwise set it
        ...(editPrice === '' ? { clear_custom_price: true } : { custom_price_amount: Number(editPrice) }),
      });
      setEditingId(null);
      load();
    } catch (err) {
      setEditError(err instanceof ApiError ? err.message : 'Server bilan aloqa xato');
    } finally {
      setEditBusy(false);
    }
  }

  return (
    <section className="tab-panel">
      <div className="section-head">
        <h2>Klinikalar</h2>
      </div>

      <div className="panel-card glass">
        <h3>
          <PlusIcon /> Yangi klinika qo'shish
        </h3>
        <form className="inline-form" onSubmit={handleCreate}>
          <input type="text" placeholder="Klinika nomi (masalan Shifo klinikasi)" required value={newName} onChange={(e) => setNewName(e.target.value)} />
          <button type="submit" className="btn btn-primary" disabled={creating}>
            {creating ? '...' : "Qo'shish"}
          </button>
        </form>
        {createError && <p className="form-error">{createError}</p>}
      </div>

      {loadError && <p className="form-error">{loadError}</p>}

      <div className="table-wrap glass">
        <table>
          <thead>
            <tr>
              <th>Nomi</th>
              <th>Obuna / To'lov</th>
              <th>Tarif / Narx</th>
              <th>Xodim</th>
              <th>Qurilma</th>
              <th>Xona</th>
              <th>Faol</th>
              <th>Amallar</th>
            </tr>
          </thead>
          <tbody>
            {clinics.map((c) =>
              editingId === c.id ? (
                <tr key={c.id}>
                  <td>
                    <input type="text" className="table-input" value={editName} onChange={(e) => setEditName(e.target.value)} />
                  </td>
                  <td>
                    <select className="bind-select" value={editStatus} onChange={(e) => setEditStatus(e.target.value as SubscriptionStatus)}>
                      <option value="trial">Sinov</option>
                      <option value="active">Faol</option>
                      <option value="suspended">To'xtatilgan</option>
                    </select>
                  </td>
                  <td>
                    <select className="bind-select" value={editPlan} onChange={(e) => setEditPlan(e.target.value)}>
                      <option value="">— Tarifsiz —</option>
                      {plans
                        .filter((p) => p.is_active || String(p.id) === editPlan)
                        .map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                            {!p.is_active ? ' (arxiv)' : ''}
                          </option>
                        ))}
                    </select>
                    <input
                      type="number"
                      min={0}
                      className="table-input"
                      placeholder="Alohida narx (ixtiyoriy)"
                      value={editPrice}
                      onChange={(e) => setEditPrice(e.target.value)}
                    />
                  </td>
                  <td>{c.staff_count}</td>
                  <td>{c.device_count}</td>
                  <td>{c.room_count}</td>
                  <td>{c.active_calls}</td>
                  <td>
                    <div className="row-actions">
                      <button className="btn btn-primary btn-sm" onClick={() => saveEdit(c.id)} disabled={editBusy} type="button">
                        Saqlash
                      </button>
                      <button className="btn btn-ghost btn-sm" onClick={() => setEditingId(null)} type="button">
                        Bekor
                      </button>
                    </div>
                    {editError && <p className="form-error">{editError}</p>}
                  </td>
                </tr>
              ) : (
                <tr key={c.id}>
                  <td>{c.name}</td>
                  <td>
                    <div className="billing-cell">
                      <span className={`sub-pill ${c.billing.effective_status}`}>
                        {STATUS_LABEL[c.billing.effective_status]}
                      </span>
                      <span className="muted">To'langan: {fmtDate(c.billing.paid_until)}</span>
                    </div>
                  </td>
                  <td>
                    <div className="billing-cell">
                      <span className="price">{fmtMoney(c.billing.effective_price, c.billing.currency)}</span>
                      <span className="muted">
                        {c.billing.plan_name ?? 'Tarifsiz'}
                        {c.billing.custom_price_amount !== null && <span className="price-override"> · alohida narx</span>}
                      </span>
                    </div>
                  </td>
                  <td>{c.staff_count}</td>
                  <td>
                    {c.device_count}
                    {c.billing.max_devices !== null && <span className="muted"> / {c.billing.max_devices}</span>}
                  </td>
                  <td>{c.room_count}</td>
                  <td>{c.active_calls}</td>
                  <td>
                    <div className="row-actions">
                      <button className="btn btn-ghost btn-sm" onClick={() => startEdit(c)} type="button">
                        Tahrirlash
                      </button>
                      <button className="btn btn-ghost btn-sm" onClick={() => setPayModal(c)} type="button">
                        To'lov
                      </button>
                      <button className="btn btn-ghost btn-sm" onClick={() => setAdminModal(c)} type="button">
                        Admin
                      </button>
                    </div>
                  </td>
                </tr>
              )
            )}
          </tbody>
        </table>
      </div>

      {adminModal && <AddAdminModal clinic={adminModal} onClose={() => setAdminModal(null)} />}
      {payModal && (
        <PaymentModal
          clinic={payModal}
          onClose={() => setPayModal(null)}
          onSaved={() => {
            load();
            // refresh the modal's clinic snapshot (paid_until/status) on next open
            setPayModal(null);
          }}
        />
      )}
    </section>
  );
}
