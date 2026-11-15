/**
 * POST /api/v1/events — ingest endpoint for new alerts.
 *
 * Auth:    Authorization: Bearer <INGEST_API_KEY>
 * Body:    { source, externalId*, title*, body?, severity?,
 *             category?, url?, occurredAt?, metadata?,
 *             sourceType?, academic? }
 *          (* required)
 *
 * Responses:
 *   201 { ok: true, id, deduped: false }   — stored
 *   200 { ok: true, id, deduped: true }    — externalId already stored
 *   400 invalid body (missing externalId/title, bad severity, bad
 *       sourceType, invalid academic payload, bad JSON)
 *   401 missing / wrong API key
 *   409 not stored — older than every stored alert and the store is full
 *   429 more than 60 requests/minute for this API key
 *   503 INGEST_API_KEY not configured, or KV unavailable (no fake storage)
 *
 * This is the endpoint Muse's scheduled Gmail/CUIMS checks forward new
 * alerts to (see README.md "Architecture"). `sourceType` defaults to
 * 'webhook' when absent; when an event carries a valid `academic` change
 * it is stored on the alert and the category becomes 'academic' unless a
 * category was supplied.
 *
 * Web-standard handler (Vercel Node runtime, no @vercel/node dependency).
 */

import { timingSafeEqual } from 'node:crypto';
import { sendTestPush } from '../../lib/push-send.js';
import {
  checkRateLimit,
  isDuplicate,
  KvUnavailableError,
  markDuplicate,
  saveAlert,
} from '../../lib/store.js';
import type { AcademicChange, Alert, IngestEvent, Severity, SourceType } from '../../lib/types';

const SEVERITIES: Severity[] = ['critical', 'important', 'normal', 'low'];
const SOURCE_TYPES: SourceType[] = ['email', 'cuims', 'task', 'system', 'webhook'];
const DIRECTIONS: AcademicChange['direction'][] = ['up', 'down', 'new', 'unchanged'];
const RATE_LIMIT_PER_MINUTE = 60;

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

function error(message: string, status: number): Response {
  return json({ ok: false, error: message }, status);
}

/** Constant-time comparison so key guesses can't be timed. */
function keysEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

function isValidIsoDate(value: string): boolean {
  const d = new Date(value);
  return !Number.isNaN(d.getTime());
}

/**
 * Validate an `academic` payload. Returns the normalised AcademicChange,
 * or an error message string when the payload is invalid (callers answer
 * 400). Rules: current/max must be numbers, max > 0, previous null or a
 * number; difference must equal current - previous (or 0 when previous
 * is null); direction must match the sign of difference ('new' when
 * previous is null, 'unchanged' when the difference is 0).
 */
function validateAcademic(value: unknown): AcademicChange | string {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return 'academic must be an object';
  }
  const a = value as Record<string, unknown>;

  if (typeof a.subject !== 'string' || !a.subject.trim()) {
    return 'academic.subject is required and must be a non-empty string';
  }
  if (a.subjectCode !== undefined && typeof a.subjectCode !== 'string') {
    return 'academic.subjectCode must be a string';
  }
  if (typeof a.assessment !== 'string' || !a.assessment.trim()) {
    return 'academic.assessment is required and must be a non-empty string';
  }
  if (typeof a.current !== 'number' || !Number.isFinite(a.current)) {
    return 'academic.current must be a number';
  }
  if (typeof a.max !== 'number' || !Number.isFinite(a.max)) {
    return 'academic.max must be a number';
  }
  if (a.max <= 0) {
    return 'academic.max must be greater than 0';
  }
  if (a.previous !== null && (typeof a.previous !== 'number' || !Number.isFinite(a.previous))) {
    return 'academic.previous must be a number or null';
  }
  if (typeof a.difference !== 'number' || !Number.isFinite(a.difference)) {
    return 'academic.difference must be a number';
  }
  const expectedDifference = a.previous === null ? 0 : a.current - a.previous;
  if (Math.abs(a.difference - expectedDifference) > 1e-9) {
    return 'academic.difference must equal current - previous (or 0 when previous is null)';
  }
  if (typeof a.direction !== 'string' || !DIRECTIONS.includes(a.direction as AcademicChange['direction'])) {
    return `academic.direction must be one of: ${DIRECTIONS.join(', ')}`;
  }
  const expectedDirection: AcademicChange['direction'] =
    a.previous === null
      ? 'new'
      : a.difference > 0
        ? 'up'
        : a.difference < 0
          ? 'down'
          : 'unchanged';
  if (a.direction !== expectedDirection) {
    return `academic.direction must be '${expectedDirection}' for the given difference`;
  }
  if (a.verified !== undefined && typeof a.verified !== 'boolean') {
    return 'academic.verified must be a boolean';
  }
  if (a.isSimulation !== undefined && typeof a.isSimulation !== 'boolean') {
    return 'academic.isSimulation must be a boolean';
  }

  return {
    subject: a.subject.trim(),
    subjectCode: typeof a.subjectCode === 'string' ? a.subjectCode : undefined,
    assessment: a.assessment.trim(),
    previous: a.previous as number | null,
    current: a.current,
    max: a.max,
    difference: a.difference,
    direction: a.direction as AcademicChange['direction'],
    verified: typeof a.verified === 'boolean' ? a.verified : false,
    isSimulation: typeof a.isSimulation === 'boolean' ? a.isSimulation : false,
  };
}

