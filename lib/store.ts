/**
 * Storage layer for AlertHub, backed by Vercel KV (@vercel/kv).
 *
 * IMPORTANT — provisioning status (13 Nov 2026): no KV store is currently
 * provisioned for this project (the Vercel CLI reports no storage resources
 * and Vercel KV is deprecated in favour of Upstash Redis via the Vercel
 * Marketplace). This module is implemented against @vercel/kv anyway,
 * because a linked Upstash Redis store injects the exact same env vars
 * (`KV_REST_API_URL` / `KV_REST_API_TOKEN`). Until a store is provisioned
 * and the project redeployed, every function below throws
 * `KvUnavailableError` and the API handlers answer 503 — persistence is
 * NEVER faked. See README.md ("Provisioning storage") for the exact steps.
 *
 * Keys:
 *   alerthub:alerts            JSON array of Alert
 *   alerthub:dedup:<externalId> marker '1' (dedupe for ingest)
 *   alerthub:subs              JSON object mapping deviceId -> PushSubscriptionRecord
 *   alerthub:sources           JSON array of Source (optional)
 *   alerthub:pushlogs          JSON array of PushLogEntry, newest first (cap 200)
 *   alerthub:ratelimit:<hash>:<minute>  per-key ingest rate-limit counter
 *
 * There is deliberately NO in-memory fallback store for alerts or
 * subscriptions: falling back to memory would silently pretend data was
 * persisted when it was not. The only in-memory structure here is the
 * rate-limit counter fallback (see checkRateLimit), which is explicitly
 * best-effort within a single warm serverless invocation and is commented
 * as such.
 */

import { kv } from '@vercel/kv';
import { createHash } from 'node:crypto';
import type { Alert, PushLogEntry, PushSubscriptionRecord, Source } from './types';

export const ALERTS_KEY = 'alerthub:alerts';
export const SUBS_KEY = 'alerthub:subs';
export const SOURCES_KEY = 'alerthub:sources';
export const PUSHLOGS_KEY = 'alerthub:pushlogs';
export const DEDUP_KEY_PREFIX = 'alerthub:dedup:';

/** Maximum number of alerts kept in KV (oldest trimmed on save). */
const MAX_ALERTS = 500;

/** Maximum number of push-delivery log entries kept in KV. */
const MAX_PUSH_LOGS = 200;

/** Thrown whenever KV cannot be used (not provisioned / unreachable). */
export class KvUnavailableError extends Error {
  constructor(message = 'Storage unavailable: no KV/Upstash Redis store is configured for this project.') {
    super(message);
    this.name = 'KvUnavailableError';
  }
}

