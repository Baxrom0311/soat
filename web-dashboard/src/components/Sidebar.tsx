import type { ReactElement, ReactNode } from 'react';
import { CollapseIcon, HamburgerIcon, KeyIcon, LogoIcon, LogoutIcon } from './Icons';
import { ThemeToggle } from './ThemeToggle';

export type NavItem = {
  key: string;
  label: string;
  Icon: (props: { className?: string }) => ReactElement;
  onClick: () => void;
  active: boolean;
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

/** Shared Sneat-style left sidebar shell, used by both the nurse (/app) and
 *  superadmin (/admin) layouts. Desktop: fixed column, collapsible to an
 *  icon-only rail. Mobile (< 960px): slide-in drawer with a scrim overlay. */
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
          {items.map(({ key, label, Icon, onClick, active }) => (
            <button
              key={key}
              className={`sidebar-item ${active ? 'active' : ''}`}
              onClick={onClick}
              type="button"
              title={label}
            >
              <Icon />
              <span className="sidebar-item-label">{label}</span>
            </button>
          ))}
        </nav>

        <div className="sidebar-footer">
          {conn && (
            <div className="conn" title={conn.label}>
              <span className={`dot ${conn.status === 'live' ? 'live' : ''}`} />
              <span>{conn.label}</span>
            </div>
          )}
          <div className="sidebar-user">
            <span className="avatar" aria-hidden="true">
              {userName.trim().charAt(0).toUpperCase() || '?'}
            </span>
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
