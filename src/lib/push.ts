/**
 * Web Push helpers (VAPID). The public key comes from
 * import.meta.env.VITE_VAPID_PUBLIC_KEY and is never hardcoded.
 * If it is missing, push subscription is unavailable and the UI must say so.
 */

export function getVapidPublicKey(): string | null {
  const key = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined;
  return key && key.trim().length > 0 ? key : null;
}

export function isPushConfigured(): boolean {
  return getVapidPublicKey() !== null;
}

export function isPushSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

export function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding)
    .replace(/-/g, '+')
    .replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i += 1) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export interface SubscribeResult {
  ok: boolean;
  deviceId: string | null;
  endpoint: string | null;
  message: string;
}

/**
 * Subscribe this device to push. Call only from a user tap.
 * Requests notification permission first when it is still 'default'.
 */
export async function subscribe(deviceName: string): Promise<SubscribeResult> {
  if (!isPushSupported()) {
    return {
      ok: false,
      deviceId: null,
      endpoint: null,
      message: 'Push notifications are not supported in this browser.',
    };
  }
  const vapidKey = getVapidPublicKey();
  if (!vapidKey) {
    return {
      ok: false,
      deviceId: null,
      endpoint: null,
      message: 'Push server not configured yet — no VAPID public key is set.',
    };
  }
  if (Notification.permission === 'default') {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      return {
        ok: false,
        deviceId: null,
        endpoint: null,
        message: `Notification permission is "${permission}" — phone alerts stay off.`,
      };
    }
  } else if (Notification.permission !== 'granted') {
    return {
      ok: false,
      deviceId: null,
      endpoint: null,
      message: `Notification permission is "${Notification.permission}" — enable it in the browser site settings to subscribe.`,
    };
  }

  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      // The helper builds the array from offset 0, so its buffer is the key.
      applicationServerKey: urlBase64ToUint8Array(vapidKey).buffer as ArrayBuffer,
    });
    const deviceId =
      typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `device-${Date.now()}`;
    const payload = {
      deviceId,
      deviceName,
      subscription: subscription.toJSON(),
    };
    const res = await fetch('/api/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      await subscription.unsubscribe().catch(() => undefined);
      return {
        ok: false,
        deviceId: null,
        endpoint: null,
        message: `Push subscription failed on the server (${res.status}). The subscription was removed again.`,
      };
    }
    return {
      ok: true,
      deviceId,
      endpoint: subscription.endpoint,
      message: 'This device is subscribed to push notifications.',
    };
  } catch (err) {
    return {
      ok: false,
      deviceId: null,
      endpoint: null,
      message: `Push subscription failed: ${err instanceof Error ? err.message : 'unknown error'}`,
    };
  }
}

/** Unsubscribe this device from push and return whether it was removed. */
export async function unsubscribe(): Promise<{ ok: boolean; message: string }> {
  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
      return { ok: true, message: 'No push subscription existed on this device.' };
    }
    const done = await subscription.unsubscribe();
    return done
      ? { ok: true, message: 'Push subscription removed from this device.' }
      : { ok: false, message: 'Could not remove the push subscription.' };
  } catch (err) {
    return {
      ok: false,
      message: `Unsubscribe failed: ${err instanceof Error ? err.message : 'unknown error'}`,
    };
  }
}

export type TestPushMode = 'server' | 'local' | 'failed';

export interface TestPushResult {
  mode: TestPushMode;
  sent: number;
  message: string;
  /** Why the server did not send it (e.g. "server returned 503"), if any.
   *  Kept out of the notification itself — for the in-app log/status only. */
  serverError: string | null;
}

/**
 * Send a real test notification.
 * - If the server reports sent > 0, the service worker's push handler shows
 *   it — no local notification is also shown (no duplicates).
 * - If the server call fails or reports 0 sent (VAPID/KV not configured),
 *   fall back to registration.showNotification so the user still sees a
 *   REAL system notification. The notification itself is always clean
 *   ("AlertHub test" / "This is a test notification from AlertHub.") — the
 *   server error is never put inside it; it is returned in `serverError`
 *   so the app can record it in the delivery log and show the server-push
 *   status on the Phone Devices page instead.
 * Never a toast pretending to be a notification.
 */
