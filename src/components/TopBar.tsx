import { useState } from 'react';
import { formatDateTime } from '../lib/format';
import { Icon } from './Icons';

interface TopBarProps {
  title: string;
  subtitle: string;
  lastCheckedAt: string | null;
  /** Global search (desktop input; on mobile the search icon opens Alerts). */
  searchQuery: string;
  onSearchChange: (q: string) => void;
  onRefresh: () => void;
  refreshing: boolean;
  isDark: boolean;
  onToggleTheme: () => void;
  unread: number;
  /** True briefly when a new unread alert arrives — one short bell ring. */
  bellRing: boolean;
  onBellClick: () => void;
  profileName: string;
  profileEmail: string;
  profileLine: string;
  onOpenSettings: () => void;
  /** Opens the mobile navigation drawer. Shown only below 760px (see CSS). */
  onMenuClick?: () => void;
  onSearchIconClick?: () => void;
}

export function TopBar({
  title,
  subtitle,
  lastCheckedAt,
  searchQuery,
  onSearchChange,
  onRefresh,
  refreshing,
  isDark,
  onToggleTheme,
  unread,
  bellRing,
  onBellClick,
  profileName,
  profileEmail,
  profileLine,
  onOpenSettings,
  onMenuClick,
  onSearchIconClick,
}: TopBarProps) {
  const [accountOpen, setAccountOpen] = useState(false);
  const initial = profileName.trim().charAt(0).toUpperCase() || 'M';

  return (
    <header className="topbar">
      {onMenuClick ? (
        <button
          type="button"
          className="menu-btn"
          onClick={onMenuClick}
          aria-label="Open menu"
          title="Open menu"
          aria-haspopup="dialog"
        >
          <Icon name="menu" />
        </button>
      ) : null}
      <span className="topbar-brand" aria-hidden="true">
        <img src="/assets/logos/alerthub-symbol.svg" alt="" draggable={false} />
      </span>
      <div className="topbar-titles">
        <h1 className="topbar-title">{title}</h1>
        <div className="topbar-sub">{subtitle}</div>
      </div>
      <div className="topbar-spacer" />
      <label className="topbar-search" htmlFor="topbar-search">
        <Icon name="search" />
        <input
          id="topbar-search"
          type="search"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search alerts…"
          aria-label="Search alerts"
        />
      </label>
      <div className="topbar-actions">
        {onSearchIconClick ? (
          <button
            type="button"
            className="icon-btn topbar-search-btn"
            onClick={onSearchIconClick}
            aria-label="Search alerts"
            title="Search alerts"
          >
            <Icon name="search" />
          </button>
        ) : null}
        <button
          type="button"
          className="icon-btn topbar-refresh"
          onClick={onRefresh}
          disabled={refreshing}
          aria-label="Refresh alerts"
          title="Refresh alerts"
        >
          <Icon name="refresh" />
        </button>
        <button
          type="button"
          className="icon-btn"
          onClick={onToggleTheme}
          aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
          title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
        >
          <Icon name={isDark ? 'sun' : 'moon'} />
        </button>
        <button
          type="button"
          className="icon-btn topbar-bell"
          onClick={onBellClick}
          aria-label={unread > 0 ? `Notifications, ${unread} unread` : 'Notifications'}
          title="Notifications"
        >
          <Icon
            name={bellRing ? 'bellRinging' : 'bell'}
            className={bellRing ? 'ah-bell-arrive' : undefined}
          />
          {unread > 0 ? <span className="nav-badge">{unread}</span> : null}
        </button>
        <button
          type="button"
          className="topbar-account"
          onClick={() => setAccountOpen((v) => !v)}
          aria-label="Account menu"
          title="Account menu"
          aria-expanded={accountOpen}
          aria-haspopup="dialog"
        >
          <span className="avatar" aria-hidden="true">
            {initial}
          </span>
          <span className="account-name">{profileName}</span>
        </button>
      </div>
      <div className="topbar-clock">
        <strong>Asia/Calcutta</strong>
        {lastCheckedAt
          ? `Last sync ${formatDateTime(lastCheckedAt)}`
          : 'No sync yet'}
      </div>
      {accountOpen ? (
        <>
          <div
            className="account-backdrop"
            aria-hidden="true"
            onClick={() => setAccountOpen(false)}
          />
          <div className="account-pop" role="dialog" aria-label="Account">
            <strong>{profileName}</strong>
            <span>{profileEmail}</span>
            <span>{profileLine}</span>
            <button
              type="button"
              className="btn btn-block"
              onClick={() => {
                setAccountOpen(false);
                onOpenSettings();
              }}
            >
              Settings
            </button>
          </div>
        </>
      ) : null}
    </header>
  );
}
