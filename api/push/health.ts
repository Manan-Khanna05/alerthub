/**
 * GET /api/push/health — push subsystem health.
 *
 * Returns:
 *   { ok, store: 'connected' | 'unavailable',
 *     vapid: 'configured' | 'missing',
 *     subscriptions: number | null, timestamp, note? }
 *
 * Connectedness is determined by a live store ping (kv.ping() in
 * try/catch), never by env vars alone. When the store is down,
 * `subscriptions` is null (not 0) and a note is included; `ok` is false
 * whenever the store is down or VAPID is missing — the endpoint never
 * reports ready when the store is down.
 *
 * Responses:
 *   200 health object (ok may be false — that is the signal, not an error)
 *   405 wrong method
 *
 * Web-standard handler (Vercel Node runtime, no @vercel/node dependency).
 */

import { getSubscriptions, pingStore } from '../../lib/store.js';
import { configureVapid } from '../../lib/webpush.js';

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

export async function GET(req: Request): Promise<Response> {
  if (req.method !== 'GET') {
    return new Response(JSON.stringify({ ok: false, error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json', Allow: 'GET' },
    });
  }

  const timestamp = new Date().toISOString();
  const vapidConfigured = configureVapid();
  const storeConnected = await pingStore();

  if (!storeConnected) {
    return json(
      {
        ok: false,
        store: 'unavailable',
        vapid: vapidConfigured ? 'configured' : 'missing',
        subscriptions: null,
        timestamp,
        note: 'Storage unavailable: no KV/Upstash Redis store is configured for this project.',
      },
      200,
    );
  }

  let subscriptions: number | null = null;
  try {
    const subs = await getSubscriptions();
    subscriptions = Object.keys(subs).length;
  } catch {
    // Ping succeeded but the read failed: do not report a count.
    return json(
      {
        ok: false,
        store: 'unavailable',
        vapid: vapidConfigured ? 'configured' : 'missing',
        subscriptions: null,
        timestamp,
        note: 'Storage ping succeeded but subscriptions could not be read.',
      },
      200,
    );
  }

  return json(
    {
      ok: vapidConfigured,
      store: 'connected',
      vapid: vapidConfigured ? 'configured' : 'missing',
      subscriptions,
      timestamp,
    },
    200,
  );
}
