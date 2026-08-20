import { useEffect, useState } from 'react';
import { api, ApiError } from '../../api/client';
import type { AdminOverview } from '../../api/types';

const POLL_MS = 10000;

export function AdminOverviewTab() {
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    async function load() {
      try {
        setOverview(await api.getAdminOverview());
        setError('');
      } catch (err) {
        setError(err instanceof ApiError ? err.message : 'Server bilan aloqa xato');
      }
    }
    load();
    const id = window.setInterval(load, POLL_MS);
    return () => window.clearInterval(id);
  }, []);

  return (
    <section className="tab-panel">
      <div className="section-head">
        <h2>Umumiy ko'rinish</h2>
      </div>
      {error && <p className="auth-error">{error}</p>}
      <div className="stat-grid">
        <div className="stat-card glass">
          <p className="stat-label">Klinikalar</p>
          <p className="stat-value">{overview ? overview.clinics : '—'}</p>
        </div>
        <div className="stat-card glass">
          <p className="stat-label">Qurilmalar (jami)</p>
          <p className="stat-value">{overview ? overview.devices_total : '—'}</p>
        </div>
        <div className="stat-card glass">
          <p className="stat-label">Qurilmalar (onlayn)</p>
          <p className="stat-value stat-ok">{overview ? overview.devices_online : '—'}</p>
        </div>
        <div className="stat-card glass">
          <p className="stat-label">Faol chaqiruvlar</p>
          <p className={`stat-value ${overview && overview.active_calls_total > 0 ? 'stat-warn' : ''}`}>
            {overview ? overview.active_calls_total : '—'}
          </p>
        </div>
      </div>
    </section>
  );
}
