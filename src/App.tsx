import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  Alert,
  DeliveryLog,
  Device,
  MarksSnapshot,
  Preferences,
  Source,
  TaskItem,
  Toast,
  ToastKind,
  View,
} from './lib/types';
import { fetchAlerts, type AlertsResponse } from './lib/api';
import {
  applyOverrides,
  applyTheme,
  loadState,
  saveState,
  type HubState,
} from './lib/store';
import { Sidebar } from './components/Sidebar';
import { TopBar } from './components/TopBar';
import { BottomNav } from './components/BottomNav';
import { NavDrawer } from './components/NavDrawer';
import { AlertDetail } from './components/AlertDetail';
import { ToastView } from './components/Toast';
import { NotificationBanner } from './components/NotificationBanner';
import { setupServiceWorkerMessageListener } from './lib/push';
import { Overview } from './pages/Overview';
import { AlertsPage } from './pages/Alerts';
import { EmailPage } from './pages/Email';
import { CuimsPage } from './pages/Cuims';
import { TasksPage } from './pages/Tasks';
import { SourcesPage } from './pages/Sources';
import { DevicesPage } from './pages/Devices';
import { HistoryPage } from './pages/History';
import { SettingsPage } from './pages/Settings';
import seed from './data/seed.json';

function seedResponse(): AlertsResponse {
  const s = seed as unknown as AlertsResponse;
  return {
    alerts: s.alerts,
    sources: s.sources,
    preferences: s.preferences,
    profile: s.profile,
    tasks: s.tasks,
    devices: s.devices,
    deliveryLogs: s.deliveryLogs,
    marks: s.marks,
    meta: s.meta,
  };
}

const VIEW_META: Record<View, { title: string; subtitle: string }> = {
  overview: { title: 'Overview', subtitle: 'Everything, at a glance' },
  alerts: { title: 'All Alerts', subtitle: 'Your full notification inbox' },
  email: { title: 'Email', subtitle: 'Gmail · itsmanan.dev@gmail.com' },
  cuims: { title: 'CUIMS Marks', subtitle: 'students.cuchd.in' },
  tasks: { title: 'Tasks', subtitle: 'Reminders that become alerts' },
  sources: { title: 'Sources', subtitle: 'Feeds and webhooks' },
  devices: { title: 'Phone Devices', subtitle: 'Push notifications' },
  history: { title: 'History', subtitle: 'Delivery log and archived alerts' },
  settings: { title: 'Settings', subtitle: 'Profile and preferences' },
};

