import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { api, ApiError } from '../../api/client';
import type { Room } from '../../api/types';
import { PlusIcon } from '../Icons';

function EditRoomModal({
  room,
  onClose,
  onUpdated,
}: {
  room: Room;
  onClose: () => void;
  onUpdated: () => void;
}) {
  const [roomNumber, setRoomNumber] = useState(room.room_number);
  const [floor, setFloor] = useState(String(room.floor));
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await api.updateRoom(room.id, {
        room_number: roomNumber.trim(),
        floor: Number(floor),
      });
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
        `"${room.room_number}-xona" tizimdan to'liq o'chirilsinmi?`
      )
    ) {
      return;
    }
    setError('');
    setDeleting(true);
    try {
      await api.deleteRoom(room.id);
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
        <h3>Xonani tahrirlash — {room.room_number}-xona</h3>
        <p className="modal-sub">
          Xona raqami yoki qavatini o'zgartirishingiz yoxud xonani o'chirishingiz mumkin.
        </p>

        <form onSubmit={handleSave} style={{ marginTop: 16 }}>
          <div className="form-group" style={{ marginBottom: 14 }}>
            <label>Xona raqami</label>
            <input
              type="text"
              className="table-input"
              style={{ width: '100%', padding: '10px 14px' }}
              value={roomNumber}
              onChange={(e) => setRoomNumber(e.target.value)}
              required
            />
          </div>

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

export function RoomsTab() {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [search, setSearch] = useState('');
  const [roomNumber, setRoomNumber] = useState('');
  const [floor, setFloor] = useState('');
  const [error, setError] = useState('');
  const [loadError, setLoadError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const [editingRoom, setEditingRoom] = useState<Room | null>(null);

  async function load() {
    setLoadError('');
    try {
      setRooms(await api.getRooms());
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : "Xonalarni yuklab bo'lmadi");
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
      await api.createRoom({ room_number: roomNumber.trim(), floor: Number(floor) });
      setRoomNumber('');
      setFloor('');
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Server bilan aloqa xato');
    } finally {
      setSubmitting(false);
    }
  }

  const filteredRooms = rooms.filter(
    (r) =>
      r.room_number.toLowerCase().includes(search.toLowerCase()) ||
      String(r.floor).includes(search)
  );

  return (
    <section className="tab-panel">
      {editingRoom && (
        <EditRoomModal
          room={editingRoom}
          onClose={() => setEditingRoom(null)}
          onUpdated={load}
        />
      )}

      <header className="page-header-row">
        <div>
          <h1 className="page-header-title">Xonalar</h1>
          <p className="page-header-desc">Klinikadagi palatalar va xonalarni ro'yxati hamda boshqaruvi.</p>
        </div>
      </header>

      <div className="panel-card glass">
        <h3>
          <PlusIcon /> Yangi xona qo'shish
        </h3>
        <form className="inline-form" onSubmit={handleSubmit}>
          <input
            type="text"
            placeholder="Xona raqami (masalan 214)"
            required
            value={roomNumber}
            onChange={(e) => setRoomNumber(e.target.value)}
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
              placeholder="Xona raqami yoki qavat bo'yicha qidirish…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <span className="table-count-meta">{filteredRooms.length} ta xona</span>
          </div>
          <table>
            <thead>
              <tr>
                <th>Xona</th>
                <th>Qavat</th>
                <th>Amallar</th>
              </tr>
            </thead>
            <tbody>
              {filteredRooms.map((r) => (
                <tr key={r.id}>
                  <td data-label="Xona">{r.room_number}</td>
                  <td data-label="Qavat">{r.floor}</td>
                  <td data-label="Amallar">
                    <button className="btn btn-ghost btn-sm" onClick={() => setEditingRoom(r)} type="button">
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
