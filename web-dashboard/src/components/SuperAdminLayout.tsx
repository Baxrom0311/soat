import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { ChangePasswordModal } from './ChangePasswordModal';
import { ClinicIcon, DevicesIcon, InboxIcon, OverviewIcon, PlanIcon } from './Icons';
import { MobileTopbar, Sidebar } from './Sidebar';
import { AdminClinicsTab } from './admin/AdminClinicsTab';
import { AdminDevicesTab } from './admin/AdminDevicesTab';
import { AdminOverviewTab } from './admin/AdminOverviewTab';
import { AdminPlansTab } from './admin/AdminPlansTab';
import { ContactRequestsTab } from './admin/ContactRequestsTab';

type TabKey = 'overview' | 'clinics' | 'plans' | 'devices' | 'requests';

const NAV_ITEMS: { key: TabKey; label: string; Icon: typeof OverviewIcon }[] = [
  { key: 'overview', label: 'Umumiy', Icon: OverviewIcon },
  { key: 'clinics', label: 'Klinikalar', Icon: ClinicIcon },
  { key: 'plans', label: 'Tariflar', Icon: PlanIcon },
  { key: 'devices', label: 'Qurilmalar', Icon: DevicesIcon },
  { key: 'requests', label: "So'rovlar", Icon: InboxIcon },
];

/** Superadmin shell: URL-synced tab navigation so refreshing F5 preserves the current subpage */
export function SuperAdminLayout() {
  const { session, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  const pathParts = location.pathname.split('/').filter(Boolean);
  const currentSubPath = pathParts[1] || 'overview';
  const validTabs: TabKey[] = ['overview', 'clinics', 'plans', 'devices', 'requests'];
  const tab: TabKey = validTabs.includes(currentSubPath as TabKey)
    ? (currentSubPath as TabKey)
    : 'overview';

  function setTab(nextTab: TabKey) {
    navigate(`/admin/${nextTab}`);
  }

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
          {tab === 'requests' && <ContactRequestsTab />}
        </main>
      </div>
    </div>
  );
}
