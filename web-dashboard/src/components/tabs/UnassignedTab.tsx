import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '../../api/client';
import type { ButtonBinding, Room, UnassignedSignal } from '../../api/types';

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

interface UnassignedTabProps {
  signals: UnassignedSignal[];
  refreshSignals: () => Promise<void>;
  markLocalMutation: () => void;
}

import { ColumnPicker, useColumnVisibility, type ColumnDef } from '../common/ColumnPicker';

type SignalColKey = 'code' | 'device' | 'first_seen' | 'last_seen' | 'count' | 'actions';

const SIGNAL_COLUMNS: ColumnDef<SignalColKey>[] = [
  { key: 'code', label: 'Kod' },
  { key: 'device', label: 'Resiver (ESP32)' },
  { key: 'first_seen', label: "Birinchi ko'rilgan" },
  { key: 'last_seen', label: "Oxirgi ko'rilgan" },
  { key: 'count', label: 'Necha marta' },
  { key: 'actions', label: "Xonaga bog'lash" },
];

type BoundBtnColKey = 'code' | 'room' | 'floor' | 'actions';

const BOUND_BTN_COLUMNS: ColumnDef<BoundBtnColKey>[] = [
  { key: 'code', label: 'Kod' },
  { key: 'room', label: 'Xona' },
  { key: 'floor', label: 'Qavat' },
  { key: 'actions', label: 'Amal' },
];

function SignalRow({
  signal,
  rooms,
  visibleCols,
  onBound,
}: {
  signal: UnassignedSignal;
  rooms: Room[];
  visibleCols: Record<SignalColKey, boolean>;
  onBound: () => void;
}) {
  const [roomId, setRoomId] = useState<string>(rooms[0] ? String(rooms[0].id) : '');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!roomId && rooms[0]) setRoomId(String(rooms[0].id));
  }, [rooms, roomId]);

  async function bind() {
    setError('');
    setSubmitting(true);
    try {
      await api.createButton({ ev1527_code: signal.ev1527_code, room_id: Number(roomId) });
      onBound();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Xato');
    } finally {
      setSubmitting(false);
    }
  }

  async function remove() {
    if (!window.confirm(`Kod ${signal.ev1527_code} signal ro'yxatidan o'chirilsinmi?`)) return;
    try {
      await api.deleteUnassignedSignal(signal.id);
      onBound();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Xato');
    }
  }

  return (
    <tr>
      {visibleCols.code && <td data-label="Kod">{signal.ev1527_code}</td>}
      {visibleCols.device && <td data-label="Qurilma">{signal.device_id}</td>}
      {visibleCols.first_seen && <td data-label="Birinchi ko'rilgan">{fmtTime(signal.first_seen_at)}</td>}
      {visibleCols.last_seen && <td data-label="Oxirgi ko'rilgan">{fmtTime(signal.last_seen_at)}</td>}
      {visibleCols.count && <td data-label="Necha marta">{signal.seen_count}</td>}
      {visibleCols.actions && (
        <td data-label="Xonaga bog'lash">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <select className="bind-select" value={roomId} onChange={(e) => setRoomId(e.target.value)}>
              {rooms.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.room_number} ({r.floor}-qavat)
                </option>
              ))}
            </select>
            <button className="bind-btn" onClick={bind} type="button" disabled={!roomId || submitting}>
              {submitting ? '...' : "Bog'lash"}
            </button>
            <button className="btn btn-ghost btn-sm" onClick={remove} type="button" title="Signalni o'chirish">
              O'chirish
            </button>
          </div>
          {rooms.length === 0 && <p className="form-error">Avval "Xonalar" bo'limida xona yarating</p>}
          {error && <p className="form-error">{error}</p>}
        </td>
      )}
    </tr>
  );
}

