import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CallCard } from '../components/calls/CallCard';
import { elapsedLabel } from '../lib/ageStep';
import { useAuth } from '../context/AuthContext';
import { useCallsFeed } from '../hooks/useCallsFeed';
import type { ActiveCall } from '../api/types';
import './wall.css';

const MAX_CARDS = 11; // 12 grid slots on 1920x1080; slot 12 is the overflow tile

const CONN_LABEL: Record<string, string> = {
  connecting: 'ulanmoqda…',
  live: 'jonli ulanish',
  disconnected: 'uzildi, qayta ulanmoqda…',
};

/** Exported separately so the display-only guarantee can be tested without the feed. */
export function WallGrid({ calls, now }: { calls: ActiveCall[]; now?: Date }) {
  const ordered = [...calls].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );

  if (ordered.length === 0) {
    return <div className="wall__empty">Faol chaqiruvlar yo'q</div>;
  }

  if (ordered.length === 1) {
    const c = ordered[0];
    // NOTE: no onAck. The wall cannot acknowledge; see CallCard's signature.
    return (
      <div className="wall__solo">
        <CallCard roomNumber={c.room_number} floor={c.floor} createdAt={c.created_at} size="wallSolo" now={now} />
      </div>
    );
  }

  const shown = ordered.slice(0, MAX_CARDS);
  const hidden = ordered.slice(MAX_CARDS);

  return (
    <div className="wall__grid">
      {shown.map((c) => (
        // NOTE: no onAck. The wall cannot acknowledge; see CallCard's signature.
        <CallCard key={c.call_id} roomNumber={c.room_number} floor={c.floor} createdAt={c.created_at} size="wall" now={now} />
      ))}
      {hidden.length > 0 && (
        <div className="wall__overflow">
          <span className="wall__overflow-count">+{hidden.length}</span>
          <span className="wall__overflow-meta">
            eng qadimgisi {elapsedLabel(hidden[hidden.length - 1].created_at, now)}
          </span>
        </div>
      )}
    </div>
  );
}

/** HH:MM with the colon blinking at 1Hz -- the cheapest possible proof that a wall
 *  monitor's tab is not frozen. Chrome only: the calls themselves never blink. */
function WallClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  const two = (n: number) => String(n).padStart(2, '0');
  return (
    <span className="wall__clock">
      {two(now.getHours())}
      <span className="wall__clock-colon">:</span>
      {two(now.getMinutes())}
    </span>
  );
}

/**
 * `/wall` -- a bookmarkable, display-only monitor for the nurses' station.
 *
 * It is impossible to acknowledge a call from here: CallCard's slab only renders when
 * `onAck` is passed, and this route never passes it. Anyone walking past a wall screen
 * must not be able to clear a call the way a nurse standing at a desk terminal can.
 */
export function WallView() {
  const { token, blocked } = useAuth();
  const feed = useCallsFeed(token, blocked);
  const [searchParams] = useSearchParams();
  const floorParam = searchParams.get('floor');
  const floor = floorParam !== null ? Number(floorParam) : null;

  useEffect(() => {
    const root = document.documentElement;
    const prev = root.getAttribute('data-theme');
    // A wall monitor runs 24/7 including night shifts: desk brightness is wrong in a
    // dark corridor.
    root.setAttribute('data-theme', 'dark');
    document.body.classList.add('wall-body');
    return () => {
      if (prev) root.setAttribute('data-theme', prev);
      else root.removeAttribute('data-theme');
      document.body.classList.remove('wall-body');
    };
  }, []);

  const calls = useMemo(() => {
    const all = [...feed.activeCalls.values()];
    if (floor === null || Number.isNaN(floor)) return all;
    return all.filter((c) => c.floor === floor);
  }, [feed.activeCalls, floor]);

  return (
    <div className="wall">
      <div className="wall__top">
        <span className="wall__title">
          NurseCall{floor !== null && !Number.isNaN(floor) ? ` — ${floor}-qavat` : ''}
        </span>
        <div className="wall__top-right">
          <div className="wall__conn" title={CONN_LABEL[feed.connStatus]}>
            <span className={`wall__dot ${feed.connStatus === 'live' ? 'wall__dot--live' : ''}`} />
          </div>
          <WallClock />
        </div>
      </div>
      <WallGrid calls={calls} />
    </div>
  );
}
