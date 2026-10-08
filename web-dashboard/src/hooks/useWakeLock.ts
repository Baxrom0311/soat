import { useEffect } from 'react';

type WakeLockSentinelLike = { release: () => Promise<void> };
type WakeLockLike = { request: (type: 'screen') => Promise<WakeLockSentinelLike> };

/**
 * Keeps the screen on while the component is mounted.
 *
 * The wall view runs on a corridor TV or a spare laptop that nobody touches, and an OS
 * that dims and locks it after ten idle minutes turns the call board into a black
 * rectangle. Browsers drop the lock whenever the page is hidden, so it is requested
 * again each time the page comes back. Unsupported browsers simply keep their default.
 */
export function useWakeLock(): void {
  useEffect(() => {
    const wakeLock = (navigator as Navigator & { wakeLock?: WakeLockLike }).wakeLock;
    if (!wakeLock) return;

    let sentinel: WakeLockSentinelLike | null = null;
    let disposed = false;

    const acquire = async () => {
      if (document.visibilityState !== 'visible') return;
      try {
        const next = await wakeLock.request('screen');
        if (disposed) {
          next.release().catch(() => {});
        } else {
          sentinel = next;
        }
      } catch {
        // Refused (battery saver, permissions policy): nothing else to try.
      }
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible') acquire();
    };

    acquire();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      disposed = true;
      document.removeEventListener('visibilitychange', onVisible);
      sentinel?.release().catch(() => {});
    };
  }, []);
}
