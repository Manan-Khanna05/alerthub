import type { ReactNode } from 'react';
import { Icon, type IconName } from './Icons';
import { SourceIcon } from './SourceIcon';

/** Top-edge accent glow per stat card, matching the Glass Navy palette:
 * Gmail blue, Academic/CUIMS violet, Tasks cyan, Unread blue. */
function statGlow(logo?: 'email' | 'cuims' | 'task' | 'bell'): string {
  switch (logo) {
    case 'email':
      return 'glow-blue';
    case 'cuims':
      return 'glow-violet';
    case 'task':
      return 'glow-cyan';
    case 'bell':
      return 'glow-blue';
    default:
      return '';
  }
}

export function StatCard({
  label,
  value,
  note,
  logo,
}: {
  label: string;
  value: string | number;
  note?: string;
  /** Source logo shown at the top-right of the card. */
  logo?: 'email' | 'cuims' | 'task' | 'bell';
}) {
  const glow = statGlow(logo);
  return (
    <div className={`card stat-card glass${glow ? ` ${glow}` : ''}`}>
      <div className="stat-card-head">
        <div className="stat-label">{label}</div>
        {logo ? (
          <span className="stat-logo">
            {logo === 'bell' ? (
              <span className="source-mark" aria-hidden="true">
                <Icon name="bell" />
              </span>
            ) : (
              <SourceIcon sourceType={logo} label={label} />
            )}
          </span>
        ) : null}
      </div>
      <div className="stat-value">{value}</div>
      {note ? <div className="stat-note">{note}</div> : null}
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  body,
  action,
}: {
  icon: IconName;
  title: string;
  body: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      <div className="empty-icon">
        <Icon name={icon} />
      </div>
      <strong>{title}</strong>
      <p>{body}</p>
      {action}
    </div>
  );
}
