import type { Alert } from '../lib/types';
import { formatDateTime, relativeTime } from '../lib/format';
import { Icon } from './Icons';
import { SourceIcon } from './SourceIcon';

interface AlertRowProps {
  alert: Alert;
  onOpen: (alert: Alert) => void;
  onToggleRead: (alert: Alert) => void;
  onToggleStar: (alert: Alert) => void;
  onArchive: (alert: Alert) => void;
  onDelete: (alert: Alert) => void;
  /** Label for the archive action — 'Unarchive' when listing archived alerts. */
  archiveLabel?: string;
}

export function AlertRow({
  alert,
  onOpen,
  onToggleRead,
  onToggleStar,
  onArchive,
  onDelete,
  archiveLabel = 'Archive',
}: AlertRowProps) {
  const stop = (e: React.MouseEvent) => e.stopPropagation();
  return (
    <article
      className={`alert-row${alert.isRead ? '' : ' unread'}`}
      onClick={() => onOpen(alert)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter') onOpen(alert);
      }}
    >
      <span
        className={`alert-unread-dot${alert.isRead ? ' read' : ''}`}
        title={alert.isRead ? 'Read' : 'Unread'}
      />
      <span className="alert-source-icon" title={alert.sourceLabel}>
        <SourceIcon sourceType={alert.sourceType} label={alert.sourceLabel} />
      </span>
      <div className="alert-body">
        <div className="alert-title-row">
          <h3 className="alert-title">{alert.title}</h3>
          <time
            className="alert-time"
            dateTime={alert.occurredAt}
            title={formatDateTime(alert.occurredAt)}
          >
            {relativeTime(alert.occurredAt)}
          </time>
        </div>
        <p className="alert-preview">{alert.body}</p>
        <div className="alert-meta">
          <span>{alert.sourceLabel}</span>
          {alert.severity !== 'normal' ? (
            <span className={`sev-label sev-${alert.severity}`}>
              {alert.severity}
            </span>
          ) : null}
          {alert.isStarred ? <span className="sev-label">Starred</span> : null}
        </div>
      </div>
      <div className="alert-actions" onClick={stop}>
        <button
          type="button"
          className="icon-btn"
          title={alert.isRead ? 'Mark unread' : 'Mark read'}
          aria-label={alert.isRead ? 'Mark unread' : 'Mark read'}
          onClick={() => onToggleRead(alert)}
        >
          <Icon name={alert.isRead ? 'mail' : 'checkCircle'} />
        </button>
        <button
          type="button"
          className={`icon-btn${alert.isStarred ? ' active' : ''}`}
          title={alert.isStarred ? 'Unstar' : 'Star'}
          aria-label={alert.isStarred ? 'Unstar' : 'Star'}
          onClick={() => onToggleStar(alert)}
        >
          <Icon name={alert.isStarred ? 'starFill' : 'star'} />
        </button>
        <button
          type="button"
          className="icon-btn hide-mobile"
          title={archiveLabel}
          aria-label={archiveLabel}
          onClick={() => onArchive(alert)}
        >
          <Icon name="archive" />
        </button>
        <button
          type="button"
          className="icon-btn danger hide-mobile"
          title="Delete"
          aria-label="Delete"
          onClick={() => onDelete(alert)}
        >
          <Icon name="trash" />
        </button>
      </div>
    </article>
  );
}
