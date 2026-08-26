import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { ChangePasswordModal } from './ChangePasswordModal';
import { ClinicIcon, DevicesIcon, OverviewIcon, PlanIcon } from './Icons';
import { MobileTopbar, Sidebar } from './Sidebar';
import { AdminClinicsTab } from './admin/AdminClinicsTab';
import { AdminDevicesTab } from './admin/AdminDevicesTab';
import { AdminOverviewTab } from './admin/AdminOverviewTab';
import { AdminPlansTab } from './admin/AdminPlansTab';

type TabKey = 'overview' | 'clinics' | 'plans' | 'devices';

const NAV_ITEMS: { key: TabKey; label: string; Icon: typeof OverviewIcon }[] = [
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
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

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
      />

      {showPasswordModal && <ChangePasswordModal onClose={() => setShowPasswordModal(false)} />}

      <div className="app-body">
        <MobileTopbar onOpenMobile={() => setMobileOpen(true)} />

        <main className="content-area">
          {tab === 'overview' && <AdminOverviewTab />}
          {tab === 'clinics' && <AdminClinicsTab />}
          {tab === 'plans' && <AdminPlansTab />}
          {tab === 'devices' && <AdminDevicesTab />}
        </main>
      </div>
    </div>
  );
}
