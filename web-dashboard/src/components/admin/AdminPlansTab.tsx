import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { api, ApiError } from '../../api/client';
import type { Plan } from '../../api/types';
import { PlusIcon } from '../Icons';

function fmtMoney(amount: number, currency: string): string {
  const label = currency === 'UZS' ? "so'm" : currency;
  return `${amount.toLocaleString('ru-RU')} ${label}`;
}

/** The four amounts a plan carries, as strings while they live in inputs. */
type Amounts = {
  perDeviceMonthly: string;
  minMonthly: string;
  perDeviceAnnual: string;
  minAnnual: string;
};

const EMPTY_AMOUNTS: Amounts = {
  perDeviceMonthly: '',
  minMonthly: '',
  perDeviceAnnual: '',
  minAnnual: '',
};

function fromPlan(plan: Plan): Amounts {
  return {
    perDeviceMonthly: String(plan.price_per_device_monthly),
    minMonthly: String(plan.min_price_monthly),
    perDeviceAnnual: String(plan.price_per_device_annual),
    minAnnual: String(plan.min_price_annual),
  };
}

/**
 * Validates the four amounts together. Guards the Number('') === 0 footgun: a blank
 * per-device price must not silently make the plan free.
 */
function parseAmounts(a: Amounts): { ok: true; value: PlanAmounts } | { ok: false; error: string } {
  const perDeviceMonthly = Number(a.perDeviceMonthly);
  const perDeviceAnnual = Number(a.perDeviceAnnual);
  if (a.perDeviceMonthly.trim() === '' || Number.isNaN(perDeviceMonthly) || perDeviceMonthly < 0) {
    return { ok: false, error: "Oylik narxni to'g'ri kiriting (0 yoki undan katta)" };
  }
  if (a.perDeviceAnnual.trim() === '' || Number.isNaN(perDeviceAnnual) || perDeviceAnnual < 0) {
    return { ok: false, error: "Yillik narxni to'g'ri kiriting (0 yoki undan katta)" };
  }
  const minMonthly = a.minMonthly.trim() === '' ? 0 : Number(a.minMonthly);
  const minAnnual = a.minAnnual.trim() === '' ? 0 : Number(a.minAnnual);
  if (Number.isNaN(minMonthly) || minMonthly < 0 || Number.isNaN(minAnnual) || minAnnual < 0) {
    return { ok: false, error: "Minimal summani to'g'ri kiriting (0 yoki undan katta)" };
  }
  return {
    ok: true,
    value: {
      price_per_device_monthly: perDeviceMonthly,
      price_per_device_annual: perDeviceAnnual,
      min_price_monthly: minMonthly,
      min_price_annual: minAnnual,
    },
  };
}

type PlanAmounts = {
  price_per_device_monthly: number;
  price_per_device_annual: number;
  min_price_monthly: number;
  min_price_annual: number;
};

/**
 * One period's two numbers, kept in a titled block. Four bare number inputs in a row
 * are indistinguishable at a glance; grouping them per period makes "monthly vs annual"
 * the primary distinction and "rate vs floor" the secondary one.
 */
function PeriodFields({
  title,
  note,
  perDevice,
  min,
  onPerDevice,
  onMin,
  idPrefix,
}: {
  title: string;
  note: string;
  perDevice: string;
  min: string;
  onPerDevice: (v: string) => void;
  onMin: (v: string) => void;
  idPrefix: string;
}) {
  return (
    <div className="period-block">
      <div className="period-block__head">
        <span className="period-block__title">{title}</span>
        <span className="period-block__note">{note}</span>
      </div>
      <label className="period-block__label" htmlFor={`${idPrefix}-per-device`}>
        1 qurilma uchun
      </label>
      <input
        id={`${idPrefix}-per-device`}
        type="number"
        min={0}
        placeholder="masalan 40000"
        value={perDevice}
        onChange={(e) => onPerDevice(e.target.value)}
      />
      <label className="period-block__label" htmlFor={`${idPrefix}-min`}>
        Minimal summa
      </label>
      <input
        id={`${idPrefix}-min`}
        type="number"
        min={0}
        placeholder="bo'sh = 0 (chegara yo'q)"
        value={min}
        onChange={(e) => onMin(e.target.value)}
      />
    </div>
  );
}

