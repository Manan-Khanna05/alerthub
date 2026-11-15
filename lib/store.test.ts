/**
 * Regression check for the trim-drop bug (13 Nov 2026): once MAX_ALERTS
 * alerts are stored, ingesting an older event used to be trimmed away by
 * saveAlert while the caller still answered 201 and marked the id as seen,
 * so the alert was lost and could never be re-sent.
 *
 * Run with: npm test   (node --test, no test framework dependency)
 */
import assert from 'node:assert/strict';
import { mock, test } from 'node:test';
import type { Alert } from './types.ts';

process.env.KV_REST_API_URL = 'https://store.test.invalid';
process.env.KV_REST_API_TOKEN = 'test-token';

function alertAt(externalId: string, occurredAt: string): Alert {
  return {
    id: externalId,
    externalId,
    title: externalId,
    body: '',
    sourceType: 'webhook',
    sourceLabel: 'test',
    severity: 'normal',
    occurredAt,
    receivedAt: occurredAt,
    isRead: false,
  };
}

test('an alert the trim drops is not reported as stored', async () => {
  // A full store: 500 alerts, all newer than the one we are about to send.
  let stored: Alert[] = Array.from({ length: 500 }, (_, i) =>
    alertAt(`recent-${i}`, new Date(Date.UTC(2026, 10, 15, 0, 0, i)).toISOString()),
  );
  mock.module('@vercel/kv', {
    namedExports: {
      kv: {
        get: async () => stored,
        set: async (_key: string, value: Alert[]) => {
          stored = value;
        },
      },
    },
  });
  const { saveAlert } = await import('./store.ts');

  const kept = await saveAlert(alertAt('old-1', '2020-01-01T00:00:00.000Z'));

  assert.equal(kept, false, 'saveAlert must report that the alert was not kept');
  assert.equal(stored.length, 500, 'the store must be left untouched');
  assert.ok(
    !stored.some((a) => a.externalId === 'old-1'),
    'the dropped alert must not be in the store',
  );
});
