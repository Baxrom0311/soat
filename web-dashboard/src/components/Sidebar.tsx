import type { ReactElement, ReactNode } from 'react';
import { CollapseIcon, HamburgerIcon, KeyIcon, LogoIcon, LogoutIcon } from './Icons';
import { ThemeToggle } from './ThemeToggle';

export type NavItem = {
  key: string;
  label: string;
  Icon: (props: { className?: string }) => ReactElement;
  onClick: () => void;
  active: boolean;
  group?: 'primary' | 'settings';
  count?: number;
};

export type ConnInfo = {
  status: 'connecting' | 'live' | 'disconnected';
  label: string;
};

interface SidebarProps {
  items: NavItem[];
  collapsed: boolean;
  onToggleCollapsed: () => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
  userName: string;
  userRole: string;
  onOpenPasswordModal: () => void;
  onLogout: () => void;
  conn?: ConnInfo;
}

export function Sidebar({
  items,
  collapsed,
  onToggleCollapsed,
  mobileOpen,
  onCloseMobile,
  userName,
  userRole,
  onOpenPasswordModal,
  onLogout,
  conn,
}: SidebarProps) {
  const primaryItems = items.filter((item) => item.group === 'primary' || item.key === 'calls' || item.key === 'overview');
  const settingsItems = items.filter((item) => !primaryItems.includes(item));

  const dotClass =
    conn?.status === 'live' ? 'dot dot--ok' : conn?.status === 'connecting' ? 'dot dot--attn' : 'dot dot--hollow';

  return (
    <>
      {mobileOpen && <div className="drawer-overlay" onClick={onCloseMobile} />}
      <aside className={`sidebar ${collapsed ? 'collapsed' : ''} ${mobileOpen ? 'mobile-open' : ''}`}>
        <div className="sidebar-header">
          <a href="/" className="brand">
            <span className="brand-mark">
              <LogoIcon />
            </span>
            <span className="brand-text">NurseCall</span>
          </a>
          <button className="sidebar-collapse-btn" onClick={onToggleCollapsed} type="button" aria-label="Toggle sidebar">
            <CollapseIcon />
          </button>
        </div>

        <nav className="sidebar-nav">
          {primaryItems.length > 0 && (
            <div className="sidebar-group sidebar-group--primary">
              {primaryItems.map(({ key, label, Icon, onClick, active, count }) => (
                <button
                  key={key}
                  className={`sidebar-item sidebar-item--primary ${active ? 'active' : ''}`}
                  onClick={onClick}
                  type="button"
                  title={label}
                >
                  <Icon className="sidebar-item-icon" />
                  <span className="sidebar-item-label">{label}</span>
                  {count !== undefined && count > 0 && (
                    <span className="sidebar-pill">{count}</span>
                  )}
                </button>
              ))}
            </div>
          )}

          {primaryItems.length > 0 && settingsItems.length > 0 && (
            <div className="sidebar-divider" aria-hidden="true" />
          )}

          {settingsItems.length > 0 && (
            <div className="sidebar-group sidebar-group--settings">
              <div className="sidebar-caption">SOZLAMALAR</div>
              {settingsItems.map(({ key, label, Icon, onClick, active, count }) => (
                <button
                  key={key}
                  className={`sidebar-item sidebar-item--settings ${active ? 'active' : ''}`}
                  onClick={onClick}
                  type="button"
                  title={label}
                >
                  <Icon className="sidebar-item-icon" />
                  <span className="sidebar-item-label">{label}</span>
                  {count !== undefined && count > 0 && (
                    <span className="sidebar-pill sidebar-pill--attn">{count}</span>
                  )}
                </button>
              ))}
            </div>
          )}
        </nav>

        <div className="sidebar-footer">
          {conn && (
            <div className="conn-static" title={conn.label}>
              <span className={dotClass} aria-hidden="true" />
              <span className="conn-label">{conn.label}</span>
            </div>
          )}
          <div className="sidebar-user">
            <span className="sidebar-user-text">
              <span className="sidebar-user-name">{userName}</span>
              <span className="sidebar-user-role">{userRole}</span>
            </span>
          </div>
          <div className="sidebar-actions">
            <ThemeToggle />
            <button
              className="icon-btn"
              onClick={onOpenPasswordModal}
              type="button"
              title="Parolni o'zgartirish"
              aria-label="Parolni o'zgartirish"
            >
              <KeyIcon />
            </button>
            <button className="icon-btn danger" onClick={onLogout} type="button" title="Chiqish" aria-label="Chiqish">
              <LogoutIcon />
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}

export function MobileTopbar({ onOpenMobile, children }: { onOpenMobile: () => void; children?: ReactNode }) {
  return (
    <header className="topbar-mobile">
      <button className="hamburger-btn" onClick={onOpenMobile} type="button" aria-label="Open menu">
        <HamburgerIcon />
      </button>
      <span className="brand-text">NurseCall</span>
      {children}
    </header>
  );
}
