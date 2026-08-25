import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { api, ApiError } from '../../api/client';
import type { Room } from '../../api/types';
import { PlusIcon } from '../Icons';

export function RoomsTab() {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [roomNumber, setRoomNumber] = useState('');
  const [floor, setFloor] = useState('');
  const [error, setError] = useState('');
  const [loadError, setLoadError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editRoomNumber, setEditRoomNumber] = useState('');
  const [editFloor, setEditFloor] = useState('');
  const [editError, setEditError] = useState('');
  const [editBusy, setEditBusy] = useState(false);

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
      await api.createRoom({ room_number: roomNumber, floor: Number(floor) });
      setRoomNumber('');
      setFloor('');
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Server bilan aloqa xato');
    } finally {
      setSubmitting(false);
    }
  }

  function startEdit(r: Room) {
    setEditingId(r.id);
    setEditRoomNumber(r.room_number);
    setEditFloor(String(r.floor));
    setEditError('');
  }

  async function saveEdit(roomId: number) {
    setEditError('');
    setEditBusy(true);
    try {
      await api.updateRoom(roomId, { room_number: editRoomNumber, floor: Number(editFloor) });
      setEditingId(null);
      await load();
    } catch (err) {
      setEditError(err instanceof ApiError ? err.message : 'Server bilan aloqa xato');
    } finally {
      setEditBusy(false);
    }
  }

  return (
    <section className="tab-panel">
      <div className="section-head">
        <h2>Xonalar</h2>
      </div>

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
          <table>
            <thead>
              <tr>
                <th>Xona</th>
                <th>Qavat</th>
                <th>Amallar</th>
              </tr>
            </thead>
            <tbody>
              {rooms.map((r) =>
                editingId === r.id ? (
                  <tr key={r.id}>
                    <td data-label="Xona">
                      <input
                        type="text"
                        className="table-input"
                        value={editRoomNumber}
                        onChange={(e) => setEditRoomNumber(e.target.value)}
                      />
                    </td>
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
                    <td data-label="Amallar">
                      <div className="row-actions">
                        <button
                          className="btn btn-primary btn-sm"
                          onClick={() => saveEdit(r.id)}
                          disabled={editBusy}
                          type="button"
                        >
                          Saqlash
                        </button>
                        <button
                          className="btn btn-ghost btn-sm"
                          onClick={() => setEditingId(null)}
                          type="button"
                        >
                          Bekor
                        </button>
                      </div>
                      {editError && <p className="form-error">{editError}</p>}
                    </td>
                  </tr>
                ) : (
                  <tr key={r.id}>
                    <td data-label="Xona">{r.room_number}</td>
                    <td data-label="Qavat">{r.floor}</td>
                    <td data-label="Amallar">
                      <button className="btn btn-ghost btn-sm" onClick={() => startEdit(r)} type="button">
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
    </section>
  );
}
