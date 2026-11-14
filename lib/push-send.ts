/**
 * Shared Web Push send logic, used by BOTH:
 *   POST /api/push/test  (canonical test-send endpoint)
 *   POST /api/test-push  (legacy alias, same response shape)
 *
 * Behaviour:
 * - Loads subscriptions from KV (throws KvUnavailableError when the store
 *   is unavailable — callers answer 503).
 * - Requires VAPID to be configured (throws Error 'Push server not
 *   configured (VAPID keys missing)' — callers answer 503).
 * - Sends a real Web Push via VAPID to one device (deviceId given) or to
 *   every subscribed device (deviceId omitted).
 * - Bounded retries: up to 2 retries on transient send errors ONLY.
 *   Never retried: 404/410 (stale subscription) and 4xx client errors.
 * - Stale subscriptions (404/410 from the push service) are removed from
 *   KV and counted in `removedStale`.
 * - Every send attempt is recorded in the push-delivery log
 *   (`alerthub:pushlogs`) with a terminal state: 'accepted' (the push
 *   service accepted the message), 'failed' (send error), or 'expired'
 *   (stale 404/410, subscription removed). Acceptance by the push service
 *   is NOT delivery to the device — there is no device-receipt telemetry,
 *   so no log entry ever claims the push reached the device. A log-write
 *   failure never masks the send result.
 */

import { randomUUID } from 'node:crypto';
import {
  getSubscriptions,
  KvUnavailableError,
  removeSubscription,
  savePushLog,
} from './store.js';
import { configureVapid, isStaleSubscriptionError, sendPush } from './webpush.js';
import type { PushLogEntry, PushSendResult } from './types';
import type { PushPayload } from './webpush.js';

/** Maximum extra attempts after the first send (2 retries = 3 tries total). */
const MAX_RETRIES = 2;

/** Delay before retry N (1-based), in milliseconds. */
function retryDelayMs(attempt: number): number {
  return 150 * attempt;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * True when a send error is worth retrying: network/transport failures and
 * 5xx / 429 from the push service. False for stale subscriptions (404/410)
 * and other 4xx client errors, which retrying cannot fix.
 */
export function isTransientSendError(err: unknown): boolean {
  if (isStaleSubscriptionError(err)) return false;
  if (typeof err === 'object' && err !== null && 'statusCode' in err) {
    const statusCode = (err as { statusCode?: unknown }).statusCode;
    if (typeof statusCode === 'number') {
      return statusCode === 429 || statusCode >= 500;
    }
  }
  // No status code (network error, timeout, unknown): treat as transient.
  return true;
}

/** Best-effort log write: a log failure must never mask the send result. */
async function logAttempt(entry: PushLogEntry): Promise<void> {
  try {
    await savePushLog(entry);
  } catch {
    // Deliberately swallowed: logging is observability, not the send.
  }
}

export interface SendTestPushOptions {
  deviceId?: string;
  payload: PushPayload;
}

/**
 * Send a test push to one device or all devices.
 * Throws KvUnavailableError (store down) or Error (VAPID missing);
 * all per-device send failures are counted, never thrown.
 */
export async function sendTestPush(options: SendTestPushOptions): Promise<PushSendResult> {
  const { deviceId, payload } = options;

  // --- Load subscriptions (KV required) -----------------------------------
  const all = await getSubscriptions();
  const targets = deviceId
    ? (all[deviceId] ? [all[deviceId]] : [])
    : Object.values(all);

  // --- VAPID must be configured before anything can be sent ---------------
  if (!configureVapid()) {
    throw new Error('Push server not configured (VAPID keys missing)');
  }

  if (targets.length === 0) {
    return {
      ok: true,
      attempted: 0,
      sent: 0,
      failed: 0,
      removedStale: 0,
      note: 'no devices subscribed',
    };
  }

  // --- Send to each subscription -------------------------------------------
  let attempted = 0;
  let sent = 0;
  let failed = 0;
  let removedStale = 0;

  for (const record of targets) {
    attempted += 1;
    let lastError: unknown = null;
    let delivered = false;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
      try {
        await sendPush(record.subscription, payload);
        delivered = true;
        break;
      } catch (err) {
        lastError = err;
        // Stale subscriptions are terminal: never retry, remove instead.
        if (isStaleSubscriptionError(err)) break;
        // Transient errors get up to MAX_RETRIES retries; anything else
        // (4xx client errors) fails immediately.
        if (attempt < MAX_RETRIES && isTransientSendError(err)) {
          await sleep(retryDelayMs(attempt + 1));
          continue;
        }
        break;
      }
    }

    if (delivered) {
      sent += 1;
      await logAttempt({
        id: randomUUID(),
        at: new Date().toISOString(),
        deviceId: record.deviceId,
        title: payload.title,
        tag: payload.tag,
        state: 'accepted',
        detail: 'Accepted by the push service (not confirmation of device delivery).',
      });
    } else if (isStaleSubscriptionError(lastError)) {
      try {
        await removeSubscription(record.deviceId);
      } catch {
        // Removal failure must not mask the result counts.
      }
      removedStale += 1;
      await logAttempt({
        id: randomUUID(),
        at: new Date().toISOString(),
        deviceId: record.deviceId,
        title: payload.title,
        tag: payload.tag,
        state: 'expired',
        detail: 'Subscription expired (404/410 from the push service); removed from store.',
      });
    } else {
      failed += 1;
      const detail =
        lastError instanceof Error ? lastError.message : 'Unknown send error';
      await logAttempt({
        id: randomUUID(),
        at: new Date().toISOString(),
        deviceId: record.deviceId,
        title: payload.title,
        tag: payload.tag,
        state: 'failed',
        detail: detail.slice(0, 500),
      });
    }
  }

  return { ok: true, attempted, sent, failed, removedStale };
}

// Re-exported so callers can distinguish the store-down case.
export { KvUnavailableError };
