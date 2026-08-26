import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useCallsFeed } from '../hooks/useCallsFeed';
import type { ClinicBillingNotice } from '../api/types';
import { ChangePasswordModal } from './ChangePasswordModal';
import {
  BillingIcon,
  CallsIcon,
  DevicesIcon,
  RoomsIcon,
  StaffIcon,
  UnassignedIcon,
  WarningIcon,
} from './Icons';
import { MobileTopbar, Sidebar } from './Sidebar';
import { SuspendedNotice } from './SuspendedScreen';
import { BillingTab } from './tabs/BillingTab';
import { CallsTab } from './tabs/CallsTab';
import { DevicesTab } from './tabs/DevicesTab';
import { RoomsTab } from './tabs/RoomsTab';
import { UnassignedTab } from './tabs/UnassignedTab';
import { StaffTab } from './tabs/StaffTab';

type TabKey = 'calls' | 'devices' | 'rooms' | 'unassigned' | 'staff' | 'billing';

type NavDef = { key: TabKey; label: string; Icon: typeof CallsIcon; adminOnly?: boolean };

const NAV_ITEMS: NavDef[] = [
  { key: 'calls', label: 'Chaqiruvlar', Icon: CallsIcon },
  { key: 'devices', label: 'Qurilmalar', Icon: DevicesIcon },
  { key: 'rooms', label: 'Xonalar', Icon: RoomsIcon },
  { key: 'unassigned', label: "Noma'lum signallar", Icon: UnassignedIcon },
  { key: 'staff', label: 'Xodimlar', Icon: StaffIcon },
  // Admin-only: the clinic's prices are not a nurse's business, and /clinic/billing
  // would 403 for her anyway.
  { key: 'billing', label: 'Obuna', Icon: BillingIcon, adminOnly: true },
];

/** Tabs the server withholds from a blocked clinic (they answer 402). 'calls' and
 *  'billing' are ungated by design and must stay usable while blocked. */
const BLOCKED_TABS: ReadonlySet<TabKey> = new Set<TabKey>([
  'devices',
  'rooms',
  'unassigned',
  'staff',
]);

const CONN_LABEL: Record<string, string> = {
  connecting: 'ulanmoqda…',
  live: 'jonli ulanish',
  disconnected: 'uzildi, qayta ulanmoqda…',
};

const NOTICE_POLL_MS = 120_000;

/**
 * Polls the one billing route every clinic member may read. It is the authoritative
 * source for "are we blocked / about to be": without it, the app would only find out
 * by having some unrelated management request fail with 402, and would never find out
 * that a payment has since un-blocked it.
 */
function useBillingNotice(token: string | null, setBlocked: (b: boolean) => void) {
  const [notice, setNotice] = useState<ClinicBillingNotice | null>(null);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;

    async function poll() {
      try {
        const data = await api.getClinicBillingNotice();
        if (cancelled) return;
        setNotice(data);
        setBlocked(data.blocked);
      } catch {
        // Non-critical: a failed poll must not disturb the call board.
      }
    }

    poll();
    const id = window.setInterval(poll, NOTICE_POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [token, setBlocked]);

  return notice;
}

export function DashboardLayout() {
  const { token, session, blocked, setBlocked, logout } = useAuth();
  const [tab, setTab] = useState<TabKey>('calls');
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const feed = useCallsFeed(token, blocked);
  const notice = useBillingNotice(token, setBlocked);

  const isAdmin = session?.role === 'admin';
  const userName = session?.name ?? '';
  const userRole = session?.role ?? '';

  const navItems = NAV_ITEMS.filter((item) => !item.adminOnly || isAdmin).map(
    ({ key, label, Icon }) => ({
      key,
      label,
      Icon,
      active: tab === key,
      onClick: () => {
        setTab(key);
        setMobileOpen(false);
      },
    })
  );

  const tabBlocked = blocked && BLOCKED_TABS.has(tab);
  const openBilling = isAdmin ? () => setTab('billing') : undefined;
  const warnOnly = !blocked && notice?.warn === true;

  return (
    <div className={`app-screen app-screen--sidebar ${collapsed ? 'collapsed' : ''}`}>
      <Sidebar
        items={navItems}
        collapsed={collapsed}
        onToggleCollapsed={() => setCollapsed((v) => !v)}
        mobileOpen={mobileOpen}
        onCloseMobile={() => setMobileOpen(false)}
        userName={userName}
        userRole={userRole}
        onOpenPasswordModal={() => setShowPasswordModal(true)}
        onLogout={logout}
        conn={{ status: feed.connStatus, label: CONN_LABEL[feed.connStatus] }}
      />

      {showPasswordModal && <ChangePasswordModal onClose={() => setShowPasswordModal(false)} />}

      <div className="app-body">
        <MobileTopbar onOpenMobile={() => setMobileOpen(true)}>
          <div className="conn">
            <span className={`dot ${feed.connStatus === 'live' ? 'live' : ''}`} />
          </div>
        </MobileTopbar>

        <main className="content-area">
          {(blocked || warnOnly) && (
            <div className={`billing-banner ${blocked ? 'billing-banner--blocked' : ''}`}>
              <WarningIcon className="billing-banner__icon" />
              <p className="billing-banner__text">
                {blocked
                  ? "Klinika obunasi to'lanmagan: sozlamalar bo'limlari yopilgan. Chaqiruvlar paneli ishlashda davom etadi."
                  : notice?.days_left !== null && notice?.days_left !== undefined
                    ? `Obuna muddati tugayapti: ${notice.days_left} kun qoldi.`
                    : 'Obuna muddati tugayapti.'}
              </p>
              {openBilling ? (
                <button className="btn btn-primary btn-sm" type="button" onClick={openBilling}>
                  Obuna
                </button>
              ) : (
                <span className="billing-banner__hint">Klinika administratoriga xabar bering.</span>
              )}
            </div>
          )}

          {tab === 'calls' && (
            <CallsTab
              activeCalls={feed.activeCalls}
              history={feed.history}
              ackCall={feed.ackCall}
              historyBlocked={blocked}
            />
          )}
          {tabBlocked ? (
            <SuspendedNotice onOpenBilling={openBilling} />
          ) : (
            <>
              {tab === 'devices' && <DevicesTab />}
              {tab === 'rooms' && <RoomsTab />}
              {tab === 'unassigned' && (
                <UnassignedTab
                  signals={feed.unassignedSignals}
                  refreshSignals={feed.refreshUnassigned}
                  markLocalMutation={feed.markLocalMutation}
                />
              )}
              {tab === 'staff' && <StaffTab />}
            </>
          )}
          {tab === 'billing' && isAdmin && <BillingTab />}
        </main>
      </div>
    </div>
  );
}
