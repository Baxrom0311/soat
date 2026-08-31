import { CallsLive } from '../calls/CallsLive';
import type { ActiveCall, HistoryCall } from '../../api/types';
import type { ConnStatus } from '../../hooks/useCallsFeed';

interface CallsTabProps {
  activeCalls: Map<number, ActiveCall>;
  history: HistoryCall[];
  ackCall: (callId: number) => Promise<void>;
  connStatus?: ConnStatus;
  /** Call HISTORY is a management route and answers 402 for a blocked clinic — the
   *  live board above it is ungated and keeps working. */
  historyBlocked?: boolean;
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

export function CallsTab({ activeCalls, history, ackCall, connStatus = 'live', historyBlocked = false }: CallsTabProps) {
  return (
    <section className="tab-panel">
      <CallsLive calls={[...activeCalls.values()]} onAck={ackCall} connStatus={connStatus} />

      <h2 className="hist-title" style={{ marginTop: 'var(--space-32)' }}>Bugungi tarix (oxirgi 50 ta)</h2>
      {historyBlocked ? (
        <p className="empty-msg">
          Obuna to'lanmagani uchun tarix vaqtincha yopilgan. Yuqoridagi faol chaqiruvlar
          paneli ishlashda davom etadi.
        </p>
      ) : (
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
                <td data-label="Xona">{item.room_number}</td>
                <td data-label="Qavat">{item.floor}</td>
                <td data-label="Holat">
                  <span className={`status-pill ${item.status}`}>
                    {item.status === 'active' ? 'Faol' : 'Qabul qilindi'}
                  </span>
                </td>
                <td data-label="Yaratildi">{fmtTime(item.created_at)}</td>
                <td data-label="Javob berildi">{item.acknowledged_at ? fmtTime(item.acknowledged_at) : '—'}</td>
                <td data-label="Kim">{item.acknowledged_by || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      )}
    </section>
  );
}