/** True when the KV env vars a linked store would inject are present. */
export function isKvConfigured(): boolean {
  return Boolean(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
}

/**
 * Guard used before any KV call. @vercel/kv throws its own errors when the
 * env vars are missing; we convert that into our typed error so handlers
 * can answer with a clean 503 instead of leaking internals.
 */
function requireKv(): void {
  if (!isKvConfigured()) {
    throw new KvUnavailableError();
  }
}

/** Wrap a KV call so any transport/client failure becomes KvUnavailableError. */
async function kvGuard<T>(fn: () => Promise<T>): Promise<T> {
  requireKv();
  try {
    return await fn();
  } catch (err) {
    if (err instanceof KvUnavailableError) throw err;
    throw new KvUnavailableError(
      `Storage unavailable: KV request failed (${err instanceof Error ? err.message : 'unknown error'}).`,
    );
  }
}

/**
 * Ping the store to determine live connectedness. Returns false (never
 * throws) when no store is configured or the ping fails. Callers must not
 * rely only on env vars being present — a configured-looking store can
 * still be unreachable.
 */
export async function pingStore(): Promise<boolean> {
  if (!isKvConfigured()) return false;
  try {
    const reply = await kv.ping();
    return reply === 'PONG';
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Alerts
// ---------------------------------------------------------------------------

/** All stored alerts, newest first. Returns [] when nothing is stored yet. */
export async function getAlerts(): Promise<Alert[]> {
  const alerts = await kvGuard(() => kv.get<Alert[]>(ALERTS_KEY));
  if (!Array.isArray(alerts)) return [];
  return [...alerts].sort(
    (a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime(),
  );
}

/**
 * Append an alert (replacing any existing alert with the same externalId),
 * trim to MAX_ALERTS newest, and persist. Returns the stored alert.
 */
export async function saveAlert(alert: Alert): Promise<Alert> {
  const existing = await getAlerts();
  const withoutDup = existing.filter((a) => a.externalId !== alert.externalId);
  const updated = [alert, ...withoutDup]
    .sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime())
    .slice(0, MAX_ALERTS);
  await kvGuard(() => kv.set(ALERTS_KEY, updated));
  return alert;
}

// ---------------------------------------------------------------------------
// Dedupe
// ---------------------------------------------------------------------------

export function dedupKey(externalId: string): string {
  return `${DEDUP_KEY_PREFIX}${externalId}`;
}

/** True when this externalId has already been ingested. */
export async function isDuplicate(externalId: string): Promise<boolean> {
  const marker = await kvGuard(() => kv.get<string>(dedupKey(externalId)));
  return marker !== null && marker !== undefined;
}

/** Record an externalId as ingested (marker '1', kept indefinitely). */
export async function markDuplicate(externalId: string): Promise<void> {
  await kvGuard(() => kv.set(dedupKey(externalId), '1'));
}

// ---------------------------------------------------------------------------
// Push subscriptions
// ---------------------------------------------------------------------------

/** All stored subscriptions as a deviceId -> record map ({} when none). */
export async function getSubscriptions(): Promise<Record<string, PushSubscriptionRecord>> {
  const subs = await kvGuard(() => kv.get<Record<string, PushSubscriptionRecord>>(SUBS_KEY));
  return subs && typeof subs === 'object' ? subs : {};
}

/** Insert or replace one subscription (same deviceId = update in place). */
export async function saveSubscription(
  deviceId: string,
  record: PushSubscriptionRecord,
): Promise<PushSubscriptionRecord> {
  const subs = await getSubscriptions();
  subs[deviceId] = record;
  await kvGuard(() => kv.set(SUBS_KEY, subs));
  return record;
}

/** Remove one subscription (e.g. after a 404/410 from the push service). */
export async function removeSubscription(deviceId: string): Promise<void> {
  const subs = await getSubscriptions();
  if (!(deviceId in subs)) return;
  delete subs[deviceId];
  await kvGuard(() => kv.set(SUBS_KEY, subs));
}

// ---------------------------------------------------------------------------
// Sources
// ---------------------------------------------------------------------------

/** Stored source list, or [] when nothing has been stored yet. */
export async function getSources(): Promise<Source[]> {
  const sources = await kvGuard(() => kv.get<Source[]>(SOURCES_KEY));
  return Array.isArray(sources) ? sources : [];
}

/** Persist the source list. */
export async function saveSources(sources: Source[]): Promise<Source[]> {
  await kvGuard(() => kv.set(SOURCES_KEY, sources));
  return sources;
}

// ---------------------------------------------------------------------------
// Push delivery logs
// ---------------------------------------------------------------------------

/**
 * Stored push-delivery log entries, newest first. `limit` caps how many
 * are returned (and is itself capped at MAX_PUSH_LOGS).
 */
export async function listPushLogs(limit = 50): Promise<PushLogEntry[]> {
  const logs = await kvGuard(() => kv.get<PushLogEntry[]>(PUSHLOGS_KEY));
  if (!Array.isArray(logs)) return [];
  const capped = Math.max(0, Math.min(Math.floor(limit), MAX_PUSH_LOGS));
  return logs.slice(0, capped);
}

/**
 * Prepend one push-delivery log entry (newest first) and trim to
 * MAX_PUSH_LOGS. Returns the stored entry.
 */
export async function savePushLog(entry: PushLogEntry): Promise<PushLogEntry> {
  const existing = await listPushLogs(MAX_PUSH_LOGS);
  const updated = [entry, ...existing].slice(0, MAX_PUSH_LOGS);
  await kvGuard(() => kv.set(PUSHLOGS_KEY, updated));
  return entry;
}

// ---------------------------------------------------------------------------
// Ingest rate limiting (POST /api/v1/events)
// ---------------------------------------------------------------------------

/**
 * In-memory fallback counter, used ONLY when KV is unavailable.
 *
 * NOTE: this is explicitly NOT durable storage — it counts requests within
 * a single warm serverless invocation only, and resets when the instance
 * recycles. It exists so a burst still gets some limiting when KV is down;
 * the authoritative limiter is the KV counter below. The ingest endpoint
 * still returns 503 when KV is unavailable at store time, so this fallback
 * never makes an un-persisted ingest look successful.
 */
const memoryRateLimits = new Map<string, { count: number; resetAt: number }>();

function memoryCheckRateLimit(key: string, limit: number, windowSeconds: number): boolean {
  const now = Date.now();
  const entry = memoryRateLimits.get(key);
  if (!entry || now >= entry.resetAt) {
    memoryRateLimits.set(key, { count: 1, resetAt: now + windowSeconds * 1000 });
    return true;
  }
  entry.count += 1;
  return entry.count <= limit;
}

/**
 * Allow at most `limit` requests per `windowSeconds` window for the given
 * API key. KV-backed (atomic INCR + expiry) when KV is available; the
 * in-memory fallback above when it is not. Returns true when the request
 * is within the limit, false when it must be answered 429.
 */
export async function checkRateLimit(
  apiKey: string,
  limit = 60,
  windowSeconds = 60,
): Promise<boolean> {
  const keyHash = createHash('sha256').update(apiKey).digest('hex').slice(0, 16);
  const minuteBucket = Math.floor(Date.now() / 1000 / windowSeconds);
  const counterKey = `alerthub:ratelimit:${keyHash}:${minuteBucket}`;

  if (!isKvConfigured()) {
    // KV is down: best-effort in-memory limiting for this invocation only.
    return memoryCheckRateLimit(counterKey, limit, windowSeconds);
  }

  try {
    const count = await kv.incr(counterKey);
    // First hit in this window: arm the expiry so the key self-cleans.
    if (count === 1) {
      await kv.expire(counterKey, windowSeconds);
    }
    return count <= limit;
  } catch {
    return memoryCheckRateLimit(counterKey, limit, windowSeconds);
  }
}
