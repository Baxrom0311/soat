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

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editFloor, setEditFloor] = useState('');
  const [editError, setEditError] = useState('');
  const [editBusy, setEditBusy] = useState(false);

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

  function startEdit(d: Device) {
    setEditingId(d.id);
    setEditFloor(String(d.floor));
    setEditError('');
  }

  async function saveEdit(devicePk: number) {
    setEditError('');
    setEditBusy(true);
    try {
      await api.updateDevice(devicePk, { floor: Number(editFloor) });
      setEditingId(null);
      await load();
    } catch (err) {
      setEditError(err instanceof ApiError ? err.message : 'Server bilan aloqa xato');
    } finally {
      setEditBusy(false);
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
                  {filteredDevices.map((d) =>
                    editingId === d.id ? (
                      <tr key={d.device_id}>
                        <td data-label="Device ID"><code className="mono-sm">{d.device_id}</code></td>
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
                          <span className="status-dot-text">
                            <span className={d.online ? 'dot dot--ok' : 'dot dot--hollow'} aria-hidden="true" />
                            {d.online ? 'Onlayn' : 'Oflayn'}
                          </span>
                        </td>
                        <td data-label="Yaratildi">{fmtTime(d.created_at)}</td>
                        <td data-label="Oxirgi ko'rilgan">{d.last_seen_at ? relTime(d.last_seen_at) : '—'}</td>
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
        </>
      )}
    </section>
  );
}
