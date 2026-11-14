import type { SeedData } from './types';
import seed from '../data/seed.json';

const ALERTS_TIMEOUT_MS = 5000;

export interface AlertsResponse {
  alerts: SeedData['alerts'];
  sources: SeedData['sources'];
  preferences: SeedData['preferences'];
  profile: SeedData['profile'];
  tasks: SeedData['tasks'];
  devices: SeedData['devices'];
  deliveryLogs: SeedData['deliveryLogs'];
  marks: SeedData['marks'];
  meta: SeedData['meta'];
}

function seedAsResponse(): AlertsResponse {
  const s = seed as unknown as SeedData;
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

/**
 * GET /api/alerts with a 5s timeout. Returns live data when the response is
 * ok, otherwise falls back to the bundled seed snapshot.
 * `liveSource` is the API's own `source` field: 'kv' when the server is
 * backed by the store, 'seed' when it serves the snapshot, null when the
 * live call never answered. Callers use it (e.g. the Devices page) to show
 * whether server-side features such as push are actually backed by storage.
 */
export async function fetchAlerts(): Promise<{
  data: AlertsResponse;
  fromLive: boolean;
  liveSource: 'kv' | 'seed' | null;
}> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), ALERTS_TIMEOUT_MS);
  try {
    const res = await fetch('/api/alerts', { signal: controller.signal });
    if (!res.ok) return { data: seedAsResponse(), fromLive: false, liveSource: null };
    const json = (await res.json()) as Partial<AlertsResponse> & {
      source?: unknown;
    };
    if (!Array.isArray(json.alerts) || !Array.isArray(json.sources)) {
      return { data: seedAsResponse(), fromLive: false, liveSource: null };
    }
    const base = seedAsResponse();
    return {
      data: {
        alerts: json.alerts,
        sources: json.sources,
        preferences: json.preferences ?? base.preferences,
        profile: json.profile ?? base.profile,
        tasks: json.tasks ?? base.tasks,
        devices: json.devices ?? base.devices,
        deliveryLogs: json.deliveryLogs ?? base.deliveryLogs,
        marks: json.marks ?? base.marks,
        meta: json.meta ?? base.meta,
      },
      fromLive: true,
      liveSource: json.source === 'kv' ? 'kv' : 'seed',
    };
  } catch {
    return { data: seedAsResponse(), fromLive: false, liveSource: null };
  } finally {
    window.clearTimeout(timer);
  }
}

/** POST a test event to the generic webhook endpoint. Returns ok + detail. */
export async function postWebhookTestEvent(
  apiKey: string | null,
): Promise<{ ok: boolean; detail: string }> {
  try {
    const res = await fetch('/api/v1/events', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      },
      body: JSON.stringify({
        externalId: `test-${Date.now()}`,
        title: 'AlertHub webhook test',
        body: 'This is a test event sent from the Sources page.',
        sender: 'AlertHub test',
        sourceType: 'webhook',
        sourceLabel: 'Webhook · test',
        severity: 'normal',
        occurredAt: new Date().toISOString(),
      }),
    });
    const text = await res.text();
    if (res.ok) {
      return { ok: true, detail: 'Test event accepted by the server.' };
    }
    return {
      ok: false,
      detail: `Server rejected the test event (${res.status}): ${text.slice(0, 200) || res.statusText}`,
    };
  } catch (err) {
    return {
      ok: false,
      detail: `Could not reach /api/v1/events: ${err instanceof Error ? err.message : 'network error'}`,
    };
  }
}
