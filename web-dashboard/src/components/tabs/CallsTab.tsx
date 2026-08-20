import { useEffect, useState } from 'react';
import type { ActiveCall, HistoryCall } from '../../api/types';

interface CallsTabProps {
  activeCalls: Map<number, ActiveCall>;
  history: HistoryCall[];
  ackCall: (callId: number) => Promise<void>;
}

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function ageBucket(seconds: number): number {
  if (seconds >= 120) return 3;
  if (seconds >= 60) return 2;
  if (seconds >= 15) return 1;
  return 0;
}

function timerClass(seconds: number): string {
  if (seconds >= 120) return 't-danger';
  if (seconds >= 60) return 't-warn';
  return '';
}

function fmtElapsed(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function CallCard({ call, now, onAck }: { call: ActiveCall; now: number; onAck: (id: number) => void }) {
  const [busy, setBusy] = useState(false);
  const seconds = Math.max(0, Math.floor((now - new Date(call.created_at).getTime()) / 1000));

  async function handleAck() {
    setBusy(true);
    try {
      await onAck(call.call_id);
    } catch {
      setBusy(false);
    }
  }

  return (
    <div className={`call-card age-${ageBucket(seconds)}`}>
      <div className="room">Xona {call.room_number}</div>
      <div className="floor">{call.floor}-qavat</div>
      <div className={`timer ${timerClass(seconds)}`}>{fmtElapsed(seconds)}</div>
      <button className="ack-btn" disabled={busy} onClick={handleAck}>
        {busy ? '...' : 'Qabul qilindi'}
      </button>
    </div>
  );
}

export function CallsTab({ activeCalls, history, ackCall }: CallsTabProps) {
  const [now, setNow] = useState(() => Date.now());
  const [ackError, setAckError] = useState('');

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const sorted = [...activeCalls.values()].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );

  async function handleAck(callId: number) {
    setAckError('');
    try {
      await ackCall(callId);
    } catch (err) {
      setAckError(err instanceof Error ? err.message : 'Xato');
      // rethrow so CallCard knows the ack failed and re-enables its button
      throw err;
    }
  }

  return (
    <section className="tab-panel">
      <div className="section-head">
        <h2>Faol chaqiruvlar</h2>
        <span className={`count-badge ${sorted.length === 0 ? 'zero' : ''}`}>{sorted.length}</span>
      </div>
      {ackError && <p className="auth-error">{ackError}</p>}
      <div className="active-grid">
        {sorted.length === 0 ? (
          <p className="empty-msg">Hozircha faol chaqiruvlar yo'q.</p>
        ) : (
          sorted.map((call) => <CallCard key={call.call_id} call={call} now={now} onAck={handleAck} />)
        )}
      </div>

      <h2 className="hist-title">Tarix (oxirgi 50 ta)</h2>
      <div className="table-wrap glass">
        <table>
          <thead>
            <tr>
              <th>Xona</th>
              <th>Qavat</th>
              <th>Holat</th>
              <th>Yaratildi</th>
              <th>Javob berildi</th>
              <th>Kim</th>
            </tr>
          </thead>
          <tbody>
            {history.map((item) => (
              <tr key={item.call_id}>
                <td>{item.room_number}</td>
                <td>{item.floor}</td>
                <td>
                  <span className={`status-pill ${item.status}`}>
                    {item.status === 'active' ? 'Faol' : 'Qabul qilindi'}
                  </span>
                </td>
                <td>{fmtTime(item.created_at)}</td>
                <td>{item.acknowledged_at ? fmtTime(item.acknowledged_at) : '—'}</td>
                <td>{item.acknowledged_by || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
