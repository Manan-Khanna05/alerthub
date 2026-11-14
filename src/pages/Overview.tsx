import type { Alert, DeliveryLog, Device, Source, View } from '../lib/types';
import { formatDate, greeting, todayIstKey, istDateKey } from '../lib/format';
import { StatCard, EmptyState } from '../components/Cards';
import { SourceCard } from '../components/SourceCard';
import { AlertRow } from '../components/AlertRow';
import { Icon } from '../components/Icons';

interface OverviewProps {
  alerts: Alert[];
  sources: Source[];
  devices: Device[];
  permission: NotificationPermission | 'unsupported';
  installed: boolean;
  lastDelivery: DeliveryLog | null;
  retryingSourceId: number | null;
  onRetry: (source: Source) => void;
  onNavigate: (view: View) => void;
  onOpenAlert: (alert: Alert) => void;
  onToggleRead: (alert: Alert) => void;
  onToggleStar: (alert: Alert) => void;
  onArchive: (alert: Alert) => void;
  onDelete: (alert: Alert) => void;
}

export function Overview({
  alerts,
  sources,
  devices,
  permission,
  installed,
  lastDelivery,
  retryingSourceId,
  onRetry,
  onNavigate,
  onOpenAlert,
  onToggleRead,
  onToggleStar,
  onArchive,
  onDelete,
}: OverviewProps) {
  const todayKey = todayIstKey();
  const unread = alerts.filter((a) => !a.isRead).length;
  const today = alerts.filter((a) => istDateKey(a.occurredAt) === todayKey).length;
  const connected = sources.filter(
    (s) => s.enabled && (s.status === 'ok' || s.status === 'connected'),
  ).length;
  const recent = alerts.slice(0, 8);
  const gmail = sources.find((s) => s.key === 'gmail');
  const gmailCount = alerts.filter((a) => a.sourceType === 'email').length;
  const academicCount = alerts.filter(
    (a) => a.sourceType === 'cuims' || a.category === 'academic',
  ).length;
  const taskCount = alerts.filter((a) => a.sourceType === 'task').length;

  return (
    <div>
      <div className="page-head welcome-hero">
        <h1>
          {greeting()}, Manan
        </h1>
        <p>
          Your notifications, organized in one place.
          <br />
          {unread} unread alert{unread === 1 ? '' : 's'} · {today} from today ·{' '}
          {connected} of {sources.length} sources connected
        </p>
      </div>

      <div className="stat-grid">
        <StatCard label="Unread" value={unread} note="Across all sources" logo="bell" />
        <StatCard
          label="Gmail"
          value={gmailCount}
          note={
            gmail
              ? `Last checked ${formatDate(gmail.lastCheckedAt)}`
              : 'Gmail alerts'
          }
          logo="email"
        />
        <StatCard
          label="Academic"
          value={academicCount}
          note="CUIMS marks updates"
          logo="cuims"
        />
        <StatCard label="Tasks" value={taskCount} note="Task reminders" logo="task" />
      </div>

      <div className="grid-main">
        <div className="card glass glow-blue">
          <h2>Recent alerts</h2>
          <p className="card-sub">Newest first. Tap a row to read the full alert.</p>
          {recent.length === 0 ? (
            <EmptyState
              icon="inbox"
              title="No alerts yet"
              body="New mail, marks and task reminders will appear here."
            />
          ) : (
            <div className="alert-list">
              {recent.map((a) => (
                <AlertRow
                  key={a.id}
                  alert={a}
                  onOpen={onOpenAlert}
                  onToggleRead={onToggleRead}
                  onToggleStar={onToggleStar}
                  onArchive={onArchive}
                  onDelete={onDelete}
                />
              ))}
            </div>
          )}
          <div style={{ marginTop: 14 }}>
            <button type="button" className="btn" onClick={() => onNavigate('alerts')}>
              View all alerts
            </button>
          </div>
        </div>

        <div className="stack">
          <div className="card glass glow-cyan">
            <h2>Source health</h2>
            <p className="card-sub">Live status of every connected source.</p>
            <div className="stack">
              {sources.map((s) => (
                <SourceCard
                  key={s.id}
                  source={s}
                  onRetry={onRetry}
                  retrying={retryingSourceId === s.id}
                />
              ))}
            </div>
          </div>

          <div className="card glass glow-green">
            <h2>Phone delivery</h2>
            <p className="card-sub">
              Notifications on this device are{' '}
              {permission === 'granted'
                ? 'enabled'
                : permission === 'denied'
                  ? 'blocked in the browser'
                  : permission === 'unsupported'
                    ? 'not supported in this browser'
                    : 'not enabled yet'}
              .
            </p>
            <div className="list-row">
              <div className="row-main">
                <strong>
                  {devices.length} device{devices.length === 1 ? '' : 's'} registered
                  {installed ? ' · Installed' : ''}
                </strong>
                <span>
                  {lastDelivery
                    ? `Last delivery: ${lastDelivery.channel} · ${lastDelivery.status} · ${lastDelivery.detail}`
                    : 'No deliveries logged yet.'}
                </span>
              </div>
              {installed ? (
                <span className="pill pill-ok">Installed</span>
              ) : (
                <span className="pill pill-neutral">Not installed</span>
              )}
            </div>
            <div style={{ marginTop: 14 }}>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => onNavigate('devices')}
              >
                <Icon name="phone" /> Enable phone alerts
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
