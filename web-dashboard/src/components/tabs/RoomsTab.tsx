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

  async function load() {
    setRooms(await api.getRooms());
  }

  useEffect(() => {
    load();
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    try {
      await api.createRoom({ room_number: roomNumber, floor: Number(floor) });
      setRoomNumber('');
      setFloor('');
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Server bilan aloqa xato');
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
            value={floor}
            onChange={(e) => setFloor(e.target.value)}
          />
          <button type="submit" className="btn btn-primary">
            Qo'shish
          </button>
        </form>
        {error && <p className="form-error">{error}</p>}
      </div>

      <div className="table-wrap glass">
        <table>
          <thead>
            <tr>
              <th>Xona</th>
              <th>Qavat</th>
            </tr>
          </thead>
          <tbody>
            {rooms.map((r) => (
              <tr key={r.id}>
                <td>{r.room_number}</td>
                <td>{r.floor}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
