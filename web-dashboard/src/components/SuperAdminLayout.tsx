import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { ChangePasswordModal } from './ChangePasswordModal';
import { ClinicIcon, DevicesIcon, LogoIcon, LogoutIcon, OverviewIcon, PlanIcon } from './Icons';
import { ThemeToggle } from './ThemeToggle';
import { AdminClinicsTab } from './admin/AdminClinicsTab';
import { AdminDevicesTab } from './admin/AdminDevicesTab';
import { AdminOverviewTab } from './admin/AdminOverviewTab';
import { AdminPlansTab } from './admin/AdminPlansTab';

type TabKey = 'overview' | 'clinics' | 'plans' | 'devices';

const TABS: { key: TabKey; label: string; Icon: typeof OverviewIcon }[] = [
  { key: 'overview', label: 'Umumiy', Icon: OverviewIcon },
  { key: 'clinics', label: 'Klinikalar', Icon: ClinicIcon },
  { key: 'plans', label: 'Tariflar', Icon: PlanIcon },
  { key: 'devices', label: 'Qurilmalar', Icon: DevicesIcon },
];

/** Superadmin shell: no clinic WS feed — all data comes from the /admin REST endpoints. */
export function SuperAdminLayout() {
  const { session, logout } = useAuth();
  const [tab, setTab] = useState<TabKey>('overview');
  const [showPasswordModal, setShowPasswordModal] = useState(false);

  const userChip = session ? `${session.name} (${session.role})` : '';

  return (
    <div className="app-screen">
      <header className="nav">
        <div className="nav-inner glass">
          <a href="/" className="brand">
            <span className="brand-mark">
              <LogoIcon />
            </span>
            <span className="brand-text">NurseCall</span>
          </a>
          <div className="nav-right">
            <ThemeToggle />
            <span className="user-chip">{userChip}</span>
            <button className="btn btn-ghost btn-sm" onClick={() => setShowPasswordModal(true)} type="button">
              Parol
            </button>
            <button className="btn btn-ghost btn-sm" onClick={logout} type="button">
              <LogoutIcon />
              Chiqish
            </button>
          </div>
        </div>
      </header>

      {showPasswordModal && <ChangePasswordModal onClose={() => setShowPasswordModal(false)} />}

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
        {tab === 'overview' && <AdminOverviewTab />}
        {tab === 'clinics' && <AdminClinicsTab />}
        {tab === 'plans' && <AdminPlansTab />}
        {tab === 'devices' && <AdminDevicesTab />}
      </main>
    </div>
  );
}
