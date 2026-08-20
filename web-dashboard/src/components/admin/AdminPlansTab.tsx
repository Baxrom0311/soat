import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { api, ApiError } from '../../api/client';
import type { Plan } from '../../api/types';
import { PlusIcon } from '../Icons';

function fmtMoney(amount: number, currency: string): string {
  const label = currency === 'UZS' ? "so'm" : currency;
  return `${amount.toLocaleString('ru-RU')} ${label}`;
}

export function AdminPlansTab() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [months, setMonths] = useState('1');
  const [maxDevices, setMaxDevices] = useState('');
  const [createError, setCreateError] = useState('');

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editPrice, setEditPrice] = useState('');
  const [editMax, setEditMax] = useState('');
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
    try {
      await api.createPlan({
        name,
        price_amount: Number(price),
        billing_period_months: Number(months) || 1,
        max_devices: maxDevices ? Number(maxDevices) : null,
      });
      setName('');
      setPrice('');
      setMonths('1');
      setMaxDevices('');
      load();
    } catch (err) {
      setCreateError(err instanceof ApiError ? err.message : 'Server bilan aloqa xato');
    }
  }

  function startEdit(plan: Plan) {
    setEditingId(plan.id);
    setEditPrice(String(plan.price_amount));
    setEditMax(plan.max_devices === null ? '' : String(plan.max_devices));
    setEditError('');
  }

  async function saveEdit(planId: number) {
    setEditError('');
    // Guard the Number('') === 0 footgun: an empty price must not silently zero the plan.
    const price = Number(editPrice);
    if (editPrice.trim() === '' || Number.isNaN(price) || price < 0) {
      setEditError("Narxni to'g'ri kiriting (0 yoki undan katta)");
      return;
    }
    try {
      await api.updatePlan(planId, {
        price_amount: price,
        max_devices: editMax ? Number(editMax) : null,
      });
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
        <form className="inline-form" onSubmit={handleCreate}>
          <input
            type="text"
            placeholder="Nomi (masalan Standart)"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <input
            type="number"
            min={0}
            placeholder="Narx (so'm/davr)"
            required
            value={price}
            onChange={(e) => setPrice(e.target.value)}
          />
          <input
            type="number"
            min={1}
            max={60}
            placeholder="Davr (oy)"
            required
            value={months}
            onChange={(e) => setMonths(e.target.value)}
          />
          <input
            type="number"
            min={1}
            placeholder="Maks. qurilma (bo'sh = cheksiz)"
            value={maxDevices}
            onChange={(e) => setMaxDevices(e.target.value)}
          />
          <button type="submit" className="btn btn-primary">
            Qo'shish
          </button>
        </form>
        <p className="form-error">{createError}</p>
      </div>

      {loadError && <p className="form-error">{loadError}</p>}
      {rowError && <p className="form-error">{rowError}</p>}

      <div className="table-wrap glass">
        <table>
          <thead>
            <tr>
              <th>Nomi</th>
              <th>Narx</th>
              <th>Davr</th>
              <th>Maks. qurilma</th>
              <th>Holat</th>
              <th>Amallar</th>
            </tr>
          </thead>
          <tbody>
            {plans.map((p) =>
              editingId === p.id ? (
                <tr key={p.id}>
                  <td>{p.name}</td>
                  <td>
                    <input
                      type="number"
                      min={0}
                      className="table-input"
                      value={editPrice}
                      onChange={(e) => setEditPrice(e.target.value)}
                    />
                  </td>
                  <td>{p.billing_period_months} oy</td>
                  <td>
                    <input
                      type="number"
                      min={1}
                      className="table-input"
                      placeholder="cheksiz"
                      value={editMax}
                      onChange={(e) => setEditMax(e.target.value)}
                    />
                  </td>
                  <td>{p.is_active ? 'Faol' : 'Arxiv'}</td>
                  <td>
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
                  <td>{p.name}</td>
                  <td>{fmtMoney(p.price_amount, p.currency)}</td>
                  <td>{p.billing_period_months} oy</td>
                  <td>{p.max_devices === null ? 'Cheksiz' : p.max_devices}</td>
                  <td>
                    <span className={`sub-pill ${p.is_active ? 'active' : 'suspended'}`}>
                      {p.is_active ? 'Faol' : 'Arxiv'}
                    </span>
                  </td>
                  <td>
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
