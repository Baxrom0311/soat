import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { api, ApiError } from '../../api/client';
import type {
  AdminClinic,
  BillingPeriodMonths,
  EffectiveStatus,
  Payment,
  Plan,
  Staff,
  SubscriptionStatus,
  SuspensionReason,
} from '../../api/types';
import { PlusIcon } from '../Icons';

const STATUS_LABEL: Record<EffectiveStatus, string> = {
  trial: 'Sinov',
  active: 'Faol',
  suspended: "To'xtatilgan",
  grace: "To'lov kutilmoqda",
  overdue: "Muddat o'tgan",
};

/**
 * Why a clinic is suspended, and it matters operationally: recording a payment lifts a
 * `payment_lapse` suspension by itself, but NEVER a `manual` one — that one needs a
 * human to change the status back. Showing the two identically would make the vendor
 * take a payment and then wonder why the clinic is still locked out.
 */
const SUSPENSION_LABEL: Record<SuspensionReason, string> = {
  payment_lapse: "to'lov kechikkani uchun (to'lov qilinsa avtomat ochiladi)",
  manual: "qo'lda to'xtatilgan (to'lov o'zi ochmaydi)",
};

export function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function fmtMoney(amount: number | null, currency: string): string {
  if (amount === null) return '—';
  const label = currency === 'UZS' ? "so'm" : currency;
  return `${amount.toLocaleString('ru-RU')} ${label}`;
}

function periodLabel(months: number): string {
  if (months === 1) return 'oylik';
  if (months === 12) return 'yillik';
  return `${months} oy`;
}

