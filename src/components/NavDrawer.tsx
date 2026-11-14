import { useEffect } from 'react';
import type { View } from '../lib/types';
import { NAV_MAIN, NAV_MORE, renderNavItem } from './Sidebar';
import { Icon } from './Icons';
import logo from '../assets/logo.svg';
import logoDark from '../assets/logo-dark.svg';

/**
 * Slide-in navigation drawer for mobile / installed (standalone) use.
 * The desktop sidebar is hidden below 760px, so without this drawer the
 * Email, CUIMS and Tasks pages are unreachable on a phone. The drawer
 * lists ALL navigation items (the same 5 main + 3 channels as the sidebar),
 * is touch-friendly, closes on backdrop tap, on Escape, and on navigation.
 * It is rendered always but hidden (visibility) when closed, so the
 * slide animation works in both directions.
 */

interface NavDrawerProps {
  open: boolean;
  view: View;
  unread: number;
  profileName: string;
  profileLine: string;
  isDark: boolean;
  onNavigate: (view: View) => void;
  onClose: () => void;
}

export function NavDrawer({
  open,
  view,
  unread,
  profileName,
  profileLine,
  isDark,
  onNavigate,
  onClose,
}: NavDrawerProps) {
  // Lock background scroll while open; close on Escape.
  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  const renderItem = (item: Parameters<typeof renderNavItem>[0]) =>
    renderNavItem(item, view, unread, onNavigate);

  return (
    <div className={`nav-drawer-root${open ? ' open' : ''}`} aria-hidden={!open}>
      <div className="nav-drawer-backdrop" onClick={onClose} aria-hidden="true" />
      <aside className="nav-drawer" role="dialog" aria-label="Menu">
        <div className="nav-drawer-head">
          <img src={isDark ? logoDark : logo} alt="AlertHub" />
          <button
            type="button"
            className="icon-btn"
            onClick={onClose}
            aria-label="Close menu"
            title="Close menu"
          >
            <Icon name="close" />
          </button>
        </div>
        <div className="nav-drawer-profile">
          <strong>{profileName}</strong>
          <span>{profileLine}</span>
        </div>
        <div className="nav-label">Menu</div>
        {NAV_MAIN.map(renderItem)}
        <div className="nav-label">More</div>
        {NAV_MORE.map(renderItem)}
      </aside>
    </div>
  );
}
