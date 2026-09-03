import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { api, ApiError } from '../../api/client';
import type { Device, UnassignedSignal } from '../../api/types';
import { CopyIcon, PlusIcon, WarningIcon } from '../Icons';
import { UnassignedTab } from './UnassignedTab';

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

function DeviceKeyModal({
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

function EditDeviceModal({
  device,
  onClose,
  onUpdated,
}: {
  device: Device;
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
      await api.updateDevice(device.id, { floor: Number(floor) });
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
        `Qurilma "${device.device_id}" tizimdan to'liq o'chirilsinmi?`
      )
    ) {
      return;
    }
    setError('');
    setDeleting(true);
    try {
      await api.deleteDevice(device.id);
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
          Qurilma joylashgan qavatni o'zgartirishingiz yoki qurilmani o'chirishingiz mumkin.
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

interface DevicesTabProps {
  unassignedSignals?: UnassignedSignal[];
  refreshUnassigned?: () => Promise<void>;
  markLocalMutation?: () => void;
}

export function DevicesTab({ unassignedSignals = [], refreshUnassigned = async () => {}, markLocalMutation = () => {} }: DevicesTabProps) {
  const [viewMode, setViewMode] = useState<'all' | 'unassigned'>('all');
  const [devices, setDevices] = useState<Device[]>([]);
  const [search, setSearch] = useState('');
  const [deviceId, setDeviceId] = useState('');
  const [floor, setFloor] = useState('');
  const [error, setError] = useState('');
  const [loadError, setLoadError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [created, setCreated] = useState<{ deviceId: string; key: string } | null>(null);

  const [editingDevice, setEditingDevice] = useState<Device | null>(null);

  async function load() {
    setLoadError('');
    try {
      setDevices(await api.getDevices());
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : "Qurilmalarni yuklab bo'lmadi");
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
      const data = await api.createDevice({ device_id: deviceId, floor: Number(floor) });
      setCreated({ deviceId: data.device_id, key: data.device_api_key });
      setDeviceId('');
      setFloor('');
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Server bilan aloqa xato');
    } finally {
      setSubmitting(false);
    }
  }

  const unassignedCount = unassignedSignals.length;

  const filteredDevices = devices.filter(
    (d) =>
      d.device_id.toLowerCase().includes(search.toLowerCase()) ||
      String(d.floor).includes(search)
  );

  return (
    <section className="tab-panel">
      {created && (
        <DeviceKeyModal
          deviceId={created.deviceId}
          deviceKey={created.key}
          onClose={() => setCreated(null)}
        />
      )}

      {editingDevice && (
        <EditDeviceModal
          device={editingDevice}
          onClose={() => setEditingDevice(null)}
          onUpdated={load}
        />
      )}

      <header className="page-header-row">
        <div>
          <h1 className="page-header-title">Qurilmalar va tugmalar</h1>
          <p className="page-header-desc">Klinikadagi ESP32 qurilmalari hamda biriktirilmagan signallar boshqaruvi.</p>
        </div>
        <div className="segmented-control">
          <button
            type="button"
            className={`segmented-btn ${viewMode === 'all' ? 'active' : ''}`}
            onClick={() => setViewMode('all')}
          >
            Barchasi
          </button>
          <button
            type="button"
            className={`segmented-btn ${viewMode === 'unassigned' ? 'active' : ''}`}
            onClick={() => setViewMode('unassigned')}
          >
            Biriktirilmagan
            {unassignedCount > 0 && (
              <span className="badge badge--attn">{unassignedCount}</span>
            )}
          </button>
        </div>
      </header>

      {viewMode === 'unassigned' ? (
        <UnassignedTab
          signals={unassignedSignals}
          refreshSignals={refreshUnassigned}
          markLocalMutation={markLocalMutation}
        />
      ) : (
        <>
          <div className="panel-card glass">
            <h3>
              <PlusIcon /> Yangi ESP32 qurilmasini ro'yxatdan o'tkazish
            </h3>
            <p className="card-sub">
              Bu yerda yaratilgan device_id va auto-generated secret key yordamida ESP32
              firmware'i /calls endpointiga xavfsiz so'rov yuboradi.
            </p>
            <form onSubmit={handleSubmit} className="form-row">
              <div className="form-group" style={{ flex: 2 }}>
                <label htmlFor="device_id">Device ID</label>
                <input
                  type="text"
                  id="device_id"
                  placeholder="masalan: floor1-esp32-abc"
                  value={deviceId}
                  onChange={(e) => setDeviceId(e.target.value)}
                  required
                />
              </div>
              <div className="form-group" style={{ flex: 1 }}>
                <label htmlFor="floor">Qavat</label>
                <input
                  type="number"
                  id="floor"
                  placeholder="1"
                  min={0}
                  step={1}
                  value={floor}
                  onChange={(e) => setFloor(e.target.value)}
                  required
                />
              </div>
              <div className="form-group" style={{ alignSelf: 'flex-end' }}>
                <button type="submit" className="btn btn-primary" disabled={submitting}>
                  {submitting ? '...' : "Qurilma qo'shish"}
                </button>
              </div>
            </form>
            {error && <p className="form-error">{error}</p>}
          </div>

          {loadError && (
            <div className="form-error" style={{ marginBottom: 12 }}>
              {loadError}{' '}
              <button type="button" className="btn btn-ghost btn-sm" onClick={load}>
                Qayta urinish
              </button>
            </div>
          )}

          {devices.length === 0 ? (
            <div className="empty-card glass">
              <p>Hali birorta ham ESP32 qurilmasi ro'yxatdan o'tkazilmagan.</p>
            </div>
          ) : (
            <div className="table-wrap glass">
              <div className="table-toolbar">
                <input
                  type="text"
                  className="table-search-input"
                  placeholder="Device ID yoki qavat bo'yicha qidirish…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
                <span className="table-count-meta">{filteredDevices.length} ta qurilma</span>
              </div>
              <table>
                <thead>
                  <tr>
                    <th>Device ID</th>
                    <th>Qavat</th>
                    <th>Holat</th>
                    <th>Yaratildi</th>
                    <th>Oxirgi ko'rilgan</th>
                    <th>Amal</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredDevices.map((d) => (
                    <tr key={d.device_id}>
                      <td data-label="Device ID"><code className="mono-sm">{d.device_id}</code></td>
                      <td data-label="Qavat">{d.floor}</td>
                      <td data-label="Holat">
                        <span className="status-dot-text">
                          <span className={d.online ? 'dot dot--ok' : 'dot dot--hollow'} aria-hidden="true" />
                          {d.online ? 'Onlayn' : 'Oflayn'}
                        </span>
                      </td>
                      <td data-label="Yaratildi">{fmtTime(d.created_at)}</td>
                      <td data-label="Oxirgi ko'rilgan" title={d.last_seen_at ? fmtTime(d.last_seen_at) : undefined}>
                        {d.last_seen_at ? relTime(d.last_seen_at) : '—'}
                      </td>
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
        </>
      )}
    </section>
  );
}
