import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { api, ApiError } from '../../api/client';
import type { Device } from '../../api/types';
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

  // Blocking modal (not a banner): the key is shown exactly once, and an inline banner
  // would be wiped by a tab switch since the tab unmounts. The overlay also blocks the
  // sidebar, and closing without copying requires explicit confirmation.
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

export function DevicesTab() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [deviceId, setDeviceId] = useState('');
  const [floor, setFloor] = useState('');
  const [error, setError] = useState('');
  const [loadError, setLoadError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [created, setCreated] = useState<{ deviceId: string; key: string } | null>(null);

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

  return (
    <section className="tab-panel">
      <div className="section-head">
        <h2>Qurilmalar (ESP32)</h2>
      </div>

      <div className="panel-card glass">
        <h3>
          <PlusIcon /> Yangi qurilma qo'shish
        </h3>
        <form className="inline-form" onSubmit={handleSubmit}>
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

      {created && (
        <DeviceKeyModal
          deviceId={created.deviceId}
          deviceKey={created.key}
          onClose={() => setCreated(null)}
        />
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
                <th>device_id</th>
                <th>Qavat</th>
                <th>Holat</th>
                <th>Yaratildi</th>
                <th>Oxirgi ko'rilgan</th>
              </tr>
            </thead>
            <tbody>
              {devices.map((d) => (
                <tr key={d.device_id}>
                  <td>{d.device_id}</td>
                  <td>{d.floor}</td>
                  <td>
                    <span className={`online-badge ${d.online ? 'online' : 'offline'}`}>
                      <span className="dot" />
                      {d.online ? 'Onlayn' : 'Oflayn'}
                    </span>
                  </td>
                  <td>{fmtTime(d.created_at)}</td>
                  <td title={d.last_seen_at ? fmtTime(d.last_seen_at) : undefined}>
                    {d.last_seen_at ? relTime(d.last_seen_at) : '—'}
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
