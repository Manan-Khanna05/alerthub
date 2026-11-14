/**
 * GET /api/push/devices — list stored push subscriptions.
 *
 * Returns { ok: true, devices: [{ deviceId, deviceName, createdAt }] }.
 * Endpoint URLs and keys are NEVER returned — only the safe metadata
 * above. An empty store returns an empty array, not an error.
 *
 * Responses:
 *   200 { ok: true, devices: [...] }
 *   405 wrong method
 *   503 KV unavailable (no fake storage)
 *
 * Web-standard handler (Vercel Node runtime, no @vercel/node dependency).
 */

import { getSubscriptions, KvUnavailableError } from '../../lib/store.js';

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

function error(message: string, status: number): Response {
  return json({ ok: false, error: message }, status);
}

export async function GET(req: Request): Promise<Response> {
  if (req.method !== 'GET') {
    return new Response(JSON.stringify({ ok: false, error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json', Allow: 'GET' },
    });
  }

  try {
    const subs = await getSubscriptions();
    const devices = Object.values(subs)
      .map((record) => ({
        deviceId: record.deviceId,
        deviceName: record.deviceName,
        createdAt: record.createdAt,
      }))
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return json({ ok: true, devices }, 200);
  } catch (err) {
    if (err instanceof KvUnavailableError) {
      return error(err.message, 503);
    }
    throw err;
  }
}
