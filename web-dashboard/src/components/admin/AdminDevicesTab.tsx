import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { api, ApiError } from '../../api/client';
import type {
  AdminClinic,
  AdminDevice,
  AdminDeviceCreateResponse,
  DiscoveredDevice,
} from '../../api/types';
import { CopyIcon, PlusIcon, WarningIcon } from '../Icons';

const DISCOVERED_POLL_MS = 8000;

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function relTime(iso: string): string {
  const s = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return `${s} soniya oldin`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} daqiqa oldin`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} soat oldin`;
  return `${Math.floor(h / 24)} kun oldin`;
}

function DeviceKeyModal({ created, onClose }: { created: AdminDeviceCreateResponse; onClose: () => void }) {
  const [copied, setCopied] = useState(false);

  async function copyKey() {
    try {
      await navigator.clipboard.writeText(created.device_api_key);
      setCopied(true);
    } catch {
      // clipboard access may be blocked; user can still select the text manually
    }
  }

  // The key is shown exactly once and cannot be retrieved again, so neither a stray
  // backdrop click nor an un-copied close may silently discard it.
  function handleClose() {
    if (
      !copied &&
      !window.confirm(
        "Kalit hali nusxalanmadi! Bu oyna yopilgach kalitni qayta ko'rib bo'lmaydi. Baribir yopilsinmi?"
      )
    ) {
      return;
    }
    onClose();
  }

  return (
    <div className="modal-overlay">
      <div className="modal glass" onClick={(e) => e.stopPropagation()}>
        <h3>Qurilma kaliti — {created.device_id}</h3>
        <p className="modal-sub">
          <WarningIcon className="modal-warn-icon" />
          Bu kalit faqat hozir ko'rsatiladi va keyin qayta olish imkoni yo'q. Nusxalab qurilma
          config.h fayliga qo'ying.
        </p>
        <code className="key-code">{created.device_api_key}</code>
        <div className="modal-actions">
          <button className="btn btn-ghost" onClick={copyKey} type="button">
            <CopyIcon /> {copied ? 'Nusxalandi' : 'Nusxalash'}
          </button>
          <button className="btn btn-primary" onClick={handleClose} type="button">
            Yopish
          </button>
        </div>
      </div>
    </div>
  );
}

function ClaimDeviceModal({
  device,
  clinics,
  onClose,
  onClaimed,
}: {
  device: DiscoveredDevice;
  clinics: AdminClinic[];
  onClose: () => void;
  onClaimed: () => void;
}) {
  const [clinicId, setClinicId] = useState('');
  const [floor, setFloor] = useState('');
  const [deviceId, setDeviceId] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await api.claimDiscoveredDevice(device.chip_id, {
        clinic_id: Number(clinicId),
        floor: Number(floor),
        device_id: deviceId.trim() ? deviceId.trim() : undefined,
      });
      onClaimed();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Server bilan aloqa xato');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal glass" onClick={(e) => e.stopPropagation()}>
        <h3>Qurilmani bog'lash — {device.chip_id}</h3>
        <p className="modal-sub">
          Klinika va qavatni tanlang. Kalit ESP32'ning o'ziga avtomatik yetkaziladi —
          uni bu yerda ko'rish yoki nusxalash shart emas.
        </p>
        <form className="inline-form" onSubmit={handleSubmit}>
          <select required value={clinicId} onChange={(e) => setClinicId(e.target.value)}>
            <option value="" disabled>
              Klinikani tanlang
            </option>
            {clinics.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <input
            type="number"
            placeholder="Qavat"
            required
            min={0}
            step={1}
            value={floor}
            onChange={(e) => setFloor(e.target.value)}
          />
          <input
            type="text"
            placeholder="Nomi (ixtiyoriy, avtomatik generatsiya qilinadi)"
            value={deviceId}
            onChange={(e) => setDeviceId(e.target.value)}
          />
          <div className="modal-actions">
            <button className="btn btn-ghost" type="button" onClick={onClose} disabled={submitting}>
              Bekor qilish
            </button>
            <button className="btn btn-primary" type="submit" disabled={submitting}>
              Bog'lash
            </button>
          </div>
        </form>
        <p className="form-error">{error}</p>
      </div>
    </div>
  );
}

