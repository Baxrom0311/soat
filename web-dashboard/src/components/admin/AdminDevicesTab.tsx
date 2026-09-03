import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { api, ApiError } from '../../api/client';
import type { AdminClinic, AdminDevice, DiscoveredDevice } from '../../api/types';
import { CopyIcon, PlusIcon, WarningIcon } from '../Icons';

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

function DeviceCreatedModal({
  deviceId,
  deviceKey,
  onClose,
}: {
  deviceId: string;
  deviceKey: string;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);

  async function copyKey() {
    try {
      await navigator.clipboard.writeText(deviceKey);
      setCopied(true);
    } catch {
      // clipboard access may be blocked; user can still select the text manually
    }
  }

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
        <h3>Qurilma kaliti — {deviceId}</h3>
        <p className="modal-sub">
          <WarningIcon className="modal-warn-icon" />
          Bu kalit faqat hozir ko'rsatiladi va keyin qayta olish imkoni yo'q. Nusxalab qurilma
          config.h fayliga qo'ying.
        </p>
        <code className="key-code">{deviceKey}</code>
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

function EditAdminDeviceModal({
  device,
  onClose,
  onUpdated,
}: {
  device: AdminDevice;
  onClose: () => void;
  onUpdated: () => void;
}) {
  const [floor, setFloor] = useState(String(device.floor));
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await api.updateAdminDevice(device.id, { floor: Number(floor) });
      onUpdated();
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Server bilan aloqa xato');
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    if (
      !window.confirm(
        `Qurilma "${device.device_id}" (${device.clinic_name}) tizimdan to'liq o'chirilsinmi?`
      )
    ) {
      return;
    }
    setError('');
    setDeleting(true);
    try {
      await api.deleteAdminDevice(device.id);
      onUpdated();
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "O'chirishda xatolik");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal glass" onClick={(e) => e.stopPropagation()}>
        <h3>Qurilmani tahrirlash — {device.device_id}</h3>
        <p className="modal-sub">
          <strong>Klinika:</strong> {device.clinic_name} | <strong>Holat:</strong>{' '}
          {device.online ? 'Onlayn' : 'Oflayn'}
        </p>

        <form onSubmit={handleSave} style={{ marginTop: 16 }}>
          <div className="form-group" style={{ marginBottom: 18 }}>
            <label>Qavat</label>
            <input
              type="number"
              className="table-input"
              style={{ width: '100%', padding: '10px 14px' }}
              min={0}
              step={1}
              value={floor}
              onChange={(e) => setFloor(e.target.value)}
              required
            />
          </div>

          {error && <p className="form-error" style={{ marginBottom: 14 }}>{error}</p>}

          <div className="modal-actions" style={{ justifyContent: 'space-between' }}>
            <button
              className="btn btn-ghost"
              style={{ color: 'var(--color-attn)' }}
              onClick={handleDelete}
              disabled={deleting || busy}
              type="button"
            >
              {deleting ? "O'chirilmoqda..." : "O'chirish"}
            </button>
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn btn-ghost" onClick={onClose} type="button">
                Bekor qilish
              </button>
              <button className="btn btn-primary" type="submit" disabled={busy || deleting}>
                {busy ? 'Saqlanmoqda...' : 'Saqlash'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

function ClaimRow({
  discovered,
  clinics,
  onClaimed,
}: {
  discovered: DiscoveredDevice;
  clinics: AdminClinic[];
  onClaimed: () => void;
}) {
  const [clinicId, setClinicId] = useState<string>(clinics[0] ? String(clinics[0].id) : '');
  const [deviceId, setDeviceId] = useState('');
  const [floor, setFloor] = useState('1');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!clinicId && clinics[0]) setClinicId(String(clinics[0].id));
  }, [clinics, clinicId]);

  useEffect(() => {
    if (!deviceId) setDeviceId(`esp32-${discovered.chip_id.slice(-6)}`);
  }, [discovered.chip_id, deviceId]);

  async function claim() {
    setError('');
    setBusy(true);
    try {
      await api.claimDiscoveredDevice(discovered.chip_id, {
        clinic_id: Number(clinicId),
        device_id: deviceId.trim(),
        floor: Number(floor),
      });
      onClaimed();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Biriktirishda xatolik');
    } finally {
      setBusy(false);
    }
  }

  return (
    <tr>
      <td data-label="chip_id">
        <code className="mono-sm">{discovered.chip_id}</code>
      </td>
      <td data-label="Birinchi ko'rilgan">{fmtTime(discovered.first_seen_at)}</td>
      <td data-label="Oxirgi ko'rilgan">{relTime(discovered.last_seen_at)}</td>
      <td data-label="Amal">
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          <select className="bind-select" value={clinicId} onChange={(e) => setClinicId(e.target.value)}>
            {clinics.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <input
            type="text"
            className="table-input"
            style={{ width: 140 }}
            placeholder="device_id"
            value={deviceId}
            onChange={(e) => setDeviceId(e.target.value)}
          />
          <input
            type="number"
            className="table-input"
            style={{ width: 60 }}
            min={0}
            step={1}
            value={floor}
            onChange={(e) => setFloor(e.target.value)}
          />
          <button
            className="btn btn-primary btn-sm"
            onClick={claim}
            disabled={busy || !clinicId || !deviceId}
            type="button"
          >
            {busy ? '...' : "Klinikaga biriktirish"}
          </button>
        </div>
        {error && <p className="form-error">{error}</p>}
      </td>
    </tr>
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

  const refresh = useCallback(async () => {
    try {
      setDiscovered(await api.getDiscoveredDevices());
    } catch {
      // transient failure: keep previously-loaded list
    }
  }, []);

  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, 5000);
    return () => clearInterval(timer);
  }, [refresh]);

  if (discovered.length === 0) {
    return (
      <div className="pairing-hint glass" style={{ marginBottom: 20 }}>
        <span className="pairing-dot" />
        <p>
          <strong>Onlayn, biriktirilmagan qurilmalar:</strong> Zavoddan yangi flash qilingan ESP32'lar
          shu yerda apparat chip ID'si bilan avtomatik paydo bo'ladi — klinika va qavatni tanlab
          bog'lang, kalit ESP32'ga o'zi yuboriladi.
        </p>
      </div>
    );
  }

  return (
    <div className="panel-card glass" style={{ marginBottom: 20, borderColor: 'var(--color-accent)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        <span className="pairing-dot" />
        <h3 style={{ margin: 0 }}>Yangi topilgan ESP32 qurilmalari ({discovered.length} ta)</h3>
      </div>
      <p className="card-sub">
        Bu chip ID'lar hozirgina /announce endpointiga bog'langan. Klinikani tanlab "Klinikaga
        biriktirish" tugmasini bosing — kalit qurilmaga xavfsiz avto-konfiguratsiya qilinadi.
      </p>
      <div className="table-wrap">
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
              <ClaimRow
                key={d.chip_id}
                discovered={d}
                clinics={clinics}
                onClaimed={() => {
                  refresh();
                  onClaimed();
                }}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function AdminDevicesTab() {
  const [devices, setDevices] = useState<AdminDevice[]>([]);
  const [clinics, setClinics] = useState<AdminClinic[]>([]);
  const [filterClinic, setFilterClinic] = useState<string>('');
  const [loadError, setLoadError] = useState('');

  const [formClinic, setFormClinic] = useState<string>('');
  const [deviceId, setDeviceId] = useState('');
  const [floor, setFloor] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const [created, setCreated] = useState<{ deviceId: string; key: string } | null>(null);

  const [editingDevice, setEditingDevice] = useState<AdminDevice | null>(null);

  const loadClinics = useCallback(async () => {
    try {
      const data = await api.getAdminClinics();
      setClinics(data);
      if (data.length > 0 && !formClinic) {
        setFormClinic(String(data[0].id));
      }
    } catch {
      // non-fatal: device creation form will disable clinic selection
    }
  }, [formClinic]);

  const loadDevices = useCallback(async (cId?: string) => {
    setLoadError('');
    try {
      const cidNum = cId ? Number(cId) : undefined;
      setDevices(await api.getAdminDevices(cidNum));
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : "Qurilmalarni yuklab bo'lmadi");
    }
  }, []);

  useEffect(() => {
    loadClinics();
    loadDevices(filterClinic);
  }, [filterClinic, loadClinics, loadDevices]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!formClinic) return;
    setError('');
    setSubmitting(true);
    try {
      const res = await api.createAdminDevice({
        clinic_id: Number(formClinic),
        device_id: deviceId.trim(),
        floor: Number(floor),
      });
      setCreated({ deviceId: res.device_id, key: res.device_api_key });
      setDeviceId('');
      setFloor('');
      await loadDevices(filterClinic);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Server bilan aloqa xato');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="tab-panel">
      {created && (
        <DeviceCreatedModal
          deviceId={created.deviceId}
          deviceKey={created.key}
          onClose={() => setCreated(null)}
        />
      )}

      {editingDevice && (
        <EditAdminDeviceModal
          device={editingDevice}
          onClose={() => setEditingDevice(null)}
          onUpdated={() => loadDevices(filterClinic)}
        />
      )}

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
              {devices.map((d) => (
                <tr key={d.id}>
                  <td data-label="Klinika">{d.clinic_name}</td>
                  <td data-label="device_id"><code className="mono-sm">{d.device_id}</code></td>
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
                    <button className="btn btn-ghost btn-sm" onClick={() => setEditingDevice(d)} type="button">
                      Tahrirlash
                    </button>
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
