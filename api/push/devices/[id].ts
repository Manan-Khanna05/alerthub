/**
 * DELETE /api/push/devices/:id — delete one push subscription by deviceId.
 *
 * The id is read from the request URL path (Vercel file routing maps
 * /api/push/devices/<id> to this file); no body is needed.
 *
 * Responses:
 *   200 { ok: true, deviceId }   — subscription removed
 *   404 { ok: false, error: 'Device not found' } — no such deviceId
 *   405 wrong method
 *   503 KV unavailable (no fake storage)
 *
 * Web-standard handler (Vercel Node runtime, no @vercel/node dependency).
 */

import { getSubscriptions, KvUnavailableError, removeSubscription } from '../../../lib/store.js';

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

function error(message: string, status: number): Response {
  return json({ ok: false, error: message }, status);
}

/** deviceId is the last path segment of the request URL. */
function deviceIdFromUrl(url: string): string {
  const pathname = new URL(url).pathname;
  const segments = pathname.split('/').filter((segment) => segment.length > 0);
  const last = segments[segments.length - 1] ?? '';
  try {
    return decodeURIComponent(last);
  } catch {
    return last;
  }
}

export async function DELETE(req: Request): Promise<Response> {
  if (req.method !== 'DELETE') {
    return new Response(JSON.stringify({ ok: false, error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json', Allow: 'DELETE' },
    });
  }

  const deviceId = deviceIdFromUrl(req.url);
  if (!deviceId) {
    return error('Device not found', 404);
  }

  try {
    const subs = await getSubscriptions();
    if (!(deviceId in subs)) {
      return error('Device not found', 404);
    }
    await removeSubscription(deviceId);
    return json({ ok: true, deviceId }, 200);
  } catch (err) {
    if (err instanceof KvUnavailableError) {
      return error(err.message, 503);
    }
    throw err;
  }
}