/** The sign carries the whole meaning, so never render days_until_expiry raw. */
function daysLabel(days: number | null): string {
  if (days === null) return '—';
  if (days < 0) return `${Math.abs(days)} kun kechikdi`;
  if (days === 0) return 'bugun tugaydi';
  return `${days} kun qoldi`;
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
  const expected = clinic.billing.effective_price;
  // Prefilled with what the clinic actually owes for its configured period, so the
  // normal case is "open, confirm, done" with nothing to type.
  const [amount, setAmount] = useState(expected === null ? '' : String(expected));
  // '' == send no period_months at all, i.e. let the server use the clinic's own
  // configured period. An explicit value is a negotiated exception, not the norm.
  const [months, setMonths] = useState('');
  const [note, setNote] = useState('');
  const [history, setHistory] = useState<Payment[]>([]);
  const [error, setError] = useState('');
  // Set when the server rejects the amount with 422: holds its (Uzbek) message, which
  // names the figure it expected. Confirming re-sends the SAME amount with
  // allow_amount_mismatch, which is the only way a part payment gets recorded.
  const [mismatch, setMismatch] = useState('');
  const [busy, setBusy] = useState(false);
  // A retried/duplicated submit of the SAME attempt (network retry, or a double-click
  // that slips past the busy-disabled button) must reuse this key so the backend can
  // dedupe it; a genuinely NEW payment after a successful submit gets a fresh one.
  // The mismatch re-send deliberately reuses it too: it is the same payment, retried
  // with permission, not a second one.
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());

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

  async function submit(allowMismatch: boolean) {
    setError('');
    setBusy(true);
    try {
      await api.recordPayment(clinic.id, {
        amount: Number(amount),
        ...(months === '' ? {} : { period_months: Number(months) }),
        note: note || undefined,
        idempotency_key: idempotencyKey,
        ...(allowMismatch ? { allow_amount_mismatch: true } : {}),
      });
      setNote('');
      setMismatch('');
      setIdempotencyKey(crypto.randomUUID());
      await loadHistory();
      onSaved();
    } catch (err) {
      if (err instanceof ApiError && err.status === 422) {
        // The server's own message names the expected figure — show it verbatim rather
        // than paraphrasing a number we'd have to recompute client-side.
        setMismatch(err.message);
      } else {
        setError(err instanceof ApiError ? err.message : 'Server bilan aloqa xato');
      }
    } finally {
      setBusy(false);
    }
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    submit(false);
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal glass" onClick={(e) => e.stopPropagation()}>
        <h3>To'lov — {clinic.name}</h3>
        <p className="modal-sub">
          To'langan sana: <strong>{fmtDate(clinic.billing.paid_until)}</strong> · Holat:{' '}
          {STATUS_LABEL[clinic.billing.effective_status]} · Kutilgan summa:{' '}
          <strong>{fmtMoney(expected, clinic.billing.currency)}</strong> (
          {periodLabel(clinic.billing.billing_period_months)})
        </p>
        <form className="auth-form" onSubmit={handleSubmit}>
          <label htmlFor="pay-amount">Summa (so'm)</label>
          <input
            id="pay-amount"
            type="number"
            min={0}
            required
            value={amount}
            onChange={(e) => {
              setAmount(e.target.value);
              // Editing the figure invalidates any affirmation given for the old one.
              setMismatch('');
            }}
          />
          <label htmlFor="pay-months">Davr</label>
          <select id="pay-months" value={months} onChange={(e) => setMonths(e.target.value)}>
            <option value="">
              Klinika sozlamasi bo'yicha ({periodLabel(clinic.billing.billing_period_months)})
            </option>
            <option value="1">1 oy</option>
            <option value="12">12 oy (yillik)</option>
          </select>
          <label htmlFor="pay-note">Izoh (ixtiyoriy)</label>
          <input id="pay-note" type="text" placeholder="masalan: naqd, 3 oylik" value={note} onChange={(e) => setNote(e.target.value)} />

          {mismatch && (
            <div className="mismatch-box">
              <p className="mismatch-box__msg">{mismatch}</p>
              <p className="mismatch-box__ask">
                Shunga qaramay <strong>{fmtMoney(Number(amount), clinic.billing.currency)}</strong>{' '}
                summasi qayd etilsinmi? (qismiy yoki kelishilgan to'lov)
              </p>
              <div className="row-actions">
                <button
                  className="btn btn-danger btn-sm"
                  type="button"
                  disabled={busy}
                  onClick={() => submit(true)}
                >
                  Ha, shu summani qayd et
                </button>
                <button
                  className="btn btn-ghost btn-sm"
                  type="button"
                  onClick={() => {
                    setMismatch('');
                    if (expected !== null) setAmount(String(expected));
                  }}
                >
                  Yo'q, kutilgan summaga qaytar
                </button>
              </div>
            </div>
          )}

          <div className="modal-actions">
            <button className="btn btn-ghost" onClick={onClose} type="button">
              Yopish
            </button>
            <button className="btn btn-primary" type="submit" disabled={busy || mismatch !== ''}>
              To'lovni qayd etish
            </button>
          </div>
          <p className="form-error">{error}</p>
        </form>

        {history.length > 0 && (
          <div className="pay-history-wrap">
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
                    <td data-label="Sana">{fmtDate(p.paid_at)}</td>
                    <td data-label="Summa">{fmtMoney(p.amount, clinic.billing.currency)}</td>
                    <td data-label="Davr">{p.period_months} oy</td>
                    <td data-label="Kim">{p.recorded_by || '—'}</td>
                    <td data-label="Izoh">{p.note || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function ClinicStaffModal({ clinic, onClose }: { clinic: AdminClinic; onClose: () => void }) {
  const [staff, setStaff] = useState<Staff[]>([]);
  const [loadError, setLoadError] = useState('');
  const [resetting, setResetting] = useState<number | null>(null);
  const [revealed, setRevealed] = useState<{ staffId: number; password: string } | null>(null);
  const [error, setError] = useState('');

  async function load() {
    setLoadError('');
    try {
      setStaff(await api.getClinicStaff(clinic.id));
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : "Xodimlarni yuklab bo'lmadi");
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function resetPassword(staffId: number) {
    if (!window.confirm("Bu xodimning paroli yangi, tasodifiy parolga almashtiriladi. Davom etilsinmi?")) return;
    setError('');
    setResetting(staffId);
    try {
      const { new_password } = await api.resetStaffPassword(clinic.id, staffId);
      setRevealed({ staffId, password: new_password });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Server bilan aloqa xato');
    } finally {
      setResetting(null);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal glass" onClick={(e) => e.stopPropagation()}>
        <h3>Xodimlar — {clinic.name}</h3>
        <p className="modal-sub">
          Xodim parolini unutgan bo'lsa, shu yerdan yangi (tasodifiy) parol generatsiya qilib, unga
          yetkazing — u keyin o'zi "Parol" tugmasi orqali o'zgartirib olishi mumkin.
        </p>
        {error && <p className="form-error">{error}</p>}
        {loadError ? (
          <p className="form-error">{loadError}</p>
        ) : (
          <div className="pay-history-wrap">
            <table className="pay-history">
              <thead>
                <tr>
                  <th>Ism</th>
                  <th>Email</th>
                  <th>Rol</th>
                  <th>Amal</th>
                </tr>
              </thead>
              <tbody>
                {staff.map((s) => (
                  <tr key={s.id}>
                    <td data-label="Ism">{s.name}</td>
                    <td data-label="Email">{s.email}</td>
                    <td data-label="Rol">{s.role}</td>
                    <td data-label="Amal">
                      <button
                        className="btn btn-ghost btn-sm"
                        type="button"
                        disabled={resetting === s.id}
                        onClick={() => resetPassword(s.id)}
                      >
                        Parolni tiklash
                      </button>
                      {revealed && revealed.staffId === s.id && (
                        <p className="modal-success">
                          Yangi parol: <code className="key-code">{revealed.password}</code>
                        </p>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="modal-actions">
          <button className="btn btn-primary" onClick={onClose} type="button">
            Yopish
          </button>
        </div>
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
  const [editPeriod, setEditPeriod] = useState<BillingPeriodMonths>(1);
  const [editEnforcement, setEditEnforcement] = useState(true);
  const [editDiscountPercent, setEditDiscountPercent] = useState<string>('');
  const [editDiscountMonths, setEditDiscountMonths] = useState<string>('');
  const [editError, setEditError] = useState('');
  const [editBusy, setEditBusy] = useState(false);

  const [adminModal, setAdminModal] = useState<AdminClinic | null>(null);
  const [payModal, setPayModal] = useState<AdminClinic | null>(null);
  const [staffModal, setStaffModal] = useState<AdminClinic | null>(null);
  const [loadError, setLoadError] = useState('');
  const [rowError, setRowError] = useState('');
  const [rowBusyId, setRowBusyId] = useState<number | null>(null);

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
    setEditPeriod(clinic.billing.billing_period_months === 12 ? 12 : 1);
    setEditEnforcement(clinic.billing.enforcement_enabled);
    // Left blank on purpose: an existing discount is edited by typing a NEW one (which
    // restarts it) or removed with "Chegirmani olib tashlash". Prefilling would make
    // every unrelated save silently restart the discount clock.
    setEditDiscountPercent('');
    setEditDiscountMonths('');
    setEditError('');
  }

  async function saveEdit(clinicId: number) {
    setEditError('');
    // A discount is one deal: percent and months must be sent together or not at all.
    const hasPercent = editDiscountPercent.trim() !== '';
    const hasMonths = editDiscountMonths.trim() !== '';
    if (hasPercent !== hasMonths) {
      setEditError("Chegirma uchun foiz va muddat (oy) ikkisi ham kiritilishi kerak");
      return;
    }
    const percent = Number(editDiscountPercent);
    const dMonths = Number(editDiscountMonths);
    if (hasPercent && (Number.isNaN(percent) || percent < 1 || percent > 100)) {
      setEditError('Chegirma foizi 1 dan 100 gacha bo’lishi kerak');
      return;
    }
    if (hasMonths && (Number.isNaN(dMonths) || dMonths < 1)) {
      setEditError("Chegirma muddati kamida 1 oy bo’lishi kerak");
      return;
    }
    setEditBusy(true);
    try {
      await api.updateAdminClinic(clinicId, {
        name: editName,
        subscription_status: editStatus,
        // plan: empty select clears the plan, otherwise assign it
        ...(editPlan === '' ? { clear_plan: true } : { plan_id: Number(editPlan) }),
        // custom price: empty input clears the override, otherwise set it
        ...(editPrice === '' ? { clear_custom_price: true } : { custom_price_amount: Number(editPrice) }),
        billing_period_months: editPeriod,
        enforcement_enabled: editEnforcement,
        ...(hasPercent ? { discount_percent: percent, discount_months: dMonths } : {}),
      });
      setEditingId(null);
      load();
    } catch (err) {
      setEditError(err instanceof ApiError ? err.message : 'Server bilan aloqa xato');
    } finally {
      setEditBusy(false);
    }
  }

  async function clearDiscount(clinic: AdminClinic) {
    if (!window.confirm(`"${clinic.name}" uchun chegirma olib tashlansinmi?`)) return;
    setRowError('');
    setRowBusyId(clinic.id);
    try {
      await api.updateAdminClinic(clinic.id, { clear_discount: true });
      await load();
    } catch (err) {
      setRowError(err instanceof ApiError ? err.message : 'Server bilan aloqa xato');
    } finally {
      setRowBusyId(null);
    }
  }

  async function startBilling(clinic: AdminClinic) {
    if (
      !window.confirm(
        `"${clinic.name}" sinov muddati tugatilib, obuna faollashtiriladi va to'lov muddati boshlanadi. Davom etilsinmi?`
      )
    )
      return;
    setRowError('');
    setRowBusyId(clinic.id);
    try {
      await api.startBilling(clinic.id);
      await load();
    } catch (err) {
      setRowError(
        err instanceof ApiError && err.status === 409
          ? "Bu klinika sinov muddatida emas — to'lov allaqachon boshlangan."
          : err instanceof ApiError
            ? err.message
            : 'Server bilan aloqa xato'
      );
    } finally {
      setRowBusyId(null);
    }
  }

  return (
    <section className="tab-panel">
      <header className="page-header-row">
        <div>
          <h1 className="page-header-title">Klinikalar boshqaruvi</h1>
          <p className="page-header-desc">Tizimdagi barcha klinikalar, ularning obuna tariflari va to'lovlari.</p>
        </div>
      </header>

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
      {rowError && <p className="form-error">{rowError}</p>}

      <div className="table-wrap glass">
        <table>
          <thead>
            <tr>
              <th>Nomi</th>
              <th>Obuna</th>
              <th>Muddat</th>
              <th>Tarif / Narx</th>
              <th>Qurilma</th>
              <th>Xodim</th>
              <th>Xona</th>
              <th>Faol</th>
              <th>Amallar</th>
            </tr>
          </thead>
          <tbody>
            {clinics.map((c) =>
              editingId === c.id ? (
                <tr key={c.id}>
                  <td data-label="Nomi">
                    <input type="text" className="table-input" value={editName} onChange={(e) => setEditName(e.target.value)} />
                  </td>
                  <td data-label="Obuna / To'lov sozlamalari" colSpan={7}>
                    <div className="edit-grid">
                      <label className="edit-field">
                        <span className="edit-field__label">Holat</span>
                        <select className="bind-select" value={editStatus} onChange={(e) => setEditStatus(e.target.value as SubscriptionStatus)}>
                          <option value="trial">Sinov</option>
                          <option value="active">Faol</option>
                          <option value="suspended">To'xtatilgan</option>
                        </select>
                      </label>

                      <label className="edit-field">
                        <span className="edit-field__label">Tarif</span>
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
                      </label>

                      <label className="edit-field">
                        <span className="edit-field__label">To'lov davri</span>
                        <select
                          className="bind-select"
                          value={editPeriod}
                          onChange={(e) => setEditPeriod(Number(e.target.value) === 12 ? 12 : 1)}
                        >
                          <option value={1}>Oylik (1 oy)</option>
                          <option value={12}>Yillik (12 oy)</option>
                        </select>
                      </label>

                      <label className="edit-field">
                        <span className="edit-field__label">Alohida narx</span>
                        <input
                          type="number"
                          min={0}
                          className="table-input"
                          placeholder="bo'sh = tarif narxi"
                          value={editPrice}
                          onChange={(e) => setEditPrice(e.target.value)}
                        />
                      </label>

                      <label className="edit-field">
                        <span className="edit-field__label">Chegirma (%)</span>
                        <input
                          type="number"
                          min={1}
                          max={100}
                          className="table-input"
                          placeholder="1—100"
                          value={editDiscountPercent}
                          onChange={(e) => setEditDiscountPercent(e.target.value)}
                        />
                      </label>

                      <label className="edit-field">
                        <span className="edit-field__label">Chegirma muddati (oy)</span>
                        <input
                          type="number"
                          min={1}
                          className="table-input"
                          placeholder="masalan 3"
                          value={editDiscountMonths}
                          onChange={(e) => setEditDiscountMonths(e.target.value)}
                        />
                      </label>

                      <label className="edit-field edit-field--check">
                        <input
                          type="checkbox"
                          checked={editEnforcement}
                          onChange={(e) => setEditEnforcement(e.target.checked)}
                        />
                        <span className="edit-field__label">
                          To'lov nazorati yoqilgan
                          <span className="edit-field__hint">
                            O'chirilsa, muddat o'tsa ham panel bloklanmaydi (qo'lda
                            to'xtatish baribir ishlaydi).
                          </span>
                        </span>
                      </label>
                    </div>
                    <p className="hint">
                      Chegirma foizi va muddati birga yuboriladi va yangi kiritilsa muddat
                      boshidan sanaladi. Mavjud chegirmani olib tashlash uchun jadvaldagi
                      "Chegirmani olib tashlash" tugmasidan foydalaning.
                    </p>
                  </td>
                  <td data-label="Amallar">
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
                  <td data-label="Nomi">{c.name}</td>
                  <td data-label="Obuna">
                    <div className="billing-cell">
                      <span className={`sub-pill ${c.billing.effective_status}`}>
                        {STATUS_LABEL[c.billing.effective_status]}
                      </span>
                      {c.billing.effective_status === 'suspended' && (
                        <span className="muted">
                          {c.billing.suspension_reason
                            ? SUSPENSION_LABEL[c.billing.suspension_reason]
                            : 'sababi belgilanmagan'}
                        </span>
                      )}
                      {!c.billing.enforcement_enabled && (
                        <span className="sub-pill off">Nazorat o'chirilgan</span>
                      )}
                    </div>
                  </td>
                  <td data-label="Muddat">
                    <div className="billing-cell">
                      <span>To'langan: {fmtDate(c.billing.paid_until)}</span>
                      <span
                        className={
                          c.billing.days_until_expiry !== null && c.billing.days_until_expiry <= 7
                            ? 'days-left days-left--urgent'
                            : 'days-left'
                        }
                      >
                        {daysLabel(c.billing.days_until_expiry)}
                      </span>
                      <span className="muted">Bloklanadi: {fmtDate(c.billing.blocked_at)}</span>
                    </div>
                  </td>
                  <td data-label="Tarif / Narx">
                    <div className="billing-cell">
                      <span className="price">{fmtMoney(c.billing.effective_price, c.billing.currency)}</span>
                      <span className="muted">
                        {c.billing.plan_name ?? 'Tarifsiz'} · {periodLabel(c.billing.billing_period_months)}
                        {c.billing.custom_price_amount !== null && <span className="price-override"> · alohida narx</span>}
                      </span>
                      {c.billing.discount_percent !== null && c.billing.discount_percent > 0 && (
                        <span className="price-override">
                          −{c.billing.discount_percent}%
                          {c.billing.discount_ends_at
                            ? ` · ${fmtDate(c.billing.discount_ends_at)} gacha`
                            : ''}
                          {c.billing.list_price !== null
                            ? ` · chegirmasiz ${fmtMoney(c.billing.list_price, c.billing.currency)}`
                            : ''}
                        </span>
                      )}
                    </div>
                  </td>
                  <td data-label="Qurilma">{c.billing.device_count}</td>
                  <td data-label="Xodim">{c.staff_count}</td>
                  <td data-label="Xona">{c.room_count}</td>
                  <td data-label="Faol">{c.active_calls}</td>
                  <td data-label="Amallar">
                    <div className="row-actions">
                      <button className="btn btn-ghost btn-sm" onClick={() => startEdit(c)} type="button">
                        Tahrirlash
                      </button>
                      {c.billing.effective_status === 'trial' && (
                        <button
                          className="btn btn-primary btn-sm"
                          onClick={() => startBilling(c)}
                          disabled={rowBusyId === c.id}
                          type="button"
                          title="Sinovni tugatib, to'lov muddatini boshlash"
                        >
                          Sinovni tugatish
                        </button>
                      )}
                      <button className="btn btn-ghost btn-sm" onClick={() => setPayModal(c)} type="button">
                        To'lov
                      </button>
                      {c.billing.discount_percent !== null && c.billing.discount_percent > 0 && (
                        <button
                          className="btn btn-ghost btn-sm"
                          onClick={() => clearDiscount(c)}
                          disabled={rowBusyId === c.id}
                          type="button"
                        >
                          Chegirmani olib tashlash
                        </button>
                      )}
                      <button className="btn btn-ghost btn-sm" onClick={() => setAdminModal(c)} type="button">
                        Admin
                      </button>
                      <button className="btn btn-ghost btn-sm" onClick={() => setStaffModal(c)} type="button">
                        Xodimlar
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
      {staffModal && <ClinicStaffModal clinic={staffModal} onClose={() => setStaffModal(null)} />}
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
