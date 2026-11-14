import { useMemo, useState } from 'react';
import type { Alert, Priority, Source } from '../lib/types';
import { AlertRow } from '../components/AlertRow';
import { AcademicAlertCard } from '../components/AcademicAlertCard';
import { EmptyState } from '../components/Cards';
import { Icon } from '../components/Icons';
import { SourceIcon } from '../components/SourceIcon';
import { priorityOf } from '../lib/priority';
import { isSimulationAlert } from '../lib/simulator';
import '../notification-center.css';

type Category =
  | 'all'
  | 'academic'
  | 'gmail'
  | 'tasks'
  | 'system'
  | 'important'
  | 'test'
  | 'unread'
  | 'starred';
type Sort = 'newest' | 'oldest' | 'priority';

const SEVERITY_RANK: Record<string, number> = {
  critical: 0,
  important: 1,
  normal: 2,
  low: 3,
};

const PRIORITY_RANK: Record<Priority, number> = {
  critical: 0,
  high: 1,
  normal: 2,
  low: 3,
};

interface AlertsPageProps {
  alerts: Alert[];
  archived: Alert[];
  sources: Source[];
  /** Global search query, owned by App (shared with the top bar). */
  query: string;
  onQueryChange: (q: string) => void;
  onOpenAlert: (alert: Alert) => void;
  onToggleRead: (alert: Alert) => void;
  onToggleStar: (alert: Alert) => void;
  onArchive: (alert: Alert) => void;
  onDelete: (alert: Alert) => void;
  onUnarchive: (alert: Alert) => void;
}

