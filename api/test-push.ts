/**
 * POST /api/test-push — send a real test Web Push to subscribed device(s).
 *
 * Legacy alias of POST /api/push/test: the send logic lives in the shared
 * lib/push-send.ts module and this handler keeps its original response
 * shape. Body: { deviceId? } — omit deviceId to push to every subscribed
 * device.
 *
 * Responses:
 *   200 { ok: true, attempted, sent, failed, removedStale }
 *   200 { ok: true, attempted: 0, sent: 0, failed: 0, removedStale: 0,
 *         note: 'no devices subscribed' }   — nothing subscribed
 *   503 { ok: false, error: 'Push server not configured (VAPID keys missing)' }
 *       — VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY not set
 *   503 KV unavailable (no fake storage)
 *   405 wrong method
 *
 * Subscriptions that answer 404/410 from the push service are stale
 * (browser unsubscribed / endpoint expired): they are removed from KV and
 * counted in `removedStale`. Other send failures count in `failed`.
 *
 * Web-standard handler (Vercel Node runtime, no @vercel/node dependency).
 */

import { KvUnavailableError, sendTestPush } from '../lib/push-send.js';

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

  let body: { deviceId?: unknown } = {};
  try {
    const parsed: unknown = await req.json().catch(() => ({}));
    if (parsed && typeof parsed === 'object') body = parsed as { deviceId?: unknown };
  } catch {
    body = {};
  }
  const deviceId = typeof body.deviceId === 'string' ? body.deviceId : undefined;

  try {
    const result = await sendTestPush({
      deviceId,
      payload: {
        title: 'AlertHub test',
        body: 'This is a test notification from AlertHub.',
        tag: 'alerthub-test',
        url: '/',
        alertId: 'alerthub-test',
        severity: 'normal',
      },
    });
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