export async function POST(req: Request): Promise<Response> {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ ok: false, error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json', Allow: 'POST' },
    });
  }

  // --- Auth ---------------------------------------------------------------
  const configuredKey = process.env.INGEST_API_KEY;
  if (!configuredKey) {
    return error('Ingest not configured (INGEST_API_KEY is not set)', 503);
  }
  const authHeader = req.headers.get('authorization') ?? '';
  const suppliedKey = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (!suppliedKey || !keysEqual(suppliedKey, configuredKey)) {
    return error('Unauthorized', 401);
  }

  // --- Rate limit: 60 requests/minute per API key -------------------------
  const allowed = await checkRateLimit(suppliedKey, RATE_LIMIT_PER_MINUTE, 60);
  if (!allowed) {
    return error('Rate limit exceeded (max 60 requests per minute)', 429);
  }

  // --- Body ---------------------------------------------------------------
  let event: IngestEvent;
  try {
    event = (await req.json()) as IngestEvent;
  } catch {
    return error('Invalid JSON body', 400);
  }
  if (!event || typeof event !== 'object') {
    return error('Invalid JSON body', 400);
  }

  const externalId = typeof event.externalId === 'string' ? event.externalId.trim() : '';
  const title = typeof event.title === 'string' ? event.title.trim() : '';
  if (!externalId) return error('externalId is required', 400);
  if (!title) return error('title is required', 400);

  const severity: Severity = event.severity ?? 'normal';
  if (!SEVERITIES.includes(severity)) {
    return error(`severity must be one of: ${SEVERITIES.join(', ')}`, 400);
  }
  if (event.source !== undefined && typeof event.source !== 'string') {
    return error('source must be a string', 400);
  }
  if (event.sourceType !== undefined && !SOURCE_TYPES.includes(event.sourceType)) {
    return error(`sourceType must be one of: ${SOURCE_TYPES.join(', ')}`, 400);
  }
  if (event.occurredAt !== undefined && !isValidIsoDate(event.occurredAt)) {
    return error('occurredAt must be an ISO 8601 date string', 400);
  }

  let academic: AcademicChange | undefined;
  if (event.academic !== undefined) {
    const validated = validateAcademic(event.academic);
    if (typeof validated === 'string') {
      return error(validated, 400);
    }
    academic = validated;
  }

  const now = new Date().toISOString();

  // --- Dedupe + store (KV required — never fake persistence) --------------
  try {
    if (await isDuplicate(externalId)) {
      return json({ ok: true, id: externalId, deduped: true }, 200);
    }

    const alert: Alert = {
      id: externalId,
      externalId,
      title,
      body: typeof event.body === 'string' ? event.body : '',
      sourceType: event.sourceType ?? 'webhook',
      sourceLabel: event.source?.trim() ? event.source.trim() : 'webhook',
      severity,
      category:
        typeof event.category === 'string'
          ? event.category
          : academic
            ? 'academic'
            : undefined,
      sourceUrl: typeof event.url === 'string' ? event.url : null,
      occurredAt: event.occurredAt ?? now,
      receivedAt: now,
      isRead: false,
      isStarred: false,
      deliveryState: 'logged',
      dedupeKey: `webhook:${externalId}`,
      academic,
    };

    // Not marked as seen when it was not kept, so a later re-send can work.
    if (!(await saveAlert(alert))) {
      return error(
        'Alert not stored: it is older than every stored alert and the store is full',
        409,
      );
    }
    await markDuplicate(externalId);

    // Best-effort push for high-priority events (critical/important severity
    // or academic marks changes). A push failure NEVER fails the ingest —
    // the alert is already stored, and the push result is reported in the
    // response only. Normal/low events are stored silently (no push).
    let push: { attempted: number; sent: number; failed: number } | null = null;
    if (
      severity === 'critical' ||
      severity === 'important' ||
      alert.category === 'academic'
    ) {
      try {
        const tag =
          alert.category === 'academic'
            ? `marks-update-${externalId}`
            : alert.sourceType === 'email'
              ? `gmail-${externalId}`
              : `system-${externalId}`;
        const result = await sendTestPush({
          payload: {
            title: alert.title,
            body: alert.body || alert.title,
            tag,
            url: `/alerts/${externalId}`,
            alertId: externalId,
            severity,
          },
        });
        push = {
          attempted: result.attempted,
          sent: result.sent,
          failed: result.failed,
        };
      } catch {
        push = { attempted: 0, sent: 0, failed: 0 };
      }
    }
    return json(
      { ok: true, id: alert.id, deduped: false, ...(push ? { push } : {}) },
      201,
    );
  } catch (err) {
    if (err instanceof KvUnavailableError) {
      return error(err.message, 503);
    }
    throw err;
  }
}
