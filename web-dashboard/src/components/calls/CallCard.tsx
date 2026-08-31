import { useEffect, useState } from 'react';
import { ageStep, elapsedLabel } from '../../lib/ageStep';
import './callcard.css';

export type CallCardSize = 'desk' | 'wall' | 'wallSolo';

export interface CallCardProps {
  roomNumber: string;
  floor: number;
  createdAt: string;
  size?: CallCardSize;
  /** Absent => display-only. /wall never passes this, so the wall cannot acknowledge a
   *  call: the guarantee lives in the type signature, not in a variant string a typo
   *  could defeat or a future third variant could silently escape. */
  onAck?: () => void | Promise<void>;
  /** Tests only: freezes the clock. */
  now?: Date;
}

const RAIL_SLOTS = 3;

export function CallCard({ roomNumber, floor, createdAt, size = 'desk', onAck, now }: CallCardProps) {
  // Re-render once a second so the timer counts and the step escalates between polls.
  const [, tick] = useState(0);
  useEffect(() => {
    if (now) return; // frozen clock in tests: no interval
    const id = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [now]);

  const [busy, setBusy] = useState(false);
  const step = ageStep(createdAt, now);

  async function handleAck() {
    if (!onAck || busy) return;
    setBusy(true);
    try {
      await onAck();
    } finally {
      setBusy(false);
    }
  }

  return (
    <article className="call-card" data-step={step} data-size={size}>
      <div className="call-card__rail" aria-hidden="true">
        {Array.from({ length: RAIL_SLOTS }, (_, i) => (
          <span key={i} data-rail-slot={i < step ? 'on' : 'off'} />
        ))}
      </div>

      <div className="call-card__body">
        <div className="call-card__room">{roomNumber}</div>
        <div className="call-card__meta">
          <span className="call-card__floor">{floor}-qavat</span>
          <span className="call-card__timer">{elapsedLabel(createdAt, now)}</span>
        </div>

        {onAck && (
          <button type="button" className="call-card__slab" onClick={handleAck} disabled={busy}>
            {busy ? 'Yuborilmoqda…' : 'Tasdiqlash'}
          </button>
        )}
      </div>
    </article>
  );
}
