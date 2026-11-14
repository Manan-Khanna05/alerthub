/**
 * POST /api/push/test — canonical test-send endpoint.
 *
 * Body (all fields optional): { deviceId?, title?, body?, tag?, url?,
 *   alertId?, severity? }
 *   Omit deviceId to push to every subscribed device.
 *   Defaults: title 'AlertHub test', body 'This is a test notification
 *   from AlertHub.', tag 'alerthub-test', url '/', alertId = tag,
 *   severity 'normal'.
 *
 * Responses:
 *   200 { ok: true, attempted, sent, failed, removedStale, note? }
 *   200 { ok: true, attempted: 0, sent: 0, failed: 0, removedStale: 0,
 *         note: 'no devices subscribed' }   — nothing subscribed
 *   400 invalid body (a supplied field has the wrong type)
 *   405 wrong method
 *   503 { ok: false, error: 'Push server not configured (VAPID keys missing)' }
 *       — VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY not set
 *   503 KV unavailable (no fake storage)
 *
 * Subscriptions that answer 404/410 from the push service are stale and
 * are removed from KV (counted in `removedStale`). Transient send errors
 * are retried up to 2 times. Every attempt is recorded in the push-delivery
 * log; 'sent' means the push service accepted the message, not that the
 * device received it.
 *
 * Web-standard handler (Vercel Node runtime, no @vercel/node dependency).
 */

import { KvUnavailableError, sendTestPush } from '../../lib/push-send.js';

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

function error(message: string, status: number): Response {
  return json({ ok: false, error: message }, status);
}

export async function POST(req: Request): Promise<Response> {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ ok: false, error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json', Allow: 'POST' },
    });
  }

  let body: Record<string, unknown> = {};
  try {
    const parsed: unknown = await req.json().catch(() => ({}));
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      body = parsed as Record<string, unknown>;
    } else if (parsed !== null && parsed !== undefined && typeof parsed !== 'object') {
      return error('Invalid JSON body: expected an object', 400);
    }
  } catch {
    return error('Invalid JSON body', 400);
  }

  const deviceId = body.deviceId === undefined ? undefined : body.deviceId;
  if (deviceId !== undefined && typeof deviceId !== 'string') {
    return error('deviceId must be a string', 400);
  }
  for (const field of ['title', 'body', 'tag', 'url', 'severity'] as const) {
    if (body[field] !== undefined && typeof body[field] !== 'string') {
      return error(`${field} must be a string`, 400);
    }
  }
  if (
    body.alertId !== undefined &&
    typeof body.alertId !== 'string' &&
    typeof body.alertId !== 'number'
  ) {
    return error('alertId must be a string or number', 400);
  }

  const tag =
    typeof body.tag === 'string' && body.tag.trim() ? body.tag : 'alerthub-test';
  const payload = {
    title: typeof body.title === 'string' && body.title.trim() ? body.title : 'AlertHub test',
    body:
      typeof body.body === 'string' && body.body.trim()
        ? body.body
        : 'This is a test notification from AlertHub.',
    tag,
    url: typeof body.url === 'string' && body.url.trim() ? body.url : '/',
    alertId: body.alertId ?? tag,
    severity:
      typeof body.severity === 'string' && body.severity.trim()
        ? body.severity
        : 'normal',
  };

  try {
    const result = await sendTestPush({ deviceId, payload });
    return json(result, 200);
  } catch (err) {
    if (err instanceof KvUnavailableError) {
      return error(err.message, 503);
    }
    if (err instanceof Error && err.message.startsWith('Push server not configured')) {
      return error(err.message, 503);
    }
    throw err;
  }
}
