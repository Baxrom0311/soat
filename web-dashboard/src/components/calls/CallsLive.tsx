import { CallCard } from './CallCard';
import type { ActiveCall } from '../../api/types';
import type { ConnStatus } from '../../hooks/useCallsFeed';

interface Props {
  calls: ActiveCall[];
  onAck: (callId: number) => Promise<void>;
  connStatus: ConnStatus;
  now?: Date;
}

const CONN_LABEL: Record<ConnStatus, string> = {
  connecting: 'Ulanmoqda…',
  live: 'Ulanish faol',
  disconnected: 'Ulanish yoʻq',
};

export function CallsLive({ calls, onAck, connStatus, now }: Props) {
  // Oldest first, always. Position is the one ageing channel that survives colour
  // blindness, glare and a glance from the side, so it is never made optional.
  const ordered = [...calls].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );

  const clock = (now ?? new Date()).toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit' });

  return (
    <section className="calls-live">
      <header className="calls-live__head">
        <h1 className="calls-live__title">Chaqiruvlar</h1>
        {ordered.length > 0 && <span className="calls-live__pill">{ordered.length} faol</span>}
        <a className="btn btn-ghost btn-sm calls-live__wall" href="/wall" target="_blank" rel="noopener">
          Devor rejimi ↗
        </a>
      </header>

      {ordered.length === 0 ? (
        <div className="calls-live__empty">
          <p className="calls-live__empty-line">
            <span className="dot dot--ok" aria-hidden="true" /> Faol chaqiruv yo{'ʻ'}q
          </p>
          <p className="calls-live__empty-meta">
            {CONN_LABEL[connStatus]} · {clock}
          </p>
        </div>
      ) : (
        <div className="calls-live__grid">
          {ordered.map((c) => (
            <CallCard
              key={c.call_id}
              roomNumber={c.room_number}
              floor={c.floor}
              createdAt={c.created_at}
              onAck={() => onAck(c.call_id)}
              now={now}
            />
          ))}
        </div>
      )}
    </section>
  );
}