/** Read-only summary of one period, used in the table. */
function PeriodCell({
  perDevice,
  min,
  currency,
}: {
  perDevice: number;
  min: number;
  currency: string;
}) {
  return (
    <div className="billing-cell">
      <span className="price">{fmtMoney(perDevice, currency)}</span>
      <span className="muted">1 qurilma uchun</span>
      <span className="muted">
        {min > 0 ? `Minimal: ${fmtMoney(min, currency)}` : 'Minimal chegara yo’q'}
      </span>
    </div>
  );
}

export function AdminPlansTab() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [name, setName] = useState('');
  const [amounts, setAmounts] = useState<Amounts>(EMPTY_AMOUNTS);
  const [createError, setCreateError] = useState('');
  const [creating, setCreating] = useState(false);

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editAmounts, setEditAmounts] = useState<Amounts>(EMPTY_AMOUNTS);
  const [editError, setEditError] = useState('');
  const [rowError, setRowError] = useState('');
  const [loadError, setLoadError] = useState('');

  async function load() {
    try {
      setPlans(await api.getPlans());
      setLoadError('');
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : "Tariflarni yuklab bo'lmadi");
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setCreateError('');
    const parsed = parseAmounts(amounts);
    if (!parsed.ok) {
      setCreateError(parsed.error);
      return;
    }
    setCreating(true);
    try {
      await api.createPlan({ name, ...parsed.value });
      setName('');
      setAmounts(EMPTY_AMOUNTS);
      await load();
    } catch (err) {
      setCreateError(err instanceof ApiError ? err.message : 'Server bilan aloqa xato');
    } finally {
      setCreating(false);
    }
  }

  function startEdit(plan: Plan) {
    setEditingId(plan.id);
    setEditAmounts(fromPlan(plan));
    setEditError('');
  }

  async function saveEdit(planId: number) {
    setEditError('');
    const parsed = parseAmounts(editAmounts);
    if (!parsed.ok) {
      setEditError(parsed.error);
      return;
    }
    try {
      await api.updatePlan(planId, parsed.value);
      setEditingId(null);
      load();
    } catch (err) {
      setEditError(err instanceof ApiError ? err.message : 'Server bilan aloqa xato');
    }
  }

  async function toggleActive(plan: Plan) {
    setRowError('');
    try {
      await api.updatePlan(plan.id, { is_active: !plan.is_active });
      load();
    } catch (err) {
      setRowError(err instanceof ApiError ? err.message : 'Server bilan aloqa xato');
    }
  }

  async function remove(plan: Plan) {
    setRowError('');
    if (!window.confirm(`"${plan.name}" tarifi o'chirilsinmi?`)) return;
    try {
      await api.deletePlan(plan.id);
      load();
    } catch (err) {
      // 409 == plan is assigned to clinics; suggest archiving instead
      setRowError(
        err instanceof ApiError && err.status === 409
          ? "Bu tarif klinikalarga biriktirilgan — o'chirib bo'lmaydi. O'rniga arxivlang (Faolsizlantirish)."
          : err instanceof ApiError
            ? err.message
            : 'Server bilan aloqa xato'
      );
    }
  }

  return (
    <section className="tab-panel">
      <div className="section-head">
        <h2>Tarif rejalari</h2>
      </div>

      <div className="panel-card glass">
        <h3>
          <PlusIcon /> Yangi tarif qo'shish
        </h3>
        <p className="hint">
          Narx har bir ESP32 qabul qilgich uchun hisoblanadi: qurilma soni × 1 qurilma
          narxi, natija minimal summadan kam bo'lsa minimal summa olinadi. Oylik va yillik
          stavkalar bir-biridan mustaqil — yillik chegirma tijorat qarori.
        </p>
        <form onSubmit={handleCreate}>
          <div className="inline-form">
            <input
              type="text"
              placeholder="Nomi (masalan Standart)"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="period-grid">
            <PeriodFields
              idPrefix="new-monthly"
              title="Oylik"
              note="1 oyga"
              perDevice={amounts.perDeviceMonthly}
              min={amounts.minMonthly}
              onPerDevice={(v) => setAmounts((a) => ({ ...a, perDeviceMonthly: v }))}
              onMin={(v) => setAmounts((a) => ({ ...a, minMonthly: v }))}
            />
            <PeriodFields
              idPrefix="new-annual"
              title="Yillik"
              note="12 oyga"
              perDevice={amounts.perDeviceAnnual}
              min={amounts.minAnnual}
              onPerDevice={(v) => setAmounts((a) => ({ ...a, perDeviceAnnual: v }))}
              onMin={(v) => setAmounts((a) => ({ ...a, minAnnual: v }))}
            />
          </div>
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
              <th>Oylik (1 qurilma)</th>
              <th>Yillik (1 qurilma)</th>
              <th>Holat</th>
              <th>Amallar</th>
            </tr>
          </thead>
          <tbody>
            {plans.map((p) =>
              editingId === p.id ? (
                <tr key={p.id}>
                  <td data-label="Nomi">{p.name}</td>
                  <td data-label="Oylik (1 qurilma)" colSpan={2}>
                    <div className="period-grid period-grid--inline">
                      <PeriodFields
                        idPrefix={`edit-${p.id}-monthly`}
                        title="Oylik"
                        note="1 oyga"
                        perDevice={editAmounts.perDeviceMonthly}
                        min={editAmounts.minMonthly}
                        onPerDevice={(v) => setEditAmounts((a) => ({ ...a, perDeviceMonthly: v }))}
                        onMin={(v) => setEditAmounts((a) => ({ ...a, minMonthly: v }))}
                      />
                      <PeriodFields
                        idPrefix={`edit-${p.id}-annual`}
                        title="Yillik"
                        note="12 oyga"
                        perDevice={editAmounts.perDeviceAnnual}
                        min={editAmounts.minAnnual}
                        onPerDevice={(v) => setEditAmounts((a) => ({ ...a, perDeviceAnnual: v }))}
                        onMin={(v) => setEditAmounts((a) => ({ ...a, minAnnual: v }))}
                      />
                    </div>
                  </td>
                  <td data-label="Holat">{p.is_active ? 'Faol' : 'Arxiv'}</td>
                  <td data-label="Amallar">
                    <div className="row-actions">
                      <button className="btn btn-primary btn-sm" onClick={() => saveEdit(p.id)} type="button">
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
                <tr key={p.id}>
                  <td data-label="Nomi">{p.name}</td>
                  <td data-label="Oylik (1 qurilma)">
                    <PeriodCell
                      perDevice={p.price_per_device_monthly}
                      min={p.min_price_monthly}
                      currency={p.currency}
                    />
                  </td>
                  <td data-label="Yillik (1 qurilma)">
                    <PeriodCell
                      perDevice={p.price_per_device_annual}
                      min={p.min_price_annual}
                      currency={p.currency}
                    />
                  </td>
                  <td data-label="Holat">
                    <span className={`sub-pill ${p.is_active ? 'active' : 'suspended'}`}>
                      {p.is_active ? 'Faol' : 'Arxiv'}
                    </span>
                  </td>
                  <td data-label="Amallar">
                    <div className="row-actions">
                      <button className="btn btn-ghost btn-sm" onClick={() => startEdit(p)} type="button">
                        Tahrirlash
                      </button>
                      <button className="btn btn-ghost btn-sm" onClick={() => toggleActive(p)} type="button">
                        {p.is_active ? 'Faolsizlantirish' : 'Faollashtirish'}
                      </button>
                      <button className="btn btn-ghost btn-sm" onClick={() => remove(p)} type="button">
                        O'chirish
                      </button>
                    </div>
                  </td>
                </tr>
              )
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
