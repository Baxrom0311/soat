import { useEffect, useState } from 'react';
import { api, ApiError } from '../../api/client';
import type { ContactRequest } from '../../api/types';
import { fmtDate } from './AdminClinicsTab';

import { ColumnPicker, useColumnVisibility, type ColumnDef } from '../common/ColumnPicker';

type ContactColKey = 'created_at' | 'name' | 'phone' | 'clinic_name' | 'message' | 'status' | 'actions';

const CONTACT_COLUMNS: ColumnDef<ContactColKey>[] = [
  { key: 'created_at', label: 'Sana' },
  { key: 'name', label: 'Ism' },
  { key: 'phone', label: 'Telefon' },
  { key: 'clinic_name', label: 'Klinika' },
  { key: 'message', label: 'Xabar' },
  { key: 'status', label: 'Holat' },
  { key: 'actions', label: 'Amallar' },
];

export function ContactRequestsTab() {
  const [requests, setRequests] = useState<ContactRequest[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [rowError, setRowError] = useState('');
  const [busyId, setBusyId] = useState<number | null>(null);

  const { visibleCols, toggleCol, resetCols } = useColumnVisibility<ContactColKey>(
    'nursecall.contact_requests.columns',
    CONTACT_COLUMNS
  );

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

  const filteredRequests = requests.filter((r) => {
    const q = search.toLowerCase();
    return (
      r.name.toLowerCase().includes(q) ||
      r.phone.toLowerCase().includes(q) ||
      (r.clinic_name && r.clinic_name.toLowerCase().includes(q)) ||
      (r.message && r.message.toLowerCase().includes(q))
    );
  });

  return (
    <section className="tab-panel">
      <header className="page-header-row">
        <div>
          <h1 className="page-header-title">Aloqa so'rovlari</h1>
          <p className="page-header-desc">Landing saytidan kelgan murojaatlar va lidiya so'rovlari.</p>
        </div>
        {pending > 0 && <span className="badge badge--attn">{pending} yangi</span>}
      </header>

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
          <div className="table-toolbar">
            <input
              type="text"
              className="table-search-input"
              placeholder="Ism, telefon yoki klinika bo'yicha qidirish…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span className="table-count-meta">{filteredRequests.length} ta so'rov</span>
              <ColumnPicker
                columns={CONTACT_COLUMNS}
                visibleCols={visibleCols}
                onToggle={toggleCol}
                onReset={resetCols}
              />
            </div>
          </div>
          <table>
            <thead>
              <tr>
                {visibleCols.created_at && <th>Sana</th>}
                {visibleCols.name && <th>Ism</th>}
                {visibleCols.phone && <th>Telefon</th>}
                {visibleCols.clinic_name && <th>Klinika</th>}
                {visibleCols.message && <th>Xabar</th>}
                {visibleCols.status && <th>Holat</th>}
                {visibleCols.actions && <th>Amallar</th>}
              </tr>
            </thead>
            <tbody>
              {filteredRequests.map((r) => (
                <tr key={r.id}>
                  {visibleCols.created_at && <td data-label="Sana">{fmtDate(r.created_at)}</td>}
                  {visibleCols.name && <td data-label="Ism">{r.name}</td>}
                  {visibleCols.phone && (
                    <td data-label="Telefon">
                      <a className="tel-link" href={`tel:${r.phone}`}>
                        {r.phone}
                      </a>
                    </td>
                  )}
                  {visibleCols.clinic_name && <td data-label="Klinika">{r.clinic_name || '—'}</td>}
                  {visibleCols.message && (
                    <td data-label="Xabar">
                      {r.message ? (
                        <span className="msg-cell" title={r.message}>
                          {r.message}
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>
                  )}
                  {visibleCols.status && (
                    <td data-label="Holat">
                      <span className={`sub-pill ${r.handled ? 'handled' : 'unhandled'}`}>
                        {r.handled ? 'bajarildi' : 'yangi'}
                      </span>
                    </td>
                  )}
                  {visibleCols.actions && (
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
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
