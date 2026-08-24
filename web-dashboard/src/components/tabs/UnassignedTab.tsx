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

function SignalRow({
  signal,
  rooms,
  onBound,
}: {
  signal: UnassignedSignal;
  rooms: Room[];
  onBound: () => void;
}) {
  const [roomId, setRoomId] = useState<string>(rooms[0] ? String(rooms[0].id) : '');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Rows can mount while rooms are still loading; once they arrive, pick the first one
  // so the visible selection and the submitted value can't diverge (room_id 0 bug).
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

  return (
    <tr>
      <td>{signal.ev1527_code}</td>
      <td>{signal.device_id}</td>
      <td>{fmtTime(signal.first_seen_at)}</td>
      <td>{fmtTime(signal.last_seen_at)}</td>
      <td>{signal.seen_count}</td>
      <td>
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
        {rooms.length === 0 && <p className="form-error">Avval "Xonalar" bo'limida xona yarating</p>}
        {error && <p className="form-error">{error}</p>}
      </td>
    </tr>
  );
}

export function UnassignedTab({ signals, refreshSignals, markLocalMutation }: UnassignedTabProps) {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [buttons, setButtons] = useState<ButtonBinding[]>([]);
  const [loadError, setLoadError] = useState('');
  const [unbindError, setUnbindError] = useState('');

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

  return (
    <section className="tab-panel">
      <div className="section-head">
        <h2>Noma'lum signallar</h2>
      </div>
      <div className="pairing-hint glass">
        <span className="pairing-dot" />
        <p>
          <strong>Juftlash rejimi:</strong> fizik tugmani bosing — kodi shu yerda darhol paydo
          bo'ladi, keyin uni xonaga bog'lang.
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
        <table>
          <thead>
            <tr>
              <th>Kod</th>
              <th>Qurilma</th>
              <th>Birinchi ko'rilgan</th>
              <th>Oxirgi ko'rilgan</th>
              <th>Necha marta</th>
              <th>Xonaga bog'lash</th>
            </tr>
          </thead>
          <tbody>
            {signals.map((s) => (
              <SignalRow key={s.ev1527_code} signal={s} rooms={rooms} onBound={handleBound} />
            ))}
          </tbody>
        </table>
      </div>

      <div className="section-head">
        <h2>Bog'langan tugmalar</h2>
      </div>
      {unbindError && <p className="form-error">{unbindError}</p>}
      <div className="table-wrap glass">
        <table>
          <thead>
            <tr>
              <th>Kod</th>
              <th>Xona</th>
              <th>Qavat</th>
              <th>Amal</th>
            </tr>
          </thead>
          <tbody>
            {buttons.map((b) => (
              <tr key={b.id}>
                <td>{b.ev1527_code}</td>
                <td>{b.room_number}</td>
                <td>{b.floor}</td>
                <td>
                  <button className="btn btn-ghost btn-sm" onClick={() => unbind(b)} type="button">
                    Uzish
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
