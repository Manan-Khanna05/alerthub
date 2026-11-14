/**
 * Academic Marks Update Simulator (Settings → Notification Testing).
 *
 * HARD RULES (enforced here, not just in the UI):
 * - Every simulated alert is labelled TEST / SIMULATION in the feed, in the
 *   detail view and in the delivery log (title stays the CUIMS wording; the
 *   SIMULATION badge is rendered by AcademicAlertCard / AlertDetail, and the
 *   delivery-log detail is prefixed "SIMULATION — ").
 * - Simulated results are NEVER written into the marks data or the marks
 *   baseline — this module only touches the local alert feed
 *   (hub.localAlerts) and its own simulation-record key.
 * - The simulator works even when CUIMS is unavailable: it never reads the
 *   portal. Its server-push step honestly reports the real backend result
 *   (200 sent / 503 no store / no devices / endpoint missing) and never
 *   claims a phone notification was delivered.
 *
 * WIRING NOTE: SettingsPage receives no add-alert callback from App (App.tsx
 * owns the hub state), so a simulated alert is delivered through the window
 * CustomEvent 'alerthub:alert' carrying { alert, log } in its detail. App.tsx
 * listens for it, adds the alert + log to the hub through React state (so
 * they persist correctly), and shows the foreground banner. The alert is
 * therefore visible in the Alerts feed immediately, with no reload.
 */
import type { AcademicChange, Alert, DeliveryLog, Priority } from './types';
import { loadState, saveState } from './store';
import { severityForPriority } from './priority';

export interface MarksUpdateInput {
  course: string;
  assessment: string;
  previous: number | null;
  updated: number;
  max: number;
  priority: Priority;
  /** Target device id, or null for all devices. */
  deviceId: string | null;
}

export type MarksDirection = AcademicChange['direction'];

export function computeDifference(
  previous: number | null,
  current: number,
): { difference: number; direction: MarksDirection } {
  if (previous === null) return { difference: current, direction: 'new' };
  const difference = current - previous;
  return {
    difference,
    direction:
      difference > 0 ? 'up' : difference < 0 ? 'down' : 'unchanged',
  };
}

/** Human-readable change label, always text — never colour alone. */
export function differenceLabel(academic: AcademicChange): string {
  switch (academic.direction) {
    case 'up':
      return `Improved +${academic.difference}`;
    case 'down':
      return `Decreased −${Math.abs(academic.difference)}`;
    case 'new':
      return 'New result';
    case 'unchanged':
      return 'No change';
  }
}

export function marksUpdateBody(input: MarksUpdateInput): string {
  const { course, assessment, previous, updated, max } = input;
  if (previous === null) {
    return `${course} — ${assessment}. New result published: ${updated}/${max}.`;
  }
  const { difference, direction } = computeDifference(previous, updated);
  if (direction === 'unchanged') {
    return `${course} — ${assessment}. Your marks are unchanged at ${updated}/${max} (previously ${previous}/${max}).`;
  }
  if (direction === 'up') {
    return `${course} — ${assessment}. Your marks have changed from ${previous}/${max} to ${updated}/${max}. Improvement: +${difference} marks.`;
  }
  return `${course} — ${assessment}. Your marks have changed from ${previous}/${max} to ${updated}/${max}. Decreased by ${Math.abs(difference)} marks.`;
}

/** Unique event suffix shared by externalId, dedupe key and push tag. */
export function makeEventId(): string {
  const random = Math.random().toString(36).slice(2, 8);
  return `${Date.now()}-${random}`;
}

export interface BuiltMarksUpdate {
  eventId: string;
  academic: AcademicChange;
  alert: Alert;
}

