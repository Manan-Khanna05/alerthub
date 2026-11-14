import type { Alert, DeliveryLog } from '../lib/types';
import { AlertRow } from '../components/AlertRow';
import { EmptyState } from '../components/Cards';
import { formatDateTime } from '../lib/format';

interface HistoryPageProps {
  logs: DeliveryLog[];
  archived: Alert[];
  onOpenAlert: (alert: Alert) => void;
  onToggleRead: (alert: Alert) => void;
  onToggleStar: (alert: Alert) => void;
  onUnarchive: (alert: Alert) => void;
  onDelete: (alert: Alert) => void;
}

/**
 * History: real delivery attempts (push / in-app / test) plus archived
 * alerts. Nothing here is fabricated — both lists come from the live state
 * and the server-backed delivery log.
 */
export function HistoryPage({
  logs,
  archived,
  onOpenAlert,
  onToggleRead,
  onToggleStar,
  onUnarchive,
  onDelete,
}: HistoryPageProps) {
  return (
    <div>
      <div className="page-head">
        <h1>History</h1>
        <p>Delivery attempts and archived alerts.</p>
      </div>

      <div className="card glass glow-blue">
        <h2>Delivery log</h2>
        <p className="card-sub">
          Every recorded notification attempt, newest first. “Accepted by the
          push service” means the push service took the message — not that the
          phone displayed it.
        </p>
        {logs.length === 0 ? (
          <EmptyState
            icon="history"
            title="No delivery attempts yet"
            body="Attempts are recorded when a notification is sent or tested."
          />
        ) : (
          <div>
            {logs.slice(0, 50).map((log) => (
              <div className="list-row" key={log.id}>
                <div className="row-main">
                  <strong>{log.detail}</strong>
                  <span>
                    {formatDateTime(log.attemptedAt)} · {log.channel}
                    {log.deviceId ? ` · device ${log.deviceId}` : ''}
                  </span>
                </div>
                <span
                  className={`pill ${
                    log.status === 'delivered'
                      ? 'pill-ok'
                      : log.status === 'failed'
                        ? 'pill-bad'
                        : 'pill-neutral'
                  }`}
                >
                  {log.status}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="card glass">
        <h2>Archived alerts</h2>
        <p className="card-sub">
          Alerts you archived from the inbox. Unarchive to bring one back.
        </p>
        {archived.length === 0 ? (
          <EmptyState
            icon="archive"
            title="Nothing archived"
            body="Archived alerts will appear here."
          />
        ) : (
          <div className="alert-list">
            {archived.map((alert) => (
              <AlertRow
                key={alert.id}
                alert={alert}
                onOpen={onOpenAlert}
                onToggleRead={onToggleRead}
                onToggleStar={onToggleStar}
                onArchive={onUnarchive}
                onDelete={onDelete}
                archiveLabel="Unarchive"
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