function EditButtonRoomRow({
  binding,
  rooms,
  visibleCols,
  onDone,
  onCancel,
}: {
  binding: ButtonBinding;
  rooms: Room[];
  visibleCols: Record<BoundBtnColKey, boolean>;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [roomId, setRoomId] = useState<string>(String(binding.room_id));
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const activeColCount = Object.values(visibleCols).filter(Boolean).length;
  const editColSpan = Math.max(
    1,
    activeColCount - (visibleCols.code ? 1 : 0) - (visibleCols.actions ? 1 : 0)
  );

  async function save() {
    setError('');
    setBusy(true);
    try {
      await api.updateButton(binding.id, { room_id: Number(roomId) });
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Server bilan aloqa xato');
    } finally {
      setBusy(false);
    }
  }

  return (
    <tr>
      {visibleCols.code && <td data-label="Kod">{binding.ev1527_code}</td>}
      {(visibleCols.room || visibleCols.floor || (!visibleCols.code && !visibleCols.actions)) && (
        <td data-label="Xona" colSpan={editColSpan}>
          <select className="bind-select" value={roomId} onChange={(e) => setRoomId(e.target.value)}>
            {rooms.map((r) => (
              <option key={r.id} value={r.id}>
                {r.room_number} ({r.floor}-qavat)
              </option>
            ))}
          </select>
        </td>
      )}
      {visibleCols.actions && (
        <td data-label="Amal">
          <div className="row-actions">
            <button className="btn btn-primary btn-sm" onClick={save} disabled={busy} type="button">
              Saqlash
            </button>
            <button className="btn btn-ghost btn-sm" onClick={onCancel} type="button">
              Bekor
            </button>
          </div>
          {error && <p className="form-error">{error}</p>}
        </td>
      )}
    </tr>
  );
}

export function UnassignedTab({ signals, refreshSignals, markLocalMutation }: UnassignedTabProps) {
  const [search, setSearch] = useState('');
  const [btnSearch, setBtnSearch] = useState('');
  const [rooms, setRooms] = useState<Room[]>([]);
  const [buttons, setButtons] = useState<ButtonBinding[]>([]);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [loadError, setLoadError] = useState('');
  const [unbindError, setUnbindError] = useState('');

  const {
    visibleCols: signalVisibleCols,
    toggleCol: toggleSignalCol,
    resetCols: resetSignalCols,
  } = useColumnVisibility<SignalColKey>('nursecall.unassigned_signals.columns', SIGNAL_COLUMNS);

  const {
    visibleCols: boundVisibleCols,
    toggleCol: toggleBoundCol,
    resetCols: resetBoundCols,
  } = useColumnVisibility<BoundBtnColKey>('nursecall.bound_buttons.columns', BOUND_BTN_COLUMNS);

  const loadButtons = useCallback(async () => {
    setButtons(await api.getButtons());
  }, []);

  const loadAll = useCallback(async () => {
    setLoadError('');
    try {
      const [roomsData] = await Promise.all([api.getRooms(), loadButtons()]);
      setRooms(roomsData);
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : "Ma'lumotlarni yuklab bo'lmadi");
    }
  }, [loadButtons]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  async function handleBound() {
    markLocalMutation();
    await refreshSignals();
    loadButtons().catch(() => {});
  }

  async function clearAll() {
    if (!window.confirm(`Barcha ${filteredSignals.length} ta biriktirilmagan signal ro'yxatdan tozalansinmi?`)) return;
    try {
      await api.clearAllUnassignedSignals();
      markLocalMutation();
      await refreshSignals();
    } catch (err) {
      setUnbindError(err instanceof ApiError ? err.message : "Tozalashda xatolik");
    }
  }

  async function unbind(binding: ButtonBinding) {
    if (
      !window.confirm(
        `Kod ${binding.ev1527_code} — "${binding.room_number}" xonasidan uziladi. Tugma qayta bosilganda yana shu ro'yxatda paydo bo'ladi. Davom etilsinmi?`
      )
    ) {
      return;
    }
    setUnbindError('');
    try {
      await api.deleteButton(binding.id);
      markLocalMutation();
      loadButtons().catch(() => {});
    } catch (err) {
      setUnbindError(err instanceof ApiError ? err.message : 'Xato');
    }
  }

  const boundCodesSet = new Set(buttons.map((b) => String(b.ev1527_code)));

  const filteredSignals = signals.filter(
    (s) =>
      !boundCodesSet.has(String(s.ev1527_code)) &&
      (s.ev1527_code.toLowerCase().includes(search.toLowerCase()) ||
        s.device_id.toLowerCase().includes(search.toLowerCase()))
  );

  const filteredButtons = buttons.filter(
    (b) =>
      b.ev1527_code.toLowerCase().includes(btnSearch.toLowerCase()) ||
      b.room_number.toLowerCase().includes(btnSearch.toLowerCase()) ||
      String(b.floor).includes(btnSearch)
  );

  return (
    <section className="tab-panel">
      <div className="pairing-hint glass">
        <span className="pairing-dot" />
        <p>
          <strong>Juftlash rejimi:</strong> ESP32 resiveri (masalan: <code>qwert12</code>) tutgan har bir 433MHz SOS tugma kodi hali xonaga bog'lanmagan bo'lsa, shu yerda chiqadi. Tugmani xonaga bog'lang yoki keraksiz test signallarini o'chiring.
        </p>
      </div>
      {loadError && (
        <div className="form-error" style={{ marginBottom: 12 }}>
          {loadError}{' '}
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => loadAll()}>
            Qayta urinish
          </button>
        </div>
      )}
      <div className="table-wrap glass">
        <div className="table-toolbar">
          <input
            type="text"
            className="table-search-input"
            placeholder="Tugma kodi yoki device_id bo'yicha qidirish…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span className="table-count-meta">{filteredSignals.length} ta yangi signal</span>
            {filteredSignals.length > 0 && (
              <button type="button" className="btn btn-ghost btn-sm" onClick={clearAll}>
                Barchasini tozalash
              </button>
            )}
            <ColumnPicker
              columns={SIGNAL_COLUMNS}
              visibleCols={signalVisibleCols}
              onToggle={toggleSignalCol}
              onReset={resetSignalCols}
            />
          </div>
        </div>
        <table>
          <thead>
            <tr>
              {signalVisibleCols.code && <th>Kod</th>}
              {signalVisibleCols.device && <th>Resiver (ESP32)</th>}
              {signalVisibleCols.first_seen && <th>Birinchi ko'rilgan</th>}
              {signalVisibleCols.last_seen && <th>Oxirgi ko'rilgan</th>}
              {signalVisibleCols.count && <th>Necha marta</th>}
              {signalVisibleCols.actions && <th>Xonaga bog'lash</th>}
            </tr>
          </thead>
          <tbody>
            {filteredSignals.map((s) => (
              <SignalRow
                key={s.ev1527_code}
                signal={s}
                rooms={rooms}
                visibleCols={signalVisibleCols}
                onBound={handleBound}
              />
            ))}
          </tbody>
        </table>
      </div>

      <div className="section-head" style={{ marginTop: 28 }}>
        <h2>Bog'langan tugmalar</h2>
      </div>
      {unbindError && <p className="form-error">{unbindError}</p>}
      <div className="table-wrap glass">
        <div className="table-toolbar">
          <input
            type="text"
            className="table-search-input"
            placeholder="Tugma kodi, xona yoki qavat bo'yicha qidirish…"
            value={btnSearch}
            onChange={(e) => setBtnSearch(e.target.value)}
          />
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span className="table-count-meta">{filteredButtons.length} ta tugma</span>
            <ColumnPicker
              columns={BOUND_BTN_COLUMNS}
              visibleCols={boundVisibleCols}
              onToggle={toggleBoundCol}
              onReset={resetBoundCols}
            />
          </div>
        </div>
        <table>
          <thead>
            <tr>
              {boundVisibleCols.code && <th>Kod</th>}
              {boundVisibleCols.room && <th>Xona</th>}
              {boundVisibleCols.floor && <th>Qavat</th>}
              {boundVisibleCols.actions && <th>Amal</th>}
            </tr>
          </thead>
          <tbody>
            {filteredButtons.map((b) =>
              editingId === b.id ? (
                <EditButtonRoomRow
                  key={b.id}
                  binding={b}
                  rooms={rooms}
                  visibleCols={boundVisibleCols}
                  onCancel={() => setEditingId(null)}
                  onDone={() => {
                    setEditingId(null);
                    loadButtons().catch(() => {});
                  }}
                />
              ) : (
                <tr key={b.id}>
                  {boundVisibleCols.code && <td data-label="Kod">{b.ev1527_code}</td>}
                  {boundVisibleCols.room && <td data-label="Xona">{b.room_number}</td>}
                  {boundVisibleCols.floor && <td data-label="Qavat">{b.floor}</td>}
                  {boundVisibleCols.actions && (
                    <td data-label="Amal">
                      <div className="row-actions">
                        <button className="btn btn-ghost btn-sm" onClick={() => setEditingId(b.id)} type="button">
                          Xonani o'zgartirish
                        </button>
                        <button className="btn btn-ghost btn-sm" onClick={() => unbind(b)} type="button">
                          Uzish
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
    </section>
  );
}
