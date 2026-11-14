/**
 * GET /api/alerts
 *
 * Returns the alert inbox plus the source list for the frontend.
 * - When KV holds alerts, they are returned newest-first with source 'kv'.
 * - When KV is empty or unavailable, the bundled seed data
 *   (src/data/seed.json) is returned with source 'seed'.
 * Never invents alerts: 'seed' data is the real last-known snapshot.
 *
 * Web-standard handler (Vercel Node runtime, no @vercel/node dependency).
 */

import { readFileSync } from 'node:fs';
import { getAlerts, getSources, KvUnavailableError } from '../lib/store.js';
import type { Alert, AlertsResponse, Source } from '../lib/types';

// The seed snapshot is read with fs, not a static JSON import: Node's ESM
// loader requires an import attribute (`with { type: 'json' }`) for JSON
// modules, which Vercel's serverless bundler does not emit for a plain
// `import ... from 'x.json'` — that crashed the function at load time
// (ERR_IMPORT_ATTRIBUTE_MISSING). `new URL(..., import.meta.url)` keeps
// the path correct in the deployed bundle and is traced by Vercel's
// file tracer, so src/data/seed.json ships with the function.
const seed = JSON.parse(
  readFileSync(new URL('../src/data/seed.json', import.meta.url), 'utf-8'),
) as { alerts?: unknown; sources?: unknown };

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

  const generatedAt = new Date().toISOString();
  const seedAlerts = (seed as { alerts?: unknown }).alerts as Alert[] | undefined;
  const seedSources = (seed as { sources?: unknown }).sources as Source[] | undefined;
  const fallbackAlerts: Alert[] = Array.isArray(seedAlerts) ? [...seedAlerts] : [];
  const fallbackSources: Source[] = Array.isArray(seedSources) ? [...seedSources] : [];

  try {
    const alerts = await getAlerts();
    if (alerts.length > 0) {
      let sources = await getSources();
      if (sources.length === 0) sources = fallbackSources;
      const body: AlertsResponse = { alerts, sources, generatedAt, source: 'kv' };
      return json(body);
    }
    // KV is reachable but holds nothing yet — fall through to the seed.
  } catch (err) {
    if (!(err instanceof KvUnavailableError)) throw err;
    // KV unavailable (not provisioned): fall through to the seed snapshot.
  }

  const sorted = [...fallbackAlerts].sort(
    (a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime(),
  );
  const body: AlertsResponse = {
    alerts: sorted,
    sources: fallbackSources,
    generatedAt,
    source: 'seed',
  };
  return json(body);
}
