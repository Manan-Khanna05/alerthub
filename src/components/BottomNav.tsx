import type { View } from '../lib/types';
import { NAV_BOTTOM, type NavItemDef } from './Sidebar';
import { Icon } from './Icons';

interface BottomNavProps {
  view: View;
  unread: number;
  onNavigate: (view: View) => void;
}

export function BottomNav({ view, unread, onNavigate }: BottomNavProps) {
  return (
    <nav className="bottom-nav" aria-label="Primary">
      {NAV_BOTTOM.map((item: NavItemDef) => {
        const badge = item.view === 'alerts' && unread > 0 ? unread : undefined;
        return (
          <button
            key={item.view}
            type="button"
            className={view === item.view ? 'active' : ''}
            aria-current={view === item.view ? 'page' : undefined}
            title={item.label}
            aria-label={item.label}
            onClick={() => onNavigate(item.view)}
          >
            <span style={{ position: 'relative', display: 'inline-flex' }}>
              <Icon name={item.icon} />
              {badge ? <span className="nav-badge">{badge}</span> : null}
            </span>
            {item.label}
          </button>
        );
      })}
    </nav>
  );
}
