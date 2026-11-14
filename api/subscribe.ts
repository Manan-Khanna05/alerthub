/**
 * POST /api/subscribe — store a browser Web Push subscription.
 *
 * Body: { subscription: { endpoint*, keys: { p256dh*, auth* } },
 *         deviceName?, deviceId? }
 *
 * The subscription is stored under a stable deviceId derived from the
 * endpoint (first 16 hex chars of its SHA-256 hash), so re-subscribing the
 * same browser updates the record in place instead of creating duplicates.
 * A client-supplied deviceId is accepted in the body but is NOT used as
 * the storage key — the endpoint hash is the key.
 *
 * Responses:
 *   200 { ok: true, deviceId }
 *   400 invalid body (missing endpoint / keys)
 *   405 wrong method
 *   503 KV unavailable (no fake storage)
 *
 * Web-standard handler (Vercel Node runtime, no @vercel/node dependency).
 */

import { createHash } from 'node:crypto';
import { KvUnavailableError, saveSubscription } from '../lib/store.js';
import type { PushSubscriptionRecord, WebPushSubscription } from '../lib/types';

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

function error(message: string, status: number): Response {
  return json({ ok: false, error: message }, status);
}

/** Stable deviceId for an endpoint: sha256(endpoint) truncated to 16 hex chars. */
export function deviceIdForEndpoint(endpoint: string): string {
  return createHash('sha256').update(endpoint).digest('hex').slice(0, 16);
}

function isValidSubscription(value: unknown): value is WebPushSubscription {
  if (!value || typeof value !== 'object') return false;
  const sub = value as Record<string, unknown>;
  if (typeof sub.endpoint !== 'string' || !sub.endpoint.startsWith('https://')) return false;
  const keys = sub.keys as Record<string, unknown> | undefined;
  if (!keys || typeof keys !== 'object') return false;
  return typeof keys.p256dh === 'string' && keys.p256dh.length > 0
    && typeof keys.auth === 'string' && keys.auth.length > 0;
}

export async function POST(req: Request): Promise<Response> {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ ok: false, error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json', Allow: 'POST' },
    });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return error('Invalid JSON body', 400);
  }
  if (!body || typeof body !== 'object') {
    return error('Invalid JSON body', 400);
  }

  const { subscription, deviceName } = body as {
    subscription?: unknown;
    deviceName?: unknown;
    deviceId?: unknown;
  };

  if (!isValidSubscription(subscription)) {
    return error(
      'Invalid subscription: expected { endpoint (https URL), keys: { p256dh, auth } }',
      400,
    );
  }
  if (deviceName !== undefined && typeof deviceName !== 'string') {
    return error('deviceName must be a string', 400);
  }

  const deviceId = deviceIdForEndpoint(subscription.endpoint);
  const record: PushSubscriptionRecord = {
    deviceId,
    subscription,
    deviceName: typeof deviceName === 'string' && deviceName.trim() ? deviceName.trim() : undefined,
    createdAt: new Date().toISOString(),
  };

  try {
    await saveSubscription(deviceId, record);
    return json({ ok: true, deviceId }, 200);
  } catch (err) {
    if (err instanceof KvUnavailableError) {
      return error(err.message, 503);
    }
    throw err;
  }
}
