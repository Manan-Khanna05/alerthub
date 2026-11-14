/**
 * Shared backend types for AlertHub.
 *
 * These mirror the API contract the frontend is built against. Keep them in
 * sync with `src/data/seed.json` (the fallback data) and the API handlers
 * under `api/`.
 */

export type Severity = 'critical' | 'important' | 'normal' | 'low';

export type SourceType = 'email' | 'cuims' | 'task' | 'system' | 'webhook';

export type SourceStatus = 'ok' | 'unreachable' | 'connected';

/**
 * A verified change in one academic assessment (e.g. a CUIMS marks update).
 * `difference` must equal `current - previous` (or 0 when `previous` is
 * null); `direction` must match the sign of `difference` ('new' when
 * `previous` is null). `verified` means the values were read from the
 * authoritative source; `isSimulation` marks illustrative/sample values
 * that must never be presented as real marks.
 */
export interface AcademicChange {
  subject: string;
  subjectCode?: string;
  assessment: string;
  previous: number | null;
  current: number;
  max: number;
  difference: number;
  direction: 'up' | 'down' | 'new' | 'unchanged';
  verified: boolean;
  isSimulation: boolean;
}

/** A single notification shown in the AlertHub inbox. */
export interface Alert {
  id: string | number;
  externalId: string;
  title: string;
  body: string;
  sender?: string;
  sourceType: SourceType;
  /** Human-readable label, e.g. "Gmail · itsmanan.dev@gmail.com" or a webhook source name. */
  sourceLabel: string;
  severity: Severity;
  category?: string;
  sourceUrl?: string | null;
  /** ISO 8601 timestamp of when the underlying event happened. */
  occurredAt: string;
  /** ISO 8601 timestamp of when AlertHub received/stored the alert. */
  receivedAt: string;
  isRead?: boolean;
  isStarred?: boolean;
  deliveryState?: string;
  dedupeKey?: string;
  /** Verified academic change carried by this alert, if any. */
  academic?: AcademicChange;
}

/** An upstream source feeding alerts into AlertHub (same shape as seed.json). */
export interface Source {
  id: string | number;
  key: string;
  name: string;
  kind: string;
  status: SourceStatus;
  enabled: boolean;
  eventCount: number;
  detail: string;
  lastCheckedAt: string | null;
  lastSuccessAt: string | null;
  nextCheckAt: string | null;
}

/**
 * Body of POST /api/v1/events — the ingest/webhook contract.
 * `externalId` and `title` are required; everything else is optional.
 */
export interface IngestEvent {
  source: string;
  externalId: string;
  title: string;
  body?: string;
  severity?: Severity;
  category?: string;
  url?: string;
  occurredAt?: string;
  metadata?: Record<string, unknown>;
  /** Which upstream source this event came from; defaults to 'webhook'. */
  sourceType?: SourceType;
  /** Verified academic change carried by this event, if any. */
  academic?: AcademicChange;
}

/** The Web Push subscription object a browser hands to the frontend. */
export interface WebPushSubscription {
  endpoint: string;
  expirationTime?: number | null;
  keys: {
    p256dh: string;
    auth: string;
  };
}

/** One stored push subscription, keyed by deviceId in KV (`alerthub:subs`). */
export interface PushSubscriptionRecord {
  deviceId: string;
  subscription: WebPushSubscription;
  deviceName?: string;
  /** ISO 8601 timestamp of when the subscription was first stored. */
  createdAt: string;
}

/** Response shape of GET /api/alerts. */
export interface AlertsResponse {
  alerts: Alert[];
  sources: Source[];
  generatedAt: string;
  source: 'kv' | 'seed';
}

/**
 * Push-delivery log states. These are the honest maximum: 'accepted'
 * means the push service accepted the message, NOT that it reached the
 * device — there is no device-receipt telemetry, so a push is never
 * marked "delivered to device".
 */
export type PushLogState = 'created' | 'queued' | 'sending' | 'accepted' | 'failed' | 'expired';

/** One push-delivery log entry, stored newest-first under `alerthub:pushlogs`. */
export interface PushLogEntry {
  id: string;
  /** ISO 8601 timestamp of the attempt. */
  at: string;
  deviceId: string;
  title: string;
  tag?: string;
  state: PushLogState;
  /** Human-readable detail (error message or acceptance note). Never key material. */
  detail?: string;
}

/** Summary counts returned by the push send endpoints. */
export interface PushSendResult {
  ok: boolean;
  attempted: number;
  sent: number;
  failed: number;
  removedStale: number;
  note?: string;
}
