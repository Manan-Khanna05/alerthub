import type { Alert } from '../lib/types';
import { formatDateTime, relativeTime } from '../lib/format';
import { Icon } from './Icons';
import { SourceIcon } from './SourceIcon';
import { AcademicAlertCard } from './AcademicAlertCard';
import { differenceLabel } from '../lib/simulator';
import '../notification-center.css';

interface AlertDetailProps {
  alert: Alert;
  onClose: () => void;
  onToggleRead: (alert: Alert) => void;
  onToggleStar: (alert: Alert) => void;
  onArchive: (alert: Alert) => void;
  onDelete: (alert: Alert) => void;
}

export function AlertDetail({
  alert,
  onClose,
  onToggleRead,
  onToggleStar,
  onArchive,
  onDelete,
}: AlertDetailProps) {
  return (
    <div
      className="sheet-backdrop"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="sheet glass"
        role="dialog"
        aria-modal="true"
        aria-label={alert.title}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button
            type="button"
            className="icon-btn"
            aria-label="Close"
            title="Close"
            onClick={onClose}
          >
            <Icon name="close" />
          </button>
        </div>
        <h2>{alert.title}</h2>
        <div className="sheet-source">
          <SourceIcon sourceType={alert.sourceType} label={alert.sourceLabel} />
          <div>
            <strong>{alert.sourceLabel}</strong>
            <span>
              {relativeTime(alert.occurredAt)} · {formatDateTime(alert.occurredAt)}
            </span>
          </div>
        </div>
        <div className="sheet-meta">
          <span className={`pill ${alert.isRead ? 'pill-neutral' : 'pill-accent'}`}>
            {alert.isRead ? 'Read' : 'Unread'}
          </span>
          {alert.severity !== 'normal' ? (
            <span className={`sev-label sev-${alert.severity}`}>{alert.severity}</span>
          ) : (
            <span className="sev-label">Normal</span>
          )}
          {alert.isStarred ? <span className="pill pill-accent">Starred</span> : null}
          <span className="pill pill-neutral pill-no-dot">
            {alert.deliveryState === 'logged' ? 'Logged' : alert.deliveryState}
          </span>
          {alert.academic?.isSimulation ? (
            <span className="sim-badge">TEST · SIMULATION</span>
          ) : null}
        </div>
        <p className="sheet-body">{alert.body}</p>
        {alert.academic ? (
          <div style={{ marginBottom: 12 }}>
            <AcademicAlertCard alert={alert} compact />
            <dl className="kv" style={{ marginTop: 12 }}>
              <dt>Previous result</dt>
              <dd>
                {alert.academic.previous === null
                  ? '— (first result)'
                  : `${alert.academic.previous} / ${alert.academic.max}`}
              </dd>
              <dt>Updated result</dt>
              <dd>
                {alert.academic.current} / {alert.academic.max}
              </dd>
              <dt>Marks difference</dt>
              <dd>
                {differenceLabel(alert.academic)}
                {alert.academic.direction === 'up' ||
                alert.academic.direction === 'down'
                  ? ` (${alert.academic.difference > 0 ? '+' : ''}${alert.academic.difference} marks)`
                  : ''}
              </dd>
              <dt>Percentage</dt>
              <dd>
                {alert.academic.max > 0
                  ? `${((alert.academic.current / alert.academic.max) * 100).toFixed(1)}%`
                  : '—'}
              </dd>
              <dt>Source verification</dt>
              <dd>
                {alert.academic.verified
                  ? 'Verified CUIMS data'
                  : alert.academic.isSimulation
                    ? 'SIMULATION — test only, not a real CUIMS result'
                    : 'Unverified — not confirmed against CUIMS'}
              </dd>
              <dt>Last checked</dt>
              <dd>
                {formatDateTime(alert.receivedAt)} IST (
                {relativeTime(alert.receivedAt)})
              </dd>
            </dl>
          </div>
        ) : null}
        <dl className="kv">
          <dt>Sender</dt>
          <dd>{alert.sender}</dd>
          <dt>Source</dt>
          <dd>{alert.sourceLabel}</dd>
          <dt>Occurred</dt>
          <dd>
            {formatDateTime(alert.occurredAt)} IST ({relativeTime(alert.occurredAt)})
          </dd>
          <dt>Received</dt>
          <dd>{formatDateTime(alert.receivedAt)} IST</dd>
          <dt>Dedupe key</dt>
          <dd className="mono">{alert.dedupeKey}</dd>
          <dt>External ID</dt>
          <dd className="mono">{alert.externalId}</dd>
          <dt>Delivery</dt>
          <dd>{alert.deliveryState}</dd>
          {alert.category ? (
            <>
              <dt>Category</dt>
              <dd>{alert.category}</dd>
            </>
          ) : null}
        </dl>
        {alert.sourceUrl ? (
          <a
            className="btn"
            href={alert.sourceUrl}
            target="_blank"
            rel="noreferrer"
          >
            <Icon name="external" /> Open source
          </a>
        ) : null}
        <div className="sheet-actions">
          <button
            type="button"
            className="btn"
            onClick={() => onToggleRead(alert)}
          >
            {alert.isRead ? 'Mark unread' : 'Mark read'}
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => onToggleStar(alert)}
          >
            {alert.isStarred ? 'Unstar' : 'Star'}
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => onArchive(alert)}
          >
            Archive
          </button>
          <button
            type="button"
            className="btn btn-danger"
            onClick={() => {
              onDelete(alert);
              onClose();
            }}
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}
