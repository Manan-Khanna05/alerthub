import type { View } from '../lib/types';
import { Icon, type IconName } from './Icons';
import { SourceIcon } from './SourceIcon';
import logo from '../assets/logo.svg';
import logoDark from '../assets/logo-dark.svg';

export interface NavItemDef {
  view: View;
  label: string;
  icon: IconName;
  /** Source logo instead of a generic icon (Gmail / CUIMS / Tasks nav items). */
  logo?: 'gmail' | 'cuims' | 'task';
  badge?: number;
}

export const NAV_MAIN: NavItemDef[] = [
  { view: 'overview', label: 'Overview', icon: 'dashboard' },
  { view: 'alerts', label: 'All Alerts', icon: 'bell' },
  { view: 'cuims', label: 'Academic / CUIMS', icon: 'academic', logo: 'cuims' },
  { view: 'email', label: 'Gmail', icon: 'mail', logo: 'gmail' },
  { view: 'tasks', label: 'Tasks', icon: 'tasks', logo: 'task' },
];

export const NAV_MORE: NavItemDef[] = [
  { view: 'sources', label: 'Sources / Integrations', icon: 'layers' },
  { view: 'devices', label: 'Phone Devices', icon: 'phone' },
  { view: 'history', label: 'History', icon: 'history' },
  { view: 'settings', label: 'Settings', icon: 'settings' },
];

/** Fixed bottom navigation (mobile): Overview, Alerts, Sources, Devices, Settings. */
export const NAV_BOTTOM: NavItemDef[] = [
  { view: 'overview', label: 'Overview', icon: 'dashboard' },
  { view: 'alerts', label: 'Alerts', icon: 'bell' },
  { view: 'sources', label: 'Sources', icon: 'layers' },
  { view: 'devices', label: 'Devices', icon: 'phone' },
  { view: 'settings', label: 'Settings', icon: 'settings' },
];

interface SidebarProps {
  view: View;
  unread: number;
  profileName: string;
  profileLine: string;
  isDark: boolean;
  onNavigate: (view: View) => void;
}

export function renderNavItem(
  item: NavItemDef,
  view: View,
  unread: number,
  onNavigate: (view: View) => void,
) {
  const badge =
    item.view === 'alerts' && unread > 0 ? unread : item.badge;
  return (
    <button
      key={item.view}
      type="button"
      className={`nav-item${view === item.view ? ' active' : ''}`}
      aria-current={view === item.view ? 'page' : undefined}
      title={item.label}
      onClick={() => onNavigate(item.view)}
    >
      <span className="nav-icon">
        {item.logo ? (
          <SourceIcon
            sourceType={
              item.logo === 'gmail' ? 'email' : item.logo === 'cuims' ? 'cuims' : 'task'
            }
            label={item.label}
          />
        ) : (
          <Icon name={item.icon} />
        )}
      </span>
      {item.label}
      {badge ? <span className="nav-badge">{badge}</span> : null}
    </button>
  );
}

export function Sidebar({
  view,
  unread,
  profileName,
  profileLine,
  isDark,
  onNavigate,
}: SidebarProps) {
  return (
    <aside className="sidebar">
      <div className="sidebar-logo">
        <img src={isDark ? logoDark : logo} alt="AlertHub" />
        <span className="sidebar-tag sidebar-logo-tag">Notification Command Center</span>
      </div>
      <div className="nav-label">Menu</div>
      {NAV_MAIN.map((item) => renderNavItem(item, view, unread, onNavigate))}
      <div className="nav-label">More</div>
      {NAV_MORE.map((item) => renderNavItem(item, view, unread, onNavigate))}
      <div className="sidebar-footer">
        <strong>{profileName}</strong>
        {profileLine}
      </div>
    </aside>
  );
}
