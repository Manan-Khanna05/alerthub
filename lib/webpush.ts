/**
 * Web Push (VAPID) sender for AlertHub.
 *
 * Keys come ONLY from environment variables — never hardcoded:
 *   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT
 * (VAPID_SUBJECT defaults to the owner's mailbox.)
 *
 * Generate a key pair with:
 *   npx web-push generate-vapid-keys
 * and set the values in Vercel (Dashboard → Project → Settings →
 * Environment Variables) plus `VITE_VAPID_PUBLIC_KEY` (same value as
 * VAPID_PUBLIC_KEY) so the frontend can subscribe at build time.
 * See README.md ("Push notifications") and .env.example.
 */

import webPush from 'web-push';
import type { WebPushSubscription } from './types';

const DEFAULT_SUBJECT = 'mailto:itsmanan.dev@gmail.com';

export interface PushPayload {
  title: string;
  body: string;
  tag?: string;
  url?: string;
  /** Alert id carried so the app can match the push to its feed/banner. */
  alertId?: string | number;
  /** 'critical' | 'important' | 'normal' | 'low' — drives vibrate /
   *  requireInteraction in the service worker. */
  severity?: string;
}

/**
 * Configure web-push from env. Returns true when VAPID is fully configured
 * and sending is possible, false when any key is missing (callers answer
 * 503 "Push server not configured (VAPID keys missing)" in that case).
 * Safe to call on every request; setVapidDetails is idempotent.
 */
export function configureVapid(): boolean {
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT ?? DEFAULT_SUBJECT;

  if (!publicKey || !privateKey) return false;

  webPush.setVapidDetails(subject, publicKey, privateKey);
  return true;
}

/**
 * Send one Web Push notification. Throws on failure; the caller inspects
 * the error (404/410 from the push service means the subscription is stale
 * and should be removed from KV).
 */
export async function sendPush(
  subscription: WebPushSubscription,
  payload: PushPayload,
): Promise<void> {
  if (!configureVapid()) {
    throw new Error('Push server not configured (VAPID keys missing)');
  }
  await webPush.sendNotification(subscription, JSON.stringify(payload));
}

/** True when a push-service error means "subscription no longer exists". */
export function isStaleSubscriptionError(err: unknown): boolean {
  if (typeof err === 'object' && err !== null && 'statusCode' in err) {
    const statusCode = (err as { statusCode?: unknown }).statusCode;
    return statusCode === 404 || statusCode === 410;
  }
  return false;
}