export async function testPush(
  deviceId: string | null,
): Promise<TestPushResult> {
  let serverSent = 0;
  let serverError: string | null = null;
  try {
    const res = await fetch('/api/test-push', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(deviceId ? { deviceId } : {}),
    });
    if (res.ok) {
      const json = (await res.json()) as { sent?: number; ok?: boolean };
      serverSent = typeof json.sent === 'number' ? json.sent : json.ok ? 1 : 0;
    } else {
      serverError = `server returned ${res.status}`;
    }
  } catch (err) {
    serverError = err instanceof Error ? err.message : 'network error';
  }

  if (serverSent > 0) {
    return {
      mode: 'server',
      sent: serverSent,
      serverError: null,
      message: `Test push sent by the server to ${serverSent} device${serverSent === 1 ? '' : 's'} — watch for the system notification.`,
    };
  }

  // Fallback: show a real system notification locally. The notification
  // body is always the same clean test text — never the server error.
  try {
    const registration = await navigator.serviceWorker.ready;
    await registration.showNotification('AlertHub test', {
      body: 'This is a test notification from AlertHub.',
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      tag: 'alerthub-test',
    });
    // The local fallback is shown directly by the page (no push event, so
    // the service worker posts no telemetry for it) — record the display
    // here so "last notification displayed" on the Devices page stays true.
    recordNotificationShown('alerthub-test');
    return {
      mode: 'local',
      sent: 0,
      serverError,
      message:
        'Push server did not send the test — a real system notification was shown locally on this device instead.',
    };
  } catch (err) {
    return {
      mode: 'failed',
      sent: 0,
      serverError,
      message: `Test notification failed: ${err instanceof Error ? err.message : 'unknown error'}`,
    };
  }
}

/* ------------------------------------------------------------------ */
/* Telemetry: when the last push arrived / notification was displayed. */
/* Written by the service worker via postMessage (see                 */
/* setupServiceWorkerMessageListener) and by the local test fallback   */
/* above; read by the Devices page diagnostics. Nothing here leaves   */
/* the device — it is plain localStorage, no endpoint is ever sent.   */
/* ------------------------------------------------------------------ */

const LAST_PUSH_KEY = 'alerthub:lastPush';
const LAST_NOTIFICATION_KEY = 'alerthub:lastNotification';

export interface PushTelemetryEntry {
  alertId: string | number | null;
  at: string; // ISO timestamp of the event
}

function readTelemetry(key: string): PushTelemetryEntry | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PushTelemetryEntry;
    if (parsed && typeof parsed.at === 'string') return parsed;
    return null;
  } catch {
    return null;
  }
}

function writeTelemetry(key: string, alertId: string | number | null): void {
  try {
    localStorage.setItem(
      key,
      JSON.stringify({ alertId, at: new Date().toISOString() }),
    );
  } catch {
    // Storage unavailable (private mode / quota) — telemetry is best-effort.
  }
}

/** Record that a push message arrived (service worker 'push' event). */
export function recordPushReceived(alertId: string | number | null): void {
  writeTelemetry(LAST_PUSH_KEY, alertId);
}

/** Record that a notification was displayed (after showNotification). */
export function recordNotificationShown(
  alertId: string | number | null,
): void {
  writeTelemetry(LAST_NOTIFICATION_KEY, alertId);
}

export interface PushDiagnostics {
  lastPush: PushTelemetryEntry | null;
  lastNotification: PushTelemetryEntry | null;
}

/** Live diagnostics snapshot for the Devices page. Null = "none yet". */
export function getDiagnostics(): PushDiagnostics {
  return {
    lastPush: readTelemetry(LAST_PUSH_KEY),
    lastNotification: readTelemetry(LAST_NOTIFICATION_KEY),
  };
}

export type ServiceWorkerPushMessageType =
  | 'push-received'
  | 'notification-shown';

export interface ServiceWorkerPushMessage {
  type: ServiceWorkerPushMessageType;
  alertId?: string | number | null;
  at?: string;
}

/**
 * Listen for service-worker messages ('message' event on
 * navigator.serviceWorker). Records telemetry for 'push-received' /
 * 'notification-shown' and forwards every recognised message to `onMessage`
 * (the App uses it to show the foreground banner). Returns an unsubscribe
 * function. Safe to call when push/service workers are unsupported — it
 * simply returns a no-op.
 */
export function setupServiceWorkerMessageListener(
  onMessage?: (message: ServiceWorkerPushMessage) => void,
): () => void {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
    return () => undefined;
  }
  const handler = (event: MessageEvent) => {
    const data = event.data as ServiceWorkerPushMessage | null;
    if (!data || typeof data !== 'object' || typeof data.type !== 'string') {
      return;
    }
    if (data.type === 'push-received') {
      recordPushReceived(data.alertId ?? null);
    } else if (data.type === 'notification-shown') {
      recordNotificationShown(data.alertId ?? null);
    } else {
      return;
    }
    onMessage?.(data);
  };
  navigator.serviceWorker.addEventListener('message', handler);
  return () => navigator.serviceWorker.removeEventListener('message', handler);
}