export default function App() {
  const [data, setData] = useState<AlertsResponse>(() => seedResponse());
  const [hub, setHub] = useState<HubState>(() => loadState());
  const [view, setView] = useState<View>('overview');
  const [selected, setSelected] = useState<Alert | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  /** Foreground banner alert (null = hidden). Dedupe: an event id is only
   *  ever bannered once per app session — see shownBannerIds. */
  const [bannerAlert, setBannerAlert] = useState<Alert | null>(null);
  const shownBannerIds = useRef(new Set<string>());
  const [retryingSourceId, setRetryingSourceId] = useState<number | null>(null);
  /** Global search query, shared by the top bar and the Alerts page. */
  const [globalQuery, setGlobalQuery] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  /** True briefly when a new unread alert arrives — one short bell ring. */
  const [bellRing, setBellRing] = useState(false);
  const [permission, setPermission] = useState<
    NotificationPermission | 'unsupported'
  >(() =>
    typeof window !== 'undefined' && 'Notification' in window
      ? Notification.permission
      : 'unsupported',
  );
  const [installed, setInstalled] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return (
      window.matchMedia('(display-mode: standalone)').matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true
    );
  });
  const toastTimer = useRef<number | null>(null);
  const toastId = useRef(0);

  // Persist local state.
  useEffect(() => {
    saveState(hub);
  }, [hub]);

  // Apply theme whenever the preference changes (Dark is the default).
  useEffect(() => {
    applyTheme(hub.preferences.theme);
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => applyTheme(hub.preferences.theme);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [hub.preferences.theme]);

  // Installed detection.
  useEffect(() => {
    const onInstalled = () => setInstalled(true);
    window.addEventListener('appinstalled', onInstalled);
    return () => window.removeEventListener('appinstalled', onInstalled);
  }, []);

  // Initial refresh from /api/alerts (falls back to seed silently).
  useEffect(() => {
    let cancelled = false;
    fetchAlerts().then(({ data: fresh, fromLive }) => {
      if (!cancelled && fromLive) {
        setData(fresh);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  /** Show the foreground banner for an alert — once per event id, ever, in
   *  this session. Showing it never marks the alert read or starred. */
  const showBannerForAlert = useCallback((alert: Alert) => {
    const key = String(alert.id);
    if (shownBannerIds.current.has(key)) return;
    shownBannerIds.current.add(key);
    setBannerAlert(alert);
  }, []);

  const dismissBanner = useCallback(() => setBannerAlert(null), []);

  /** Single-instance toast: a repeat identical message refreshes the visible toast. */
  const showToast = useCallback((message: string, kind: ToastKind = 'info') => {
    setToast((prev) => {
      if (prev && prev.message === message && prev.kind === kind) {
        return { ...prev, id: prev.id }; // same toast, timer refreshed below
      }
      toastId.current += 1;
      return { id: toastId.current, message, kind };
    });
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 4500);
  }, []);

  const dismissToast = useCallback(() => {
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    setToast(null);
  }, []);

  // Effective sources (seed/live + local enabled overrides).
  const sources: Source[] = useMemo(
    () =>
      data.sources.map((s) => ({
        ...s,
        enabled: hub.sourceEnabled[s.key] ?? s.enabled,
      })),
    [data.sources, hub.sourceEnabled],
  );

  // Effective alerts (read/star overrides + local alerts), split active/archived.
  const allAlerts = useMemo(
    () => applyOverrides(data.alerts, hub),
    [data.alerts, hub],
  );
  // Latest-ref so the service-worker message listener (registered once)
  // can look an incoming alert id up in the current feed.
  const allAlertsRef = useRef(allAlerts);
  allAlertsRef.current = allAlerts;

  // Foreground banner, source 1: the service worker posts 'push-received'
  // after a real push notification is displayed. The message carries the
  // alert id (string or number), so look it up in the feed; if the push
  // arrived before the feed refreshed, fetch once and banner it if it
  // shows up there.
  useEffect(
    () =>
      setupServiceWorkerMessageListener((message) => {
        if (message.type !== 'push-received') return;
        const rawId = message.alertId;
        if (rawId == null) return;
        const key = String(rawId);
        const found = allAlertsRef.current.find(
          (a) => String(a.id) === key || a.externalId === key,
        );
        if (found) {
          showBannerForAlert(found);
          return;
        }
        fetchAlerts().then(({ data: fresh, fromLive }) => {
          if (!fromLive) return;
          setData(fresh);
          const match = fresh.alerts.find(
            (a) => String(a.id) === key || a.externalId === key,
          );
          if (match) showBannerForAlert(match);
        });
      }),
    [showBannerForAlert],
  );

  // Foreground banner + feed insert, source 2: a window CustomEvent
  // 'alerthub:alert' carrying a full Alert (or { alert, log }) in `detail`
  // (dispatched by the simulator and by local alert creation). The alert
  // is added to the feed through React state so it persists correctly —
  // never written straight to localStorage (App's saveState would
  // overwrite a direct write on the next hub change). Foreground-only —
  // no timers, no background monitoring; the banner only fires while the
  // app is open.
  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (
        event as CustomEvent<Alert | { alert: Alert; log?: DeliveryLog }>
      ).detail;
      const alert = (detail as { alert?: Alert }).alert ?? (detail as Alert);
      const log = (detail as { log?: DeliveryLog }).log;
      if (!alert || alert.id == null) return;
      setHub((prev) => {
        const alertExists = prev.localAlerts.some(
          (a) => a.externalId === alert.externalId,
        );
        const logExists = log
          ? prev.localLogs.some((l) => l.id === log.id)
          : true;
        if (alertExists && logExists) return prev;
        return {
          ...prev,
          localAlerts: alertExists
            ? prev.localAlerts
            : [alert, ...prev.localAlerts],
          localLogs:
            !log || logExists ? prev.localLogs : [log, ...prev.localLogs],
        };
      });
      showBannerForAlert(alert);
    };
    window.addEventListener('alerthub:alert', handler);
    return () => window.removeEventListener('alerthub:alert', handler);
  }, [showBannerForAlert]);
  const archivedSet = useMemo(() => new Set(hub.archivedIds), [hub.archivedIds]);
  const activeAlerts = useMemo(
    () => allAlerts.filter((a) => !archivedSet.has(a.id)),
    [allAlerts, archivedSet],
  );
  const archivedAlerts = useMemo(
    () => allAlerts.filter((a) => archivedSet.has(a.id)),
    [allAlerts, archivedSet],
  );

  // Deep link: /alerts/<id> or ?alert=<id> opens that alert's detail.
  // The service worker navigates here when a notification is tapped, so
  // a tap lands on the alert itself, not just the inbox list.
  const [deepLinkKey, setDeepLinkKey] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null;
    const m = window.location.pathname.match(/^\/alerts\/(.+)$/);
    const q = new URLSearchParams(window.location.search).get('alert');
    return m ? decodeURIComponent(m[1]) : q;
  });
  useEffect(() => {
    if (!deepLinkKey) return;
    const found = allAlerts.find(
      (a) => String(a.id) === deepLinkKey || a.externalId === deepLinkKey,
    );
    if (found) {
      setDeepLinkKey(null);
      setView('alerts');
      setSelected(found);
    }
  }, [allAlerts, deepLinkKey]);

  const allLogs: DeliveryLog[] = useMemo(
    () => [...hub.localLogs, ...data.deliveryLogs],
    [hub.localLogs, data.deliveryLogs],
  );
  const lastDelivery = useMemo(() => {
    if (allLogs.length === 0) return null;
    return [...allLogs].sort(
      (a, b) =>
        new Date(b.attemptedAt).getTime() - new Date(a.attemptedAt).getTime(),
    )[0];
  }, [allLogs]);

  const unreadCount = activeAlerts.filter((a) => !a.isRead).length;
  const gmailSource = sources.find((s) => s.key === 'gmail');
  const cuimsSource = sources.find((s) => s.key === 'cuims');
  const isDark = hub.preferences.theme === 'dark';

  // One short bell ring when the unread count grows (a new alert arrived).
  const prevUnreadRef = useRef(unreadCount);
  useEffect(() => {
    if (unreadCount > prevUnreadRef.current) {
      setBellRing(true);
      const timer = window.setTimeout(() => setBellRing(false), 600);
      prevUnreadRef.current = unreadCount;
      return () => window.clearTimeout(timer);
    }
    prevUnreadRef.current = unreadCount;
    return undefined;
  }, [unreadCount]);

  const toggleIn = (list: number[], id: number): number[] =>
    list.includes(id) ? list.filter((x) => x !== id) : [...list, id];

  const handleToggleRead = useCallback(
    (alert: Alert) => {
      setHub((prev) => ({ ...prev, readIds: toggleIn(prev.readIds, alert.id) }));
    },
    [],
  );
  const handleToggleStar = useCallback(
    (alert: Alert) => {
      setHub((prev) => ({
        ...prev,
        starredIds: toggleIn(prev.starredIds, alert.id),
      }));
    },
    [],
  );
  const handleArchive = useCallback((alert: Alert) => {
    setHub((prev) => ({
      ...prev,
      archivedIds: prev.archivedIds.includes(alert.id)
        ? prev.archivedIds
        : [...prev.archivedIds, alert.id],
    }));
  }, []);
  const handleUnarchive = useCallback((alert: Alert) => {
    setHub((prev) => ({
      ...prev,
      archivedIds: prev.archivedIds.filter((x) => x !== alert.id),
    }));
  }, []);
  const handleDelete = useCallback((alert: Alert) => {
    setHub((prev) => ({
      ...prev,
      deletedIds: [...prev.deletedIds, alert.id],
      archivedIds: prev.archivedIds.filter((x) => x !== alert.id),
      readIds: prev.readIds.filter((x) => x !== alert.id),
      starredIds: prev.starredIds.filter((x) => x !== alert.id),
      localAlerts: prev.localAlerts.filter((a) => a.id !== alert.id),
    }));
    setSelected((cur) => (cur && cur.id === alert.id ? null : cur));
  }, []);

  const handleRetry = useCallback(
    async (source: Source) => {
      setRetryingSourceId(source.id);
      const { data: fresh, fromLive } = await fetchAlerts();
      setRetryingSourceId(null);
      if (fromLive) {
        setData(fresh);
        showToast(`${source.name} checked — live data refreshed.`, 'success');
      } else {
        showToast(
          `Could not reach the server for ${source.name} — showing the last saved snapshot.`,
          'error',
        );
      }
    },
    [showToast],
  );

  const handleToggleSource = useCallback(
    (source: Source) => {
      const next = !source.enabled;
      setHub((prev) => ({
        ...prev,
        sourceEnabled: { ...prev.sourceEnabled, [source.key]: next },
      }));
      showToast(
        `${source.name} ${next ? 'enabled' : 'disabled'}.`,
        'success',
      );
    },
    [showToast],
  );

  const handleUpdatePreferences = useCallback(
    (patch: Partial<Preferences>) => {
      setHub((prev) => ({
        ...prev,
        preferences: { ...prev.preferences, ...patch },
      }));
    },
    [],
  );

  const handleAddTask = useCallback(
    (title: string, dueAt: string | null, reminders: boolean) => {
      const task: TaskItem = {
        id:
          typeof crypto.randomUUID === 'function'
            ? crypto.randomUUID()
            : `task-${Date.now()}`,
        title,
        dueAt,
        reminders,
        completed: false,
        createdAt: new Date().toISOString(),
      };
      setHub((prev) => ({ ...prev, tasks: [task, ...prev.tasks] }));
      showToast('Task added.', 'success');
    },
    [showToast],
  );

  const handleToggleTask = useCallback(
    (task: TaskItem) => {
      const completing = !task.completed;
      setHub((prev) => {
        const tasks = prev.tasks.map((t) =>
          t.id === task.id ? { ...t, completed: completing } : t,
        );
        if (!completing) return { ...prev, tasks };
        const alert: Alert = {
          id: Date.now(),
          externalId: `task-${task.id}`,
          title: `Task completed: ${task.title}`,
          body: `You completed "${task.title}"${task.dueAt ? ` (due ${task.dueAt})` : ''}.`,
          sender: 'AlertHub Tasks',
          sourceType: 'task',
          sourceLabel: 'Tasks',
          severity: 'normal',
          category: '',
          sourceUrl: null,
          occurredAt: new Date().toISOString(),
          receivedAt: new Date().toISOString(),
          isRead: false,
          isStarred: false,
          deliveryState: 'delivered',
          dedupeKey: `task:${task.id}`,
        };
        const log: DeliveryLog = {
          id: `local-${Date.now()}`,
          alertId: alert.id,
          attemptedAt: new Date().toISOString(),
          channel: 'in_app',
          detail: `Task "${task.title}" completed and posted to the feed.`,
          deviceId: null,
          status: 'delivered',
        };
        return {
          ...prev,
          tasks,
          localAlerts: [alert, ...prev.localAlerts],
          localLogs: [log, ...prev.localLogs],
        };
      });
      if (completing) showToast('Task completed — posted to your feed.', 'success');
    },
    [showToast],
  );

  const handleDeleteTask = useCallback((task: TaskItem) => {
    setHub((prev) => ({
      ...prev,
      tasks: prev.tasks.filter((t) => t.id !== task.id),
    }));
  }, []);

  const handleDeviceAdded = useCallback((device: Device) => {
    setHub((prev) => ({
      ...prev,
      devices: prev.devices.some((d) => d.id === device.id)
        ? prev.devices.map((d) => (d.id === device.id ? device : d))
        : [device, ...prev.devices],
    }));
    if ('Notification' in window) setPermission(Notification.permission);
  }, []);
  const handleDeviceUpdated = useCallback(
    (id: string, patch: Partial<Device>) => {
      setHub((prev) => ({
        ...prev,
        devices: prev.devices.map((d) =>
          d.id === id ? { ...d, ...patch } : d,
        ),
      }));
    },
    [],
  );
  const handleDeviceRemoved = useCallback((id: string) => {
    setHub((prev) => ({
      ...prev,
      devices: prev.devices.filter((d) => d.id !== id),
    }));
  }, []);
  const handleLogAdded = useCallback((log: DeliveryLog) => {
    setHub((prev) => ({ ...prev, localLogs: [log, ...prev.localLogs] }));
  }, []);

  const navigate = useCallback((v: View) => {
    setView(v);
    setSelected(null);
    setDrawerOpen(false);
    window.scrollTo({ top: 0 });
  }, []);

  /** Global search: typing in the top bar jumps to the Alerts inbox. */
  const handleSearchChange = useCallback(
    (q: string) => {
      setGlobalQuery(q);
      if (q.trim() && view !== 'alerts') navigate('alerts');
    },
    [view, navigate],
  );

  /** Manual refresh from /api/alerts (server first, seed on failure). */
  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    fetchAlerts()
      .then(({ data: fresh, fromLive }) => {
        if (fromLive) {
          setData(fresh);
          showToast('Refreshed from the server.', 'success');
        } else {
          showToast('Refresh failed — showing the saved snapshot.', 'error');
        }
      })
      .finally(() => setRefreshing(false));
  }, [showToast]);

  /** Theme toggle: dark ⇄ light. */
  const handleToggleTheme = useCallback(() => {
    setHub((prev) => ({
      ...prev,
      preferences: {
        ...prev.preferences,
        theme: isDark ? 'light' : 'dark',
      },
    }));
  }, [isDark]);

  /** Banner "View": open the alert (read/star state untouched). */
  const handleBannerView = useCallback(
    (alert: Alert) => {
      setBannerAlert(null);
      navigate('alerts');
      setSelected(alert);
    },
    [navigate],
  );

  const meta = VIEW_META[view];

  return (
    <div className="app-shell">
      {/* Aurora / wave background (Worker A): fixed layer behind all content,
          pointer-events none, aria-hidden. Blobs drift on transform/opacity
          only; the SVG wave ribbon slides ±2.5% horizontally. */}
      <div className="aurora-bg" aria-hidden="true">
        <div className="aurora-blob aurora-blob-b1" />
        <div className="aurora-blob aurora-blob-b2" />
        <div className="aurora-blob aurora-blob-b3" />
        <div className="aurora-blob aurora-blob-b4" />
        <div className="aurora-ribbon aurora-ribbon-r1" />
        <div className="aurora-ribbon aurora-ribbon-r2" />
        <svg className="aurora-wave" viewBox="0 0 1440 320" preserveAspectRatio="none" aria-hidden="true" focusable="false">
          <defs>
            <linearGradient id="aurora-wave-grad" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" stopColor="#647BFF" />
              <stop offset="0.5" stopColor="#28C6E8" />
              <stop offset="1" stopColor="#A56CFF" />
            </linearGradient>
            <linearGradient id="aurora-wave-fill" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" stopColor="#647BFF" stopOpacity="0.35" />
              <stop offset="0.5" stopColor="#28C6E8" stopOpacity="0.28" />
              <stop offset="1" stopColor="#A56CFF" stopOpacity="0.35" />
            </linearGradient>
          </defs>
          <path
            d="M0,160 C240,80 480,240 720,160 C960,80 1200,240 1440,160 L1440,320 L0,320 Z"
            fill="url(#aurora-wave-fill)"
            opacity="0.3"
          />
          <path
            d="M0,200 C240,140 480,260 720,200 C960,140 1200,260 1440,200"
            fill="none"
            stroke="url(#aurora-wave-grad)"
            strokeWidth="2"
            opacity="0.4"
          />
        </svg>
      </div>
      <Sidebar
        view={view}
        unread={unreadCount}
        profileName={data.profile.name}
        profileLine={`${data.profile.programme} · ${data.profile.section}`}
        isDark={isDark}
        onNavigate={navigate}
      />
      <div className="main">
        <TopBar
          title={meta.title}
          subtitle={meta.subtitle}
          lastCheckedAt={gmailSource?.lastCheckedAt ?? null}
          searchQuery={globalQuery}
          onSearchChange={handleSearchChange}
          onRefresh={handleRefresh}
          refreshing={refreshing}
          isDark={isDark}
          onToggleTheme={handleToggleTheme}
          unread={unreadCount}
          bellRing={bellRing}
          onBellClick={() => navigate('alerts')}
          profileName={data.profile.name}
          profileEmail={data.preferences.watchedEmail}
          profileLine={`${data.profile.programme} · ${data.profile.section}`}
          onOpenSettings={() => navigate('settings')}
          onMenuClick={() => setDrawerOpen(true)}
          onSearchIconClick={() => navigate('alerts')}
        />
        <NavDrawer
          open={drawerOpen}
          view={view}
          unread={unreadCount}
          profileName={data.profile.name}
          profileLine={`${data.profile.programme} · ${data.profile.section}`}
          isDark={isDark}
          onNavigate={navigate}
          onClose={() => setDrawerOpen(false)}
        />
        <main className="content">
          <div className="page-view" key={view}>
          {view === 'overview' ? (
            <Overview
              alerts={activeAlerts}
              sources={sources}
              devices={hub.devices}
              permission={permission}
              installed={installed}
              lastDelivery={lastDelivery}
              retryingSourceId={retryingSourceId}
              onRetry={handleRetry}
              onNavigate={navigate}
              onOpenAlert={setSelected}
              onToggleRead={handleToggleRead}
              onToggleStar={handleToggleStar}
              onArchive={handleArchive}
              onDelete={handleDelete}
            />
          ) : null}
          {view === 'alerts' ? (
            <AlertsPage
              alerts={activeAlerts}
              archived={archivedAlerts}
              sources={sources}
              query={globalQuery}
              onQueryChange={handleSearchChange}
              onOpenAlert={setSelected}
              onToggleRead={handleToggleRead}
              onToggleStar={handleToggleStar}
              onArchive={handleArchive}
              onDelete={handleDelete}
              onUnarchive={handleUnarchive}
            />
          ) : null}
          {view === 'email' ? (
            <EmailPage
              source={gmailSource}
              watchedEmail={data.preferences.watchedEmail}
              onRetry={handleRetry}
              retrying={retryingSourceId === gmailSource?.id}
            />
          ) : null}
          {view === 'cuims' ? (
            <CuimsPage
              source={cuimsSource}
              marks={data.marks}
              onRetry={handleRetry}
              retrying={retryingSourceId === cuimsSource?.id}
            />
          ) : null}
          {view === 'tasks' ? (
            <TasksPage
              tasks={hub.tasks}
              onAddTask={handleAddTask}
              onToggleComplete={handleToggleTask}
              onDeleteTask={handleDeleteTask}
            />
          ) : null}
          {view === 'sources' ? (
            <SourcesPage
              sources={sources}
              retryingSourceId={retryingSourceId}
              onRetry={handleRetry}
              onToggleEnabled={handleToggleSource}
            />
          ) : null}
          {view === 'devices' ? (
            <DevicesPage
              devices={hub.devices}
              deliveryLogs={allLogs}
              showToast={showToast}
              onDeviceAdded={handleDeviceAdded}
              onDeviceUpdated={handleDeviceUpdated}
              onDeviceRemoved={handleDeviceRemoved}
              onLogAdded={handleLogAdded}
            />
          ) : null}
          {view === 'history' ? (
            <HistoryPage
              logs={allLogs}
              archived={archivedAlerts}
              onOpenAlert={setSelected}
              onToggleRead={handleToggleRead}
              onToggleStar={handleToggleStar}
              onUnarchive={handleUnarchive}
              onDelete={handleDelete}
            />
          ) : null}
          {view === 'settings' ? (
            <SettingsPage
              profile={data.profile}
              preferences={hub.preferences}
              alerts={activeAlerts}
              sources={sources}
              tasks={hub.tasks}
              devices={hub.devices}
              deliveryLogs={allLogs}
              onUpdatePreferences={handleUpdatePreferences}
              showToast={showToast}
            />
          ) : null}
          </div>
        </main>
      </div>
      <BottomNav view={view} unread={unreadCount} onNavigate={navigate} />
      {selected ? (
        <AlertDetail
          alert={selected}
          onClose={() => setSelected(null)}
          onToggleRead={handleToggleRead}
          onToggleStar={handleToggleStar}
          onArchive={(a) => {
            handleArchive(a);
            setSelected(null);
          }}
          onDelete={handleDelete}
        />
      ) : null}
      <NotificationBanner
        alert={bannerAlert}
        onView={handleBannerView}
        onDismiss={dismissBanner}
      />
      <ToastView toast={toast} onDismiss={dismissToast} />
    </div>
  );
}
