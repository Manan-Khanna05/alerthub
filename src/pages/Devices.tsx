import { useCallback, useEffect, useRef, useState } from 'react';
import type { DeliveryLog, Device, ToastKind } from '../lib/types';
import { formatDateTime, relativeTime } from '../lib/format';
import { EmptyState } from '../components/Cards';
import { Icon } from '../components/Icons';
import {
  getDiagnostics,
  isPushConfigured,
  isPushSupported,
  subscribe,
  testPush,
  unsubscribe,
  type PushDiagnostics,
} from '../lib/push';

interface DevicesPageProps {
  devices: Device[];
  deliveryLogs: DeliveryLog[];
  showToast: (message: string, kind?: ToastKind) => void;
  onDeviceAdded: (device: Device) => void;
  onDeviceUpdated: (id: string, patch: Partial<Device>) => void;
  onDeviceRemoved: (id: string) => void;
  onLogAdded: (log: DeliveryLog) => void;
}

export function DevicesPage({
  devices,
  deliveryLogs,
  showToast,
  onDeviceAdded,
  onDeviceUpdated,
  onDeviceRemoved,
  onLogAdded,
}: DevicesPageProps) {
  const [permission, setPermission] = useState<
    NotificationPermission | 'unsupported'
  >(() =>
    'Notification' in window ? Notification.permission : 'unsupported',
  );
  const [installed, setInstalled] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return (
      window.matchMedia('(display-mode: standalone)').matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true
    );
  });
  const [busy, setBusy] = useState(false);
  const [deviceName, setDeviceName] = useState('');
  /** Last server-side failure from a test (e.g. "server returned 503").
   *  Shown on this page only — never inside a notification. */
  const [lastServerError, setLastServerError] = useState<string | null>(null);
  const lastTestRef = useRef(0);

  /* ---- Notification Diagnostics (live values, refreshed on demand) ---- */
  const [diag, setDiag] = useState<PushDiagnostics>(() => getDiagnostics());
  const [pushSub, setPushSub] = useState<
    'checking' | 'subscribed' | 'none' | 'unsupported' | 'error'
  >('checking');
  const [swState, setSwState] = useState<
    'checking' | 'active' | 'waiting' | 'installing' | 'none' | 'unsupported' | 'error'
  >('checking');
  /** Cache name the service worker actually installed (alerthub-v15 expected). */
  const [cacheVersion, setCacheVersion] = useState<string | null>(null);
  /** Live push-server health from GET /api/push/health: 'ready' only when
   *  the response itself says ok (store connected and VAPID configured).
   *  The endpoint answers 200 even when the store is down, so the body's
   *  `ok` field — not the HTTP status — decides readiness. */
  const [pushHealth, setPushHealth] = useState<{
    status: 'unknown' | 'ready' | 'not-ready';
    detail: string;
  } | null>(null);

  const refreshDiagnostics = useCallback(async () => {
    setDiag(getDiagnostics());
    if (!('serviceWorker' in navigator)) {
      setSwState('unsupported');
      setPushSub('unsupported');
      return;
    }
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      if (!reg) {
        setSwState('none');
        setPushSub('none');
      } else {
        if (reg.active) setSwState('active');
        else if (reg.waiting) setSwState('waiting');
        else if (reg.installing) setSwState('installing');
        else setSwState('none');
        const sub = await reg.pushManager.getSubscription();
        // The endpoint itself is never displayed — only whether one exists.
        setPushSub(sub ? 'subscribed' : 'none');
      }
    } catch {
      setSwState('error');
      setPushSub('error');
    }
    try {
      if ('caches' in window) {
        const keys = await caches.keys();
        setCacheVersion(keys.find((k) => k.startsWith('alerthub-')) ?? null);
      }
    } catch {
      // Cache list unreadable — leave the version blank.
    }
    try {
      const controller = new AbortController();
      const timer = window.setTimeout(() => controller.abort(), 4000);
      let res: Response;
      try {
        res = await fetch('/api/push/health', { signal: controller.signal });
      } finally {
        window.clearTimeout(timer);
      }
      if (!res.ok) {
        setPushHealth({
          status: 'unknown',
          detail: `Health endpoint answered ${res.status} — no delivery data available.`,
        });
      } else {
        const json = (await res.json().catch(() => null)) as {
          ok?: unknown;
          store?: unknown;
          vapid?: unknown;
          subscriptions?: number | null;
        } | null;
        const count =
          json && typeof json.subscriptions === 'number'
            ? json.subscriptions
            : null;
        // The endpoint answers 200 even when the store is down, so the
        // body's `ok` field — not the HTTP status — decides readiness.
        setPushHealth({
          status: json?.ok === true ? 'ready' : 'not-ready',
          detail: [
            `store: ${json?.store ?? 'unknown'}`,
            `VAPID: ${json?.vapid ?? 'unknown'}`,
            `subscriptions: ${count ?? 'unknown'}`,
          ].join(' · '),
        });
      }
    } catch {
      setPushHealth({
        status: 'unknown',
        detail: 'Health endpoint did not answer.',
      });
    }
  }, []);

  useEffect(() => {
    void refreshDiagnostics();
  }, [refreshDiagnostics]);

  useEffect(() => {
    const onInstalled = () => setInstalled(true);
    window.addEventListener('appinstalled', onInstalled);
    return () => window.removeEventListener('appinstalled', onInstalled);
  }, []);

  const refreshPermission = () => {
    if ('Notification' in window) setPermission(Notification.permission);
  };

  const thisDevice = devices[0] ?? null;

  const handleEnable = async () => {
    if (!isPushSupported()) {
      showToast('Push notifications are not supported in this browser.', 'error');
      return;
    }
    if (permission === 'default') {
      const result = await Notification.requestPermission();
      setPermission(result);
      if (result !== 'granted') {
        showToast(`Notification permission is "${result}".`, 'error');
        return;
      }
      if (!isPushConfigured()) {
        // No VAPID key in this build: permission-only path, so the local
        // test notification still works.
        onDeviceAdded({
          id:
            typeof crypto.randomUUID === 'function'
              ? crypto.randomUUID()
              : `device-${Date.now()}`,
          name: deviceName.trim() || 'This device',
          endpoint: null,
          permission: 'granted',
          subscribed: false,
          createdAt: new Date().toISOString(),
          lastTestAt: null,
        });
        showToast(
          'Notifications allowed. Background push is unavailable in this build (no VAPID key) — local test notifications still work.',
          'success',
        );
        return;
      }
      // Granted and VAPID is configured — fall through to subscribe below.
    } else if (permission !== 'granted') {
      showToast(
        'Notifications are blocked — enable them in the browser site settings.',
        'error',
      );
      return;
    }
    // Permission is granted: subscribe for real background push. If it
    // fails, show the real error from the response — never a stale
    // "not configured" message (VAPID is configured in production).
    setBusy(true);
    const res = await subscribe(deviceName.trim() || 'This device');
    refreshPermission();
    setBusy(false);
    if (res.ok && res.deviceId) {
      onDeviceAdded({
        id: res.deviceId,
        name: deviceName.trim() || 'This device',
        endpoint: res.endpoint,
        permission: 'granted',
        subscribed: true,
        createdAt: new Date().toISOString(),
        lastTestAt: null,
      });
      showToast(res.message, 'success');
    } else {
      showToast(res.message, 'error');
    }
    void refreshDiagnostics();
  };

  const handleDisable = async () => {
    setBusy(true);
    const res = await unsubscribe();
    refreshPermission();
    setBusy(false);
    if (thisDevice) onDeviceRemoved(thisDevice.id);
    showToast(res.message, res.ok ? 'success' : 'error');
    // Refresh so the subscription state (and the Enable button) updates.
    void refreshDiagnostics();
  };

  const handleTest = async () => {
    const now = Date.now();
    if (now - lastTestRef.current < 5000) {
      showToast('Please wait a few seconds between test notifications.', 'info');
      return;
    }
    lastTestRef.current = now;
    if (permission !== 'granted') {
      showToast(
        'Enable phone alerts first — the test needs notification permission.',
        'error',
      );
      return;
    }
    setBusy(true);
    const result = await testPush(thisDevice?.id ?? null);
    setBusy(false);
    // The server failure is recorded here in the app (log + status below),
    // never inside the notification the user sees.
    if (result.serverError) setLastServerError(result.serverError);
    const log: DeliveryLog = {
      id: `local-${Date.now()}`,
      alertId: null,
      attemptedAt: new Date().toISOString(),
      channel: result.mode === 'server' ? 'push' : 'local',
      detail:
        result.mode === 'server'
          ? `Test notification sent by the push server (${result.sent} device${result.sent === 1 ? '' : 's'}).`
          : result.mode === 'local'
            ? `Push server did not send the test${result.serverError ? ` (${result.serverError})` : ''} — shown locally on this device as a real system notification.`
            : `Test notification failed to send or display${result.serverError ? ` (server: ${result.serverError})` : ''}.`,
      deviceId: thisDevice?.id ?? null,
      status: result.mode === 'failed' ? 'failed' : 'delivered',
    };
    onLogAdded(log);
    if (thisDevice) {
      onDeviceUpdated(thisDevice.id, { lastTestAt: new Date().toISOString() });
    }
    showToast(result.message, result.mode === 'failed' ? 'error' : 'success');
  };

  const logs = [...deliveryLogs]
    .sort(
      (a, b) =>
        new Date(b.attemptedAt).getTime() - new Date(a.attemptedAt).getTime(),
    )
    .slice(0, 30);

  return (
    <div>
      <div className="page-head">
        <h1>Phone devices</h1>
        <p>Real push notifications on the devices you use.</p>
      </div>

      <div className="card glass glow-blue">
        <div className="source-card-head">
          <span className="source-icon">
            <Icon name="phone" />
          </span>
          <div>
            <h3>This device</h3>
            <div className="src-sub">
              Notification permission:{' '}
              {permission === 'unsupported' ? 'not supported' : permission}
            </div>
          </div>
          {installed ? (
            <span className="pill pill-ok">Installed</span>
          ) : (
            <span className="pill pill-neutral">Not installed</span>
          )}
        </div>

        <div className="note info">
          <p>
            Background push while the app is closed needs the push server
            (VAPID). The on-screen test below works without it — it shows a
            real system notification on this device.
          </p>
          {!isPushConfigured() ? (
            <p>
              <strong>Push server not configured yet</strong> — no VAPID public
              key is set, so subscribing this device to background push is
              disabled. You can still allow notifications and use the local
              test.
            </p>
          ) : null}
        </div>

        <div className="field" style={{ maxWidth: 320 }}>
          <label htmlFor="device-name">Device name</label>
          <input
            id="device-name"
            className="input"
            type="text"
            value={deviceName}
            onChange={(e) => setDeviceName(e.target.value)}
            placeholder="e.g. Manan's phone"
          />
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {permission === 'granted' ? (
            <button
              type="button"
              className="btn btn-primary"
              disabled={busy}
              onClick={handleTest}
            >
              Send test notification
            </button>
          ) : null}
          {pushSub === 'none' ? (
            <button
              type="button"
              className="btn btn-primary"
              disabled={busy || permission === 'unsupported'}
              onClick={handleEnable}
            >
              <Icon name="bell" /> Enable phone alerts
            </button>
          ) : null}
          {pushSub === 'subscribed' ? (
            <button
              type="button"
              className="btn btn-danger"
              disabled={busy}
              onClick={handleDisable}
            >
              Disable push on this device
            </button>
          ) : null}
        </div>
        <p style={{ fontSize: 12.5, color: 'var(--muted)', marginTop: 10 }}>
          Permission is only requested when you tap “Enable phone alerts” —
          never on page load.
        </p>
        <div
          className="phone-preview"
          aria-label="Preview of the test notification on the phone"
        >
          <img src="/icons/icon-192.png" alt="" draggable={false} />
          <div>
            <strong>AlertHub test</strong>
            <span>This is a test notification from AlertHub.</span>
          </div>
          <span className="phone-preview-time">now</span>
        </div>
        <p style={{ fontSize: 12.5, color: 'var(--muted)', marginTop: 8 }}>
          What the system notification looks like — the app icon and text are
          exactly what the service worker sends for the test.
        </p>
      </div>

      <div className="card glass glow-cyan">
        <div className="source-card-head">
          <span className="source-icon">
            <Icon name="alert" />
          </span>
          <div>
            <h3>Server push setup</h3>
            <div className="src-sub">
              Background push while the app is closed needs the push server
              and its store.
            </div>
          </div>
          {pushHealth?.status === 'ready' ? (
            <span className="pill pill-ok">Ready</span>
          ) : pushHealth?.status === 'not-ready' ? (
            <span className="pill pill-neutral">Not ready</span>
          ) : (
            <span className="pill pill-neutral">Unknown</span>
          )}
        </div>
        {pushHealth?.status === 'ready' ? (
          <p style={{ margin: '4px 0 0', fontSize: 13.5 }}>
            Server push is ready — {pushHealth.detail} — so the push server
            can deliver notifications to this device even when the app is
            closed.
          </p>
        ) : pushHealth?.status === 'not-ready' ? (
          <>
            <p style={{ margin: '4px 0 0', fontSize: 13.5 }}>
              <strong>Server push: not ready</strong> — {pushHealth.detail}.
              The local test works; background push needs the store.
            </p>
            {lastServerError ? (
              <p style={{ margin: '8px 0 0', fontSize: 13.5, color: 'var(--muted)' }}>
                Last test: the server answered {lastServerError} — the
                notification you saw was shown locally on this device.
              </p>
            ) : null}
            <ol className="setup-steps">
              <li>Open the Vercel dashboard → <strong>Storage</strong> → <strong>Create</strong>.</li>
              <li>Choose <strong>Upstash Redis</strong>.</li>
              <li>Create the store and connect it to the <strong>deploy</strong> project.</li>
              <li><strong>Redeploy</strong> the project so the store is injected.</li>
              <li>Come back here and tap “Send test notification” — the server should send it.</li>
            </ol>
            <p style={{ margin: '10px 0 0', fontSize: 12.5, color: 'var(--muted)' }}>
              The store cannot be created from the command line — installing
              Upstash asks for terms acceptance in the browser, so it has to
              be done in the Vercel dashboard.
            </p>
          </>
        ) : (
          <p style={{ margin: '4px 0 0', fontSize: 13.5 }}>
            {pushHealth ? pushHealth.detail : 'Checking the push server…'}
            {' '}Tap “Refresh” in Diagnostics below to check again.
          </p>
        )}
      </div>

      <div className="card glass">
        <div className="source-card-head">
          <span className="source-icon">
            <Icon name="bell" />
          </span>
          <div>
            <h3>Notification Diagnostics</h3>
            <div className="src-sub">
              Live values from this browser — nothing here is guessed.
            </div>
          </div>
          <button
            type="button"
            className="btn btn-sm"
            onClick={() => void refreshDiagnostics()}
          >
            Refresh
          </button>
        </div>
        <dl className="kv">
          <dt>Permission</dt>
          <dd>
            {permission === 'unsupported' ? 'not supported' : permission}
          </dd>
          <dt>Push subscription</dt>
          <dd>
            {pushSub === 'checking'
              ? 'Checking…'
              : pushSub === 'subscribed'
                ? 'Subscribed — a push endpoint exists on this device (endpoint not shown)'
                : pushSub === 'none'
                  ? 'No push subscription on this device'
                  : pushSub === 'unsupported'
                    ? 'Push not supported in this browser'
                    : 'Could not read the subscription'}
          </dd>
          <dt>Service worker</dt>
          <dd>
            {swState === 'checking'
              ? 'Checking…'
              : swState === 'active'
                ? 'Active'
                : swState === 'waiting'
                  ? 'Waiting to activate (reload to pick up the new version)'
                  : swState === 'installing'
                    ? 'Installing…'
                    : swState === 'unsupported'
                      ? 'Not supported in this browser'
                      : swState === 'error'
                        ? 'Could not read the registration'
                        : 'Not registered'}
            {' · '}cache{' '}
            {cacheVersion ?? 'not installed yet (expected alerthub-v15)'}
          </dd>
          <dt>Last push received</dt>
          <dd>
            {diag.lastPush
              ? `${formatDateTime(diag.lastPush.at)}${diag.lastPush.alertId != null ? ` · alert ${diag.lastPush.alertId}` : ''}`
              : 'none yet'}
          </dd>
          <dt>Last notification displayed</dt>
          <dd>
            {diag.lastNotification
              ? `${formatDateTime(diag.lastNotification.at)}${diag.lastNotification.alertId != null ? ` · alert ${diag.lastNotification.alertId}` : ''}`
              : 'none yet'}
          </dd>
          <dt>Server delivery</dt>
          <dd>
            {pushHealth
              ? `${pushHealth.status === 'ready' ? 'Ready' : pushHealth.status === 'not-ready' ? 'Not ready' : 'unknown'} — ${pushHealth.detail}`
              : 'unknown'}
          </dd>
        </dl>

        <h2 style={{ marginTop: 18 }}>
          Android: getting the floating (heads-up) banner
        </h2>
        <p style={{ margin: '4px 0 0', fontSize: 13.5 }}>
          Whether a notification pops up as a floating banner is decided by
          Android and the Chrome notification channel — it is an OS/channel
          setting, not a software error, and this app cannot force a banner
          to pop up. The web app has no way to set a notification&apos;s
          importance: <code>showNotification()</code> simply has no such
          option. What you can check on the phone:
        </p>
        <ol className="setup-steps">
          <li>
            <strong>Alert notifications enabled</strong> — Settings → Apps →
            Chrome → Notifications (or long-press the AlertHub icon → App
            info → Notifications).
          </li>
          <li>
            <strong>“Show as pop-up” enabled</strong> where available —
            in the same Notifications screen, or under Settings →
            Notifications → “Show as pop-up” / “Floating notifications” on
            some devices.
          </li>
          <li>
            <strong>Sound enabled</strong> where you want it — a silent
            channel never pops up.
          </li>
          <li>
            <strong>Notification category not set to silent</strong> — if the
            AlertHub/Chrome category was ever switched to “Silent”, banners
            stop even though notifications still arrive in the shade.
          </li>
          <li>
            <strong>Do Not Disturb checked manually</strong> — DND suppresses
            heads-up banners even when notifications are allowed.
          </li>
        </ol>
        <p style={{ margin: '10px 0 0', fontSize: 13.5 }}>
          Two more facts, so a missing banner is not misread as a bug:
          notifications that replace an earlier one, and silent
          notifications, do not pop up — AlertHub uses a unique tag per
          event and never sends silent notifications. And while the app is
          open, new alerts also appear as an in-app floating banner at the
          top of the screen.
        </p>

        <h2 style={{ marginTop: 18 }}>Optional native route</h2>
        <p style={{ margin: '4px 0 0', fontSize: 13.5 }}>
          The only way to guarantee heads-up control is a native build:
          wrapping the app with Capacitor and sending through Firebase Cloud
          Messaging would let the app create its own Android notification
          channels with high importance. That is documentation only — this
          app stays a PWA and nothing here converts it to native.
        </p>
      </div>

      {!installed ? (
        <div className="card glass">
          <h2>Install AlertHub on your phone</h2>
          <p className="card-sub">
            Installed apps can receive notifications and open full-screen.
          </p>
          <dl className="kv">
            <dt>Android · Chrome</dt>
            <dd>Menu → “Install app” (or “Add to Home screen”).</dd>
            <dt>iPhone · Safari</dt>
            <dd>
              iOS 16.4+: Share → “Add to Home Screen”. Open from the home-screen
              icon to enable notifications.
            </dd>
          </dl>
        </div>
      ) : null}

      <div className="card glass">
        <h2>Registered devices ({devices.length})</h2>
        {devices.length === 0 ? (
          <EmptyState
            icon="phone"
            title="No devices registered yet"
            body={
              pushSub === 'none'
                ? 'Enable phone alerts above to register this device.'
                : pushSub === 'subscribed'
                  ? 'This device already has a push subscription — tap “Disable push on this device” above to remove it.'
                  : 'No devices registered yet.'
            }
          />
        ) : (
          devices.map((d) => (
            <div className="list-row" key={d.id}>
              <div className="row-main">
                <strong>{d.name}</strong>
                <span>
                  {d.subscribed ? 'Push subscribed' : 'Notifications allowed (no push subscription)'}
                  {' · '}Added {formatDateTime(d.createdAt)}
                  {d.lastTestAt ? ` · Last test ${relativeTime(d.lastTestAt)}` : ''}
                </span>
              </div>
              <button
                type="button"
                className="btn btn-sm"
                onClick={() => {
                  const name = window.prompt('Rename device', d.name);
                  if (name && name.trim()) {
                    onDeviceUpdated(d.id, { name: name.trim() });
                    showToast('Device renamed.', 'success');
                  }
                }}
              >
                Rename
              </button>
              <button
                type="button"
                className="btn btn-sm btn-danger"
                onClick={() => onDeviceRemoved(d.id)}
              >
                Revoke
              </button>
            </div>
          ))
        )}
      </div>

      <div className="card glass">
        <h2>Delivery log</h2>
        <p className="card-sub">
          Latest {logs.length} entries, including local test notifications.
        </p>
        {logs.length === 0 ? (
          <EmptyState
            icon="clock"
            title="No deliveries logged"
            body="Deliveries and test notifications will be listed here."
          />
        ) : (
          logs.map((l) => (
            <div className="list-row" key={String(l.id)}>
              <div className="row-main">
                <strong>
                  {l.channel === 'push'
                    ? 'Push'
                    : l.channel === 'local'
                      ? 'Local notification'
                      : 'In app'}
                  {' · '}
                  {l.status === 'delivered'
                    ? 'Delivered'
                    : l.status === 'shown_locally'
                      ? 'Shown locally'
                      : 'Failed'}
                </strong>
                <span>
                  {formatDateTime(l.attemptedAt)} IST · {l.detail}
                </span>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
