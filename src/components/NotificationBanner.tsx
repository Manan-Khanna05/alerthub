import { useEffect } from 'react';
import type { Alert } from '../lib/types';
import { Icon } from './Icons';
import { SourceIcon } from './SourceIcon';
import { relativeTime } from '../lib/format';

interface NotificationBannerProps {
  /** The alert to show. Null hides the banner. */
  alert: Alert | null;
  /** "View" tapped — the App navigates to the alert. */
  onView: (alert: Alert) => void;
  /** Dismiss tapped (or the auto-dismiss timer fired). */
  onDismiss: () => void;
}

/**
 * Premium in-app floating banner for when the app is OPEN (foreground-only).
 * System notifications cover the background; this covers the case where the
 * user is already looking at the app and would otherwise miss the alert.
 * It never touches read/star state — showing it is not reading it.
 *
 * Auto-dismisses after 9s for normal/low alerts; critical/important alerts
 * stay until the user acts. Dedupe lives in the App (a shown-ids set), so
 * the same event id can never banner twice.
 */
export function NotificationBanner({
  alert,
  onView,
  onDismiss,
}: NotificationBannerProps) {
  useEffect(() => {
    if (!alert) return;
    if (alert.severity === 'critical' || alert.severity === 'important') {
      return;
    }
    const timer = window.setTimeout(onDismiss, 9000);
    return () => window.clearTimeout(timer);
  }, [alert, onDismiss]);

  if (!alert) return null;

  const prominent =
    alert.severity === 'critical' || alert.severity === 'important';
  const academic =
    alert.sourceType === 'cuims' || alert.sourceType === 'email';

  return (
    <div
      className={[
        'notif-banner',
        'glass',
        'ah-notice-enter',
        `sev-${alert.severity}`,
        prominent ? 'notif-banner-prominent' : '',
        academic ? 'notif-banner-academic' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      role="status"
      aria-live="polite"
    >
      <span className="notif-banner-icon" aria-hidden="true">
        <SourceIcon sourceType={alert.sourceType} label={alert.sourceLabel} />
      </span>
      <div className="notif-banner-body">
        <div className="notif-banner-meta">
          <span>{alert.sourceLabel}</span>
          <span aria-hidden="true"> · </span>
          <time dateTime={alert.receivedAt}>
            {relativeTime(alert.receivedAt)}
          </time>
          {prominent ? (
            <span className="notif-banner-flag">
              {alert.severity === 'critical' ? 'Critical' : 'Important'}
            </span>
          ) : null}
        </div>
        <strong className="notif-banner-title">{alert.title}</strong>
        <p className="notif-banner-desc">{alert.body}</p>
      </div>
      <div className="notif-banner-actions">
        <button
          type="button"
          className="btn btn-sm btn-primary"
          onClick={() => onView(alert)}
        >
          View
        </button>
        <button
          type="button"
          className="notif-banner-close"
          aria-label="Dismiss notification"
          title="Dismiss"
          onClick={onDismiss}
        >
          ×
        </button>
      </div>
    </div>
  );
}