export function AlertsPage({
  alerts,
  archived,
  sources,
  query,
  onQueryChange,
  onOpenAlert,
  onToggleRead,
  onToggleStar,
  onArchive,
  onDelete,
  onUnarchive,
}: AlertsPageProps) {
  const [category, setCategory] = useState<Category>('all');
  const [priority, setPriority] = useState<'all' | Priority>('all');
  const [sourceFilter, setSourceFilter] = useState<string>('all');
  const [sort, setSort] = useState<Sort>('newest');
  const [showArchived, setShowArchived] = useState(false);

  const categories: { key: Category; label: string }[] = [
    { key: 'all', label: 'All Alerts' },
    { key: 'academic', label: 'Academic' },
    { key: 'gmail', label: 'Gmail' },
    { key: 'tasks', label: 'Tasks' },
    { key: 'system', label: 'System' },
    { key: 'important', label: 'Important' },
    { key: 'test', label: 'Test Notifications' },
    { key: 'unread', label: 'Unread' },
    { key: 'starred', label: 'Starred' },
  ];

  const visible = useMemo(() => {
    const base = showArchived ? archived : alerts;
    const q = query.trim().toLowerCase();
    const filtered = base.filter((a) => {
      if (category === 'academic' && a.category !== 'academic' && !a.academic)
        return false;
      if (category === 'gmail' && a.sourceType !== 'email') return false;
      if (category === 'tasks' && a.sourceType !== 'task') return false;
      if (category === 'system' && a.sourceType !== 'system') return false;
      if (
        category === 'important' &&
        a.severity !== 'critical' &&
        a.severity !== 'important'
      )
        return false;
      if (category === 'test' && !isSimulationAlert(a)) return false;
      if (category === 'unread' && a.isRead) return false;
      if (category === 'starred' && !a.isStarred) return false;
      if (priority !== 'all' && priorityOf(a) !== priority) return false;
      if (sourceFilter !== 'all') {
        if (sourceFilter.startsWith('type:')) {
          if (a.sourceType !== sourceFilter.slice('type:'.length)) return false;
        } else if (sourceFilter.startsWith('source:')) {
          const key = sourceFilter.slice('source:'.length);
          const src = sources.find((s) => s.key === key);
          if (src) {
            const labelMatch =
              a.sourceLabel.toLowerCase().includes(src.name.toLowerCase()) ||
              a.sourceType === key;
            if (!labelMatch) return false;
          }
        }
      }
      if (q) {
        const hay =
          `${a.title} ${a.body} ${a.sender} ${a.sourceLabel} ${a.academic?.subject ?? ''} ${a.academic?.assessment ?? ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    // Dedupe by externalId (first occurrence wins); fall back to dedupeKey.
    const seen = new Set<string>();
    const deduped = filtered.filter((a) => {
      const key = a.externalId || a.dedupeKey;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    const list = [...deduped];
    if (sort === 'newest')
      list.sort(
        (a, b) =>
          new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime(),
      );
    else if (sort === 'oldest')
      list.sort(
        (a, b) =>
          new Date(a.occurredAt).getTime() - new Date(b.occurredAt).getTime(),
      );
    else
      list.sort(
        (a, b) =>
          PRIORITY_RANK[priorityOf(a)] - PRIORITY_RANK[priorityOf(b)] ||
          (SEVERITY_RANK[a.severity] ?? 9) - (SEVERITY_RANK[b.severity] ?? 9) ||
          new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime(),
      );
    return list;
  }, [alerts, archived, showArchived, category, priority, sourceFilter, query, sort, sources]);

  const unreadVisible = visible.filter((a) => !a.isRead);
  const markAllRead = () => {
    unreadVisible.forEach((a) => onToggleRead(a));
  };

  return (
    <div>
      <div className="page-head">
        <h1>All alerts</h1>
        <p>
          {alerts.length} active alert{alerts.length === 1 ? '' : 's'}
          {archived.length > 0 ? ` · ${archived.length} archived` : ''}
        </p>
      </div>

      <div className="toolbar glass">
        <div style={{ position: 'relative', flex: 1, minWidth: 180 }}>
          <input
            className="input"
            type="search"
            placeholder="Search title, body, sender, source or subject…"
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            aria-label="Search alerts"
          />
        </div>
        <select
          className="select"
          value={sort}
          onChange={(e) => setSort(e.target.value as Sort)}
          aria-label="Sort alerts"
        >
          <option value="newest">Newest first</option>
          <option value="oldest">Oldest first</option>
          <option value="priority">Priority first</option>
        </select>
        <button
          type="button"
          className={`btn${showArchived ? ' btn-primary' : ''}`}
          onClick={() => setShowArchived((v) => !v)}
        >
          <Icon name="archive" /> {showArchived ? 'Show active' : 'Show archived'}
        </button>
        <button
          type="button"
          className="btn"
          disabled={unreadVisible.length === 0}
          onClick={markAllRead}
        >
          <Icon name="checkCircle" /> Mark all as read
          {unreadVisible.length > 0 ? ` (${unreadVisible.length})` : ''}
        </button>
      </div>

      <div className="nc-toolbar-row glass">
        <select
          className="select"
          value={priority}
          onChange={(e) => setPriority(e.target.value as 'all' | Priority)}
          aria-label="Filter by priority"
        >
          <option value="all">All priorities</option>
          <option value="critical">Critical</option>
          <option value="high">High</option>
          <option value="normal">Normal</option>
          <option value="low">Low</option>
        </select>
        <select
          className="select"
          value={sourceFilter}
          onChange={(e) => setSourceFilter(e.target.value)}
          aria-label="Filter by source"
        >
          <option value="all">All sources</option>
          <option value="type:email">Email (Gmail)</option>
          <option value="type:cuims">CUIMS</option>
          <option value="type:task">Tasks</option>
          <option value="type:system">System</option>
          <option value="type:webhook">Webhook</option>
          {sources.map((s) => (
            <option key={s.key} value={`source:${s.key}`}>
              {s.name}
            </option>
          ))}
        </select>
      </div>

      <div className="chip-row" role="group" aria-label="Filter alerts">
        {categories.map((f) => (
          <button
            key={f.key}
            type="button"
            className={`chip${category === f.key ? ' active' : ''}`}
            onClick={() => setCategory(f.key)}
          >
            {f.key === 'gmail' ? (
              <SourceIcon sourceType="email" label="Gmail" />
            ) : f.key === 'academic' ? (
              <SourceIcon sourceType="cuims" label="CUIMS" />
            ) : null}
            {f.label}
          </button>
        ))}
      </div>

      <div className="card glass glow-blue">
        {visible.length === 0 ? (
          <EmptyState
            icon="search"
            title={showArchived ? 'No archived alerts' : 'No alerts match'}
            body={
              showArchived
                ? 'Archived alerts will appear here.'
                : 'Try a different search or filter.'
            }
          />
        ) : (
          <div className="alert-list">
            {visible.map((a) =>
              a.academic ? (
                <div key={a.externalId || a.id}>
                  <AcademicAlertCard alert={a} onView={onOpenAlert} />
                  <div
                    className="academic-actions"
                    style={{ marginTop: 8, marginBottom: 4 }}
                  >
                    <button
                      type="button"
                      className="btn"
                      onClick={() => onToggleRead(a)}
                    >
                      {a.isRead ? 'Mark unread' : 'Mark read'}
                    </button>
                    <button
                      type="button"
                      className="btn"
                      onClick={() => onToggleStar(a)}
                    >
                      {a.isStarred ? 'Unstar' : 'Star'}
                    </button>
                    <button
                      type="button"
                      className="btn"
                      onClick={() =>
                        showArchived ? onUnarchive(a) : onArchive(a)
                      }
                    >
                      {showArchived ? 'Unarchive' : 'Archive'}
                    </button>
                    <button
                      type="button"
                      className="btn btn-danger"
                      onClick={() => onDelete(a)}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ) : (
                <AlertRow
                  key={a.externalId || a.id}
                  alert={a}
                  onOpen={onOpenAlert}
                  onToggleRead={onToggleRead}
                  onToggleStar={onToggleStar}
                  onArchive={showArchived ? onUnarchive : onArchive}
                  archiveLabel={showArchived ? 'Unarchive' : 'Archive'}
                  onDelete={onDelete}
                />
              ),
            )}
          </div>
        )}
      </div>
    </div>
  );
}