/** Pure builder — safe to unit-test without a browser. */
export function buildMarksUpdateAlert(
  input: MarksUpdateInput,
  now: Date = new Date(),
): BuiltMarksUpdate {
  const eventId = makeEventId();
  const { difference, direction } = computeDifference(
    input.previous,
    input.updated,
  );
  const academic: AcademicChange = {
    subject: input.course,
    assessment: input.assessment,
    previous: input.previous,
    current: input.updated,
    max: input.max,
    difference,
    direction,
    verified: false,
    isSimulation: true,
  };
  const iso = now.toISOString();
  const alert: Alert = {
    id: now.getTime(),
    externalId: `sim-marks-${eventId}`,
    title: '🎓 CUIMS Marks Updated',
    body: marksUpdateBody(input),
    sender: 'CUIMS (SIMULATION)',
    sourceType: 'cuims',
    sourceLabel: 'CUIMS · Test',
    severity: severityForPriority(input.priority),
    category: 'academic',
    sourceUrl: '/alerts',
    occurredAt: iso,
    receivedAt: iso,
    isRead: false,
    isStarred: false,
    deliveryState: 'logged',
    dedupeKey: `sim-marks:${eventId}`,
    academic,
  };
  return { eventId, academic, alert };
}

export function isSimulationAlert(alert: Alert): boolean {
  return alert.academic?.isSimulation === true;
}

/* ------------------------------------------------------------------ */
/* Simulation records (localStorage, labelled SIMULATION)              */
/* ------------------------------------------------------------------ */

export const SIMULATION_RECORDS_KEY = 'alerthub:simulations:v1';

export interface SimulationRecord {
  kind: 'SIMULATION';
  eventId: string;
  externalId: string;
  createdAt: string;
  course: string;
  assessment: string;
  previous: number | null;
  current: number;
  max: number;
  difference: number;
  direction: MarksDirection;
  priority: Priority;
  deviceId: string | null;
  serverResult: string;
  localFallbackUsed: boolean;
}