function DiscoveredDevicesSection({
  clinics,
  onClaimed,
}: {
  clinics: AdminClinic[];
  onClaimed: () => void;
}) {
  const [discovered, setDiscovered] = useState<DiscoveredDevice[]>([]);
  const [claiming, setClaiming] = useState<DiscoveredDevice | null>(null);
  const [error, setError] = useState('');

  async function load() {
    try {
      setDiscovered(await api.getDiscoveredDevices());
      setError('');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Server bilan aloqa xato');
    }
  }

  useEffect(() => {
    load();
    const id = window.setInterval(load, DISCOVERED_POLL_MS);
    return () => window.clearInterval(id);
  }, []);

  function handleClaimed() {
    setClaiming(null);
    load();
    onClaimed();
  }

  return (
    <div className="panel-card glass">
      <h3>Onlayn, biriktirilmagan qurilmalar</h3>
      <p className="modal-sub">
        Zavoddan yangi flash qilingan ESP32'lar shu yerda apparat chip ID'si bilan avtomatik
        paydo bo'ladi — klinika va qavatni tanlab bog'lang, kalit ESP32'ga o'zi yuboriladi.
      </p>
      {error && <p className="form-error">{error}</p>}
      <div className="table-wrap glass">
        <table>
          <thead>
            <tr>
              <th>chip_id</th>
              <th>Birinchi ko'rilgan</th>
              <th>Oxirgi ko'rilgan</th>
              <th>Amal</th>
            </tr>
          </thead>
          <tbody>
            {discovered.map((d) => (
              <tr key={d.chip_id}>
                <td data-label="chip_id">
                  <code>{d.chip_id}</code>
                </td>
                <td data-label="Birinchi ko'rilgan" title={fmtTime(d.first_seen_at)}>{relTime(d.first_seen_at)}</td>
                <td data-label="Oxirgi ko'rilgan" title={fmtTime(d.last_seen_at)}>{relTime(d.last_seen_at)}</td>
                <td data-label="Amal">
                  <button className="btn btn-primary btn-sm" type="button" onClick={() => setClaiming(d)}>
                    Bog'lash
                  </button>
                </td>
              </tr>
            ))}
            {discovered.length === 0 && (
              <tr>
                <td colSpan={4}>Hozircha onlayn, biriktirilmagan qurilma yo'q</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {claiming && (
        <ClaimDeviceModal
          device={claiming}
          clinics={clinics}
          onClose={() => setClaiming(null)}
          onClaimed={handleClaimed}
        />
      )}
    </div>
  );
}

