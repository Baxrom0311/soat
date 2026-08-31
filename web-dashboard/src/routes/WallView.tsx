import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CallCard } from '../components/calls/CallCard';
import { elapsedLabel } from '../lib/ageStep';
import { useCallsFeed } from '../hooks/useCallsFeed';
import { useAuth } from '../context/AuthContext';
import type { ActiveCall } from '../api/types';
import './wall.css';

const MAX_CARDS = 11; // 12 grid slots on 1920x1080; slot 12 is the overflow tile

/** Exported separately so the display-only guarantee can be tested without the feed. */
export function WallGrid({ calls, now }: { calls: ActiveCall[]; now?: Date }) {
  const ordered = [...calls].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );

  if (ordered.length === 0) {
    return null;
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

export function WallView() {
  const [searchParams] = useSearchParams();
  const floorParam = searchParams.get('floor');
  const targetFloor = floorParam ? parseInt(floorParam, 10) : null;

  const { token } = useAuth();
  const { activeCalls, connStatus } = useCallsFeed(token);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const root = document.documentElement;
    const prev = root.getAttribute('data-theme');
    root.setAttribute('data-theme', 'dark');
    document.body.classList.add('wall-body');
    return () => {
      if (prev) root.setAttribute('data-theme', prev);
      else root.removeAttribute('data-theme');
      document.body.classList.remove('wall-body');
    };
  }, []);

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const allCalls = [...activeCalls.values()];
  const filteredCalls = targetFloor !== null && !isNaN(targetFloor)
    ? allCalls.filter((c) => c.floor === targetFloor)
    : allCalls;

  const hours = now.getHours().toString().padStart(2, '0');
  const minutes = now.getMinutes().toString().padStart(2, '0');

  const dotClass =
    connStatus === 'live' ? 'dot dot--ok' : connStatus === 'connecting' ? 'dot dot--attn' : 'dot dot--hollow';

  const connText =
    connStatus === 'live' ? 'Ulangan' : connStatus === 'connecting' ? 'Qayta ulanmoqda' : 'Ulanish yoʻq';

  return (
    <div className="wall">
      <header className="wall__top">
        <span className="wall__clinic-name">NurseCall</span>
        <div className="wall__top-right">
          <span className="wall__clock">
            {hours}<span className="wall__clock-colon">:</span>{minutes}
          </span>
          <span className="wall__conn">
            <span className={dotClass} aria-hidden="true" />
            {connText}
          </span>
        </div>
      </header>

      {filteredCalls.length === 0 ? (
        <div className="wall__empty">
          <div className="wall__empty-clock">
            {hours}<span className="wall__clock-colon">:</span>{minutes}
          </div>
          <div className="wall__empty-title">Faol chaqiruv yoʻq</div>
          <div className="wall__empty-conn">
            <span className={dotClass} aria-hidden="true" />
            {connText}
          </div>
        </div>
      ) : (
        <WallGrid calls={filteredCalls} now={now} />
      )}
    </div>
  );
}