export function loadSimulationRecords(): SimulationRecord[] {
  try {
    const raw = localStorage.getItem(SIMULATION_RECORDS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as SimulationRecord[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveSimulationRecord(record: SimulationRecord): void {
  try {
    const records = loadSimulationRecords();
    records.unshift(record);
    localStorage.setItem(
      SIMULATION_RECORDS_KEY,
      JSON.stringify(records.slice(0, 50)),
    );
  } catch {
    // Storage unavailable — the in-app status still shows the result.
  }
}

/* ------------------------------------------------------------------ */
/* Local feed + delivery log (via the existing store helpers)          */
/* ------------------------------------------------------------------ */

export function addSimulatedAlertToLocalStore(
  alert: Alert,
  serverNote: string,
): void {
  const log: DeliveryLog = {
    id: `sim-log-${alert.externalId}`,
    alertId: alert.id,
    attemptedAt: new Date().toISOString(),
    channel: 'in_app',
    detail: `SIMULATION — test marks update for ${alert.academic?.subject ?? 'course'} (${alert.academic?.assessment ?? ''}). Server push: ${serverNote}. This is a test only; no CUIMS result was changed.`,
    deviceId: null,
    status: 'delivered',
  };
  // App.tsx owns the hub state: it adds the alert + log through React
  // state (so they persist correctly) and shows the foreground banner.
  // Writing straight to localStorage here would be overwritten by App's
  // next saveState — so dispatch only, and fall back to a direct write
  // only when there is no window to dispatch in (tests).
  try {
    window.dispatchEvent(
      new CustomEvent<{ alert: Alert; log: DeliveryLog }>('alerthub:alert', {
        detail: { alert, log },
      }),
    );
  } catch {
    const state = loadState();
    const already = state.localAlerts.some(
      (a) => a.externalId === alert.externalId,
    );
    saveState({
      ...state,
      localAlerts: already
        ? state.localAlerts
        : [alert, ...state.localAlerts],
      localLogs: [log, ...state.localLogs],
    });
  }
}

/* ------------------------------------------------------------------ */
/* Real server-side Web Push                                           */
/* ------------------------------------------------------------------ */

export interface ServerPushResult {
  /** Which endpoint answered: the canonical one, the legacy alias, or none. */
  endpoint: 'push/test' | 'test-push' | 'none';
  status: number | null;
  sent: number;
  /** True only when the canonical endpoint confirmed a send. */
  ok: boolean;
  /** Honest, human-readable result — shown verbatim in the testing status. */
  note: string;
  /** Legacy /api/test-push ignores custom title/body and always sends its
   *  fixed "AlertHub test" text — true when that fallback was used. */
  usedLegacyGenericText: boolean;
}

export interface PushPayload {
  deviceId: string | null;
  title: string;
  body: string;
  tag: string;
  url: string;
  /** Alert id carried so the app can match the push to its feed/banner. */
  alertId?: string;
  /** 'critical' | 'important' | 'normal' | 'low' — drives vibrate /
   *  requireInteraction in the service worker. */
  severity?: string;
}

async function postJson(
  url: string,
  payload: Record<string, unknown>,
): Promise<{ status: number; json: Record<string, unknown> | null }> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  let json: Record<string, unknown> | null = null;
  try {
    json = (await res.json()) as Record<string, unknown>;
  } catch {
    json = null;
  }
  return { status: res.status, json };
}

/**
 * Send the marks-update push through the canonical endpoint
 * POST /api/push/test, falling back to the legacy /api/test-push alias only
 * when the canonical endpoint is missing (404) or unreachable. A 503 or
 * other error from the canonical endpoint is reported as-is — never masked
 * by the fallback and never claimed as delivered.
 */
export async function sendMarksUpdatePush(
  payload: PushPayload,
): Promise<ServerPushResult> {
  const canonicalBody: Record<string, unknown> = {
    title: payload.title,
    body: payload.body,
    tag: payload.tag,
    url: payload.url,
  };
  if (payload.deviceId) canonicalBody.deviceId = payload.deviceId;
  if (payload.alertId) canonicalBody.alertId = payload.alertId;
  if (payload.severity) canonicalBody.severity = payload.severity;

  try {
    const { status, json } = await postJson('/api/push/test', canonicalBody);
    if (status === 200) {
      const sent =
        typeof json?.sent === 'number' ? json.sent : json?.ok ? 1 : 0;
      return {
        endpoint: 'push/test',
        status,
        sent,
        ok: sent > 0,
        note:
          sent > 0
            ? `Server sent the push to ${sent} device${sent === 1 ? '' : 's'} (POST /api/push/test, 200).`
            : 'Server answered 200 but sent to 0 devices — no devices subscribed.',
        usedLegacyGenericText: false,
      };
    }
    if (status !== 404) {
      return {
        endpoint: 'push/test',
        status,
        sent: 0,
        ok: false,
        note:
          status === 503
            ? 'Server push unavailable (503 — push store / VAPID not configured). The test alert is in the local feed only.'
            : `Server push failed (POST /api/push/test returned ${status}). The test alert is in the local feed only.`,
        usedLegacyGenericText: false,
      };
    }
    // 404: canonical endpoint not deployed yet — legacy alias.
  } catch (err) {
    // Network error reaching the canonical endpoint — try the legacy alias.
    const message = err instanceof Error ? err.message : 'network error';
    try {
      return await sendLegacyTestPush(payload.deviceId, message);
    } catch {
      return {
        endpoint: 'none',
        status: null,
        sent: 0,
        ok: false,
        note: `Could not reach the push server (${message}). The test alert is in the local feed only.`,
        usedLegacyGenericText: false,
      };
    }
  }

  // Canonical endpoint missing (404) — legacy alias.
  return sendLegacyTestPush(payload.deviceId, 'canonical endpoint /api/push/test returned 404 (not deployed yet)');
}

async function sendLegacyTestPush(
  deviceId: string | null,
  why: string,
): Promise<ServerPushResult> {
  const { status, json } = await postJson(
    '/api/test-push',
    deviceId ? { deviceId } : {},
  );
  if (status === 200) {
    const sent = typeof json?.sent === 'number' ? json.sent : 0;
    return {
      endpoint: 'test-push',
      status,
      sent,
      ok: sent > 0,
      note:
        sent > 0
          ? `Fallback /api/test-push sent to ${sent} device${sent === 1 ? '' : 's'}, but the legacy endpoint only sends its fixed "AlertHub test" text — the custom marks message was NOT pushed. (${why}.)`
          : `Fallback /api/test-push answered 200 but sent to 0 devices — no devices subscribed. (${why}.)`,
      usedLegacyGenericText: true,
    };
  }
  return {
    endpoint: 'test-push',
    status,
    sent: 0,
    ok: false,
    note: `Server push failed: /api/push/test missing (${why}) and fallback /api/test-push returned ${status}. The test alert is in the local feed only.`,
    usedLegacyGenericText: false,
  };
}
