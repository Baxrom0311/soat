import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useCallsFeed } from '../hooks/useCallsFeed';
import { ChangePasswordModal } from './ChangePasswordModal';
import { CallsIcon, DevicesIcon, RoomsIcon, StaffIcon, UnassignedIcon } from './Icons';
import { MobileTopbar, Sidebar } from './Sidebar';
import { CallsTab } from './tabs/CallsTab';
import { DevicesTab } from './tabs/DevicesTab';
import { RoomsTab } from './tabs/RoomsTab';
import { UnassignedTab } from './tabs/UnassignedTab';
import { StaffTab } from './tabs/StaffTab';

type TabKey = 'calls' | 'devices' | 'rooms' | 'unassigned' | 'staff';

const NAV_ITEMS: { key: TabKey; label: string; Icon: typeof CallsIcon }[] = [
  { key: 'calls', label: 'Chaqiruvlar', Icon: CallsIcon },
  { key: 'devices', label: 'Qurilmalar', Icon: DevicesIcon },
  { key: 'rooms', label: 'Xonalar', Icon: RoomsIcon },
  { key: 'unassigned', label: "Noma'lum signallar", Icon: UnassignedIcon },
  { key: 'staff', label: 'Xodimlar', Icon: StaffIcon },
];

const CONN_LABEL: Record<string, string> = {
  connecting: 'ulanmoqda…',
  live: 'jonli ulanish',
  disconnected: 'uzildi, qayta ulanmoqda…',
};

export function DashboardLayout() {
  const { token, session, logout } = useAuth();
  const [tab, setTab] = useState<TabKey>('calls');
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const feed = useCallsFeed(token);

  const userName = session?.name ?? '';
  const userRole = session?.role ?? '';

  const navItems = NAV_ITEMS.map(({ key, label, Icon }) => ({
    key,
    label,
    Icon,
    active: tab === key,
    onClick: () => {
      setTab(key);
      setMobileOpen(false);
    },
  }));

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
          {tab === 'calls' && <CallsTab activeCalls={feed.activeCalls} history={feed.history} ackCall={feed.ackCall} />}
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
        </main>
      </div>
    </div>
  );
}
