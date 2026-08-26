import { WarningIcon } from './Icons';

/**
 * Shown IN PLACE OF a single management tab's content when the clinic is
 * billing-blocked (i.e. the server answered that tab's request with 402).
 *
 * This used to be a full-screen takeover mounted from App.tsx. It no longer is: the
 * backend only 402s clinic management, while live calls, acknowledgment and the
 * clinic's own "Obuna" screen stay open by design. Taking the whole app over would
 * blank the active-call board and hide the screen that explains how to pay, so the
 * notice is now scoped to exactly the tabs that are actually withheld.
 */
export function SuspendedNotice({ onOpenBilling }: { onOpenBilling?: () => void }) {
  return (
    <div className="panel-card glass blocked-notice">
      <WarningIcon className="blocked-notice__icon" />
      <h3 className="blocked-notice__title">Bu bo'lim vaqtincha yopilgan</h3>
      <p className="blocked-notice__text">
        Klinika obunasi to'lanmagani uchun sozlamalar bo'limlari (xodimlar, xonalar,
        qurilmalar, tarix) vaqtincha yopildi. Chaqiruvlar paneli ishlashda davom etadi —
        bemor tugmani bosganda hamshira ko'radi va qabul qila oladi.
      </p>
      {onOpenBilling && (
        <button className="btn btn-primary" type="button" onClick={onOpenBilling}>
          Obuna sahifasiga o'tish
        </button>
      )}
    </div>
  );
}
