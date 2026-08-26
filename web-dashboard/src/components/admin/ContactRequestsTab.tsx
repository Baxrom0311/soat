import { useEffect, useState } from 'react';
import { api, ApiError } from '../../api/client';
import type { ContactRequest } from '../../api/types';
import { fmtDate } from './AdminClinicsTab';

export function ContactRequestsTab() {
  const [requests, setRequests] = useState<ContactRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [rowError, setRowError] = useState('');
  const [busyId, setBusyId] = useState<number | null>(null);

  async function load() {
    setLoadError('');
    setLoading(true);
    try {
      setRequests(await api.getContactRequests());
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : "So'rovlarni yuklab bo'lmadi");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function markHandled(id: number) {
    setRowError('');
    setBusyId(id);
    try {
      const updated = await api.markContactRequestHandled(id);
      setRequests((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
    } catch (err) {
      setRowError(err instanceof ApiError ? err.message : 'Server bilan aloqa xato');
    } finally {
      setBusyId(null);
    }
  }

  const pending = requests.filter((r) => !r.handled).length;

  return (
    <section className="tab-panel">
      <div className="section-head">
        <h2>So'rovlar</h2>
        <span className={`count-badge ${pending === 0 ? 'zero' : ''}`}>{pending}</span>
      </div>

      {rowError && <p className="form-error">{rowError}</p>}

      {loadError ? (
        <div className="form-error">
          {loadError}{' '}
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => load()}>
            Qayta urinish
          </button>
        </div>
      ) : loading ? (
        <p className="empty-msg">Yuklanmoqda...</p>
      ) : requests.length === 0 ? (
        <p className="empty-msg">Hozircha so'rovlar yo'q. Saytdan kelgan murojaatlar shu yerda ko'rinadi.</p>
      ) : (
        <div className="table-wrap glass">
          <table>
            <thead>
              <tr>
                <th>Sana</th>
                <th>Ism</th>
                <th>Telefon</th>
                <th>Klinika</th>
                <th>Xabar</th>
                <th>Holat</th>
                <th>Amallar</th>
              </tr>
            </thead>
            <tbody>
              {requests.map((r) => (
                <tr key={r.id}>
                  <td data-label="Sana">{fmtDate(r.created_at)}</td>
                  <td data-label="Ism">{r.name}</td>
                  <td data-label="Telefon">
                    <a className="tel-link" href={`tel:${r.phone}`}>
                      {r.phone}
                    </a>
                  </td>
                  <td data-label="Klinika">{r.clinic_name || '—'}</td>
                  <td data-label="Xabar">
                    {r.message ? (
                      <span className="msg-cell" title={r.message}>
                        {r.message}
                      </span>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td data-label="Holat">
                    <span className={`sub-pill ${r.handled ? 'handled' : 'unhandled'}`}>
                      {r.handled ? 'bajarildi' : 'yangi'}
                    </span>
                  </td>
                  <td data-label="Amallar">
                    {!r.handled && (
                      <div className="row-actions">
                        <button
                          className="btn btn-ghost btn-sm"
                          type="button"
                          disabled={busyId === r.id}
                          onClick={() => markHandled(r.id)}
                        >
                          Bajarildi
                        </button>
                      </div>
                    )}
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
