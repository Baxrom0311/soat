import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CallCard } from '../components/calls/CallCard';
import { elapsedLabel } from '../lib/ageStep';
import { useAuth } from '../context/AuthContext';
import { useCallsFeed, type ConnStatus } from '../hooks/useCallsFeed';
import type { ActiveCall } from '../api/types';
import './wall.css';

const MAX_CARDS = 11; // 12 grid slots on 1920x1080; slot 12 is the overflow tile

/**
 * §6.2's three connection visuals. `connecting` (no connection has ever been
 * established this session) reads as a neutral "no connection" ring rather than
 * something alarming; `disconnected` (a socket that WAS live and dropped, and is
 * actively retrying) is the one that should read as attn -- it is the state a nurse
 * actually needs to notice.
 */
const CONN_VISUAL: Record<ConnStatus, { dotClass: string; label: string }> = {
  connecting: { dotClass: 'wall__dot--off', label: 'Ulanish yoʻq' },
  live: { dotClass: 'wall__dot--live', label: 'Ulangan' },
  disconnected: { dotClass: 'wall__dot--attn', label: 'Qayta ulanmoqda' },
};

/** Status dot + visible label. Rendering the label only in a `title` attribute is
 *  useless on a route where the cursor is hidden and nobody hovers. */
function ConnBadge({ status }: { status: ConnStatus }) {
  const visual = CONN_VISUAL[status];
  return (
    <span className="wall__conn">
      <span className={`wall__dot ${visual.dotClass}`} />
      <span className="wall__conn-label">{visual.label}</span>
    </span>
  );
}

/** HH:MM with the colon blinking at 1Hz -- the cheapest possible proof that a wall
 *  monitor's tab is not frozen. Chrome only: the calls themselves never blink.
 *  `variant` selects the top-bar size (40/700 text-1) vs. the empty-state size
 *  (96/700 text-2) per §6.2. */
function WallClock({ variant }: { variant: 'bar' | 'empty' }) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  const two = (n: number) => String(n).padStart(2, '0');
  return (
    <span className={`wall__clock wall__clock--${variant}`}>
      {two(now.getHours())}
      <span className="wall__clock-colon">:</span>
      {two(now.getMinutes())}
    </span>
  );
}

/**
 * Exported separately so the display-only guarantee can be tested without the feed.
 * Handles calls.length >= 1 only -- the zero-call case is a dedicated full-screen
 * state (`WallEmpty`), not a branch of the grid.
 */
export function WallGrid({ calls, now }: { calls: ActiveCall[]; now?: Date }) {
  const ordered = [...calls].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );

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
            {/* hidden is ascending oldest->newest (same sort as `ordered`); hidden[0] is
                the OLDEST hidden call -- the one a triage decision actually needs, not
                hidden[hidden.length - 1] which is the newest and least urgent of the lot. */}
            eng qadimgisi {elapsedLabel(hidden[0].created_at, now)}
          </span>
        </div>
      )}
    </div>
  );
}

/**
 * §6.2's empty state: black page, one centred clock, the message beneath it, and the
 * connection dot. Deliberately no green tick, no "all calm" badge -- a wall that
 * congratulates itself when idle trains everyone in the corridor to stop looking at it.
 */
export function WallEmpty({ connStatus }: { connStatus: ConnStatus }) {
  return (
    <div className="wall__emptyscreen">
      <WallClock variant="empty" />
      <p className="wall__empty-msg">Faol chaqiruv yoʻq</p>
      <ConnBadge status={connStatus} />
    </div>
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

  if (calls.length === 0) {
    return (
      <div className="wall wall--empty">
        <WallEmpty connStatus={feed.connStatus} />
      </div>
    );
  }

  return (
    <div className="wall">
      <div className="wall__top">
        <span className="wall__title">
          NurseCall{floor !== null && !Number.isNaN(floor) ? ` — ${floor}-qavat` : ''}
        </span>
        <div className="wall__top-right">
          <WallClock variant="bar" />
          <ConnBadge status={feed.connStatus} />
        </div>
      </div>
      <WallGrid calls={calls} />
    </div>
  );
}