export function AdminDevicesTab() {
  const [devices, setDevices] = useState<AdminDevice[]>([]);
  const [clinics, setClinics] = useState<AdminClinic[]>([]);
  const [filterClinic, setFilterClinic] = useState('');

  const [formClinic, setFormClinic] = useState('');
  const [deviceId, setDeviceId] = useState('');
  const [floor, setFloor] = useState('');
  const [error, setError] = useState('');
  const [loadError, setLoadError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [created, setCreated] = useState<AdminDeviceCreateResponse | null>(null);

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editFloor, setEditFloor] = useState('');
  const [editError, setEditError] = useState('');
  const [editBusy, setEditBusy] = useState(false);

  async function loadDevices(clinicId: string) {
    try {
      setDevices(await api.getAdminDevices(clinicId ? Number(clinicId) : undefined));
      setLoadError('');
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : "Qurilmalarni yuklab bo'lmadi");
    }
  }

  useEffect(() => {
    api.getAdminClinics().then(setClinics).catch(() => setLoadError("Klinikalar ro'yxatini yuklab bo'lmadi"));
  }, []);

  useEffect(() => {
    loadDevices(filterClinic);
  }, [filterClinic]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const data = await api.createAdminDevice({
        clinic_id: Number(formClinic),
        device_id: deviceId,
        floor: Number(floor),
      });
      setCreated(data);
      setDeviceId('');
      setFloor('');
      await loadDevices(filterClinic);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Server bilan aloqa xato');
    } finally {
      setSubmitting(false);
    }
  }

  function startEdit(d: AdminDevice) {
    setEditingId(d.id);
    setEditFloor(String(d.floor));
    setEditError('');
  }

  async function saveEdit(devicePk: number) {
    setEditError('');
    setEditBusy(true);
    try {
      await api.updateAdminDevice(devicePk, { floor: Number(editFloor) });
      setEditingId(null);
      await loadDevices(filterClinic);
    } catch (err) {
      setEditError(err instanceof ApiError ? err.message : 'Server bilan aloqa xato');
    } finally {
      setEditBusy(false);
    }
  }

  return (
    <section className="tab-panel">
      <header className="page-header-row">
        <div>
          <h1 className="page-header-title">Barcha qurilmalar</h1>
          <p className="page-header-desc">Klinikalar bo'yicha ESP32 mikrokontrollerlari apparat nazorati.</p>
        </div>
      </header>

      <DiscoveredDevicesSection clinics={clinics} onClaimed={() => loadDevices(filterClinic)} />

      <div className="panel-card glass">
        <h3>
          <PlusIcon /> Yangi qurilma ro'yxatga olish
        </h3>
        <form className="inline-form" onSubmit={handleSubmit}>
          <select required value={formClinic} onChange={(e) => setFormClinic(e.target.value)}>
            <option value="" disabled>
              Klinikani tanlang
            </option>
            {clinics.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <input
            type="text"
            placeholder="device_id (masalan floor2-esp32-01)"
            required
            value={deviceId}
            onChange={(e) => setDeviceId(e.target.value)}
          />
          <input
            type="number"
            placeholder="Qavat"
            required
            min={0}
            step={1}
            value={floor}
            onChange={(e) => setFloor(e.target.value)}
          />
          <button type="submit" className="btn btn-primary" disabled={submitting}>
            {submitting ? '...' : "Qo'shish"}
          </button>
        </form>
        {error && <p className="form-error">{error}</p>}
      </div>

      <div className="filter-row">
        <label htmlFor="clinic-filter">Klinika bo'yicha filtr:</label>
        <select
          id="clinic-filter"
          className="bind-select"
          value={filterClinic}
          onChange={(e) => setFilterClinic(e.target.value)}
        >
          <option value="">Barcha klinikalar</option>
          {clinics.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      {loadError ? (
        <div className="form-error">
          {loadError}{' '}
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => loadDevices(filterClinic)}>
            Qayta urinish
          </button>
        </div>
      ) : (
        <div className="table-wrap glass">
          <table>
            <thead>
              <tr>
                <th>Klinika</th>
                <th>device_id</th>
                <th>Qavat</th>
                <th>Holat</th>
                <th>Oxirgi ko'rilgan</th>
                <th>Yaratildi</th>
                <th>Amal</th>
              </tr>
            </thead>
            <tbody>
              {devices.map((d) =>
                editingId === d.id ? (
                  <tr key={d.id}>
                    <td data-label="Klinika">{d.clinic_name}</td>
                    <td data-label="device_id">{d.device_id}</td>
                    <td data-label="Qavat">
                      <input
                        type="number"
                        className="table-input"
                        min={0}
                        step={1}
                        value={editFloor}
                        onChange={(e) => setEditFloor(e.target.value)}
                      />
                    </td>
                    <td data-label="Holat">
                      <span className={`online-badge ${d.online ? 'online' : 'offline'}`}>
                        <span className="dot" />
                        {d.online ? 'Onlayn' : 'Oflayn'}
                      </span>
                    </td>
                    <td data-label="Oxirgi ko'rilgan">{d.last_seen_at ? relTime(d.last_seen_at) : '—'}</td>
                    <td data-label="Yaratildi">{fmtTime(d.created_at)}</td>
                    <td data-label="Amal">
                      <div className="row-actions">
                        <button
                          className="btn btn-primary btn-sm"
                          onClick={() => saveEdit(d.id)}
                          disabled={editBusy}
                          type="button"
                        >
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
                  <tr key={d.id}>
                    <td data-label="Klinika">{d.clinic_name}</td>
                    <td data-label="device_id">{d.device_id}</td>
                    <td data-label="Qavat">{d.floor}</td>
                    <td data-label="Holat">
                      <span className={`online-badge ${d.online ? 'online' : 'offline'}`}>
                        <span className="dot" />
                        {d.online ? 'Onlayn' : 'Oflayn'}
                      </span>
                    </td>
                    <td data-label="Oxirgi ko'rilgan" title={d.last_seen_at ? fmtTime(d.last_seen_at) : undefined}>
                      {d.last_seen_at ? relTime(d.last_seen_at) : '—'}
                    </td>
                    <td data-label="Yaratildi">{fmtTime(d.created_at)}</td>
                    <td data-label="Amal">
                      <button className="btn btn-ghost btn-sm" onClick={() => startEdit(d)} type="button">
                        Tahrirlash
                      </button>
                    </td>
                  </tr>
                )
              )}
            </tbody>
          </table>
        </div>
      )}

      {created && <DeviceKeyModal created={created} onClose={() => setCreated(null)} />}
    </section>
  );
}
