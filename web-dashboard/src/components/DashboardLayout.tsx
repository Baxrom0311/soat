import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useCallsFeed } from '../hooks/useCallsFeed';
import { CallsIcon, DevicesIcon, LogoIcon, LogoutIcon, RoomsIcon, StaffIcon, UnassignedIcon } from './Icons';
import { ThemeToggle } from './ThemeToggle';
import { CallsTab } from './tabs/CallsTab';
import { DevicesTab } from './tabs/DevicesTab';
import { RoomsTab } from './tabs/RoomsTab';
import { UnassignedTab } from './tabs/UnassignedTab';
import { StaffTab } from './tabs/StaffTab';

type TabKey = 'calls' | 'devices' | 'rooms' | 'unassigned' | 'staff';

const TABS: { key: TabKey; label: string; Icon: typeof CallsIcon }[] = [
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
  const feed = useCallsFeed(token);

  const userChip = session ? `${session.name} (${session.role})` : '';

  return (
    <div className="app-screen">
      <header className="nav">
        <div className="nav-inner glass">
          <a href="/" className="brand">
            <span className="brand-mark">
              <LogoIcon />
            </span>
            NurseCall
          </a>
          <div className="nav-right">
            <div className="conn">
              <span className={`dot ${feed.connStatus === 'live' ? 'live' : ''}`} />
              <span>{CONN_LABEL[feed.connStatus]}</span>
            </div>
            <span className="nav-divider" />
            <ThemeToggle />
            <span className="user-chip">{userChip}</span>
            <button className="btn btn-ghost btn-sm" onClick={logout} type="button">
              <LogoutIcon />
              Chiqish
            </button>
          </div>
        </div>
      </header>

      <nav className="tabs-wrap">
        <div className="tabs glass">
          {TABS.map(({ key, label, Icon }) => (
            <button
              key={key}
              className={`tab-btn ${tab === key ? 'active' : ''}`}
              onClick={() => setTab(key)}
              type="button"
            >
              <Icon />
              {label}
            </button>
          ))}
        </div>
      </nav>

      <main className="wrap">
        {tab === 'calls' && <CallsTab activeCalls={feed.activeCalls} history={feed.history} ackCall={feed.ackCall} />}
        {tab === 'devices' && <DevicesTab />}
        {tab === 'rooms' && <RoomsTab />}
        {tab === 'unassigned' && (
          <UnassignedTab signals={feed.unassignedSignals} refreshSignals={feed.refreshUnassigned} />
        )}
        {tab === 'staff' && <StaffTab />}
      </main>
    </div>
  );
}
