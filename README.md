# AlertHub — Notification Command Center

A personal notification hub for Manan Khanna: one inbox for Gmail alerts,
CUIMS marks, task reminders and system events, as an installable PWA with
real Web Push notifications.

Stack: **Vite + React 18 + TypeScript** frontend, **Vercel Serverless
Functions** backend (`api/`, Web-standard `Request`/`Response` handlers —
no `@vercel/node` dependency), **Vercel KV / Upstash Redis** storage,
**Web Push (VAPID)** for phone alerts. Deployed on Vercel.

- Production: <https://deploy-six-plum-47.vercel.app> (Vercel project `deploy`)
- Owner: Manan Khanna (UID 25BCF10015), `itsmanan.dev@gmail.com`

---

## Run locally

```bash
npm install
cp .env.example .env.local   # fill in real values (see below)
npm run dev                  # http://localhost:5173
```

Other scripts: `npm run build` (typecheck + Vite build), `npm run preview`,
`npm run typecheck`.

> Local dev note: the Vite dev server does **not** run the `api/` serverless
> functions. To exercise the API locally, use `vercel dev` (Vercel CLI) or
> test against the deployed URL. Without KV env vars, `GET /api/alerts`
> returns the seed snapshot and all write endpoints answer `503`.

---

## Environment variables

| Name | Required? | Purpose |
| --- | --- | --- |
| `KV_REST_API_URL` | Yes (for persistence) | Redis REST URL injected when a KV/Upstash store is linked. Without it, writes answer `503` and `GET /api/alerts` falls back to seed data. |
| `KV_REST_API_TOKEN` | Yes (for persistence) | Redis REST token injected with the store. |
| `INGEST_API_KEY` | Yes (for ingest) | Shared secret for `POST /api/v1/events` (`Authorization: Bearer …`). Generate with `openssl rand -hex 32`. |
| `VAPID_PUBLIC_KEY` | Yes (for push) | VAPID public key. Generate with `npx web-push generate-vapid-keys`. |
| `VAPID_PRIVATE_KEY` | Yes (for push) | VAPID private key — server only, never expose it. |
| `VAPID_SUBJECT` | No | Contact for the push service; defaults to `mailto:itsmanan.dev@gmail.com`. |
| `VITE_VAPID_PUBLIC_KEY` | Yes (for push) | Same value as `VAPID_PUBLIC_KEY`. Vite inlines `VITE_*` vars into the client bundle at build time, so the frontend needs it to subscribe. |

Set them in Vercel: **Dashboard → Project (`deploy`) → Settings →
Environment Variables** (Production + Preview), then redeploy. Locally,
put them in `.env.local` (gitignored — never commit real secrets).

---

## Provisioning storage (KV / Upstash Redis) — DONE (13 Nov 2026)

> **Status (13 Nov 2026, ~19:38 IST): the store is provisioned.**
> Upstash Redis store **`alerthub-kv`** (free plan, 500,000 monthly
> commands, 1 GB, region `iad1`, eviction off) created in the Vercel
> dashboard and **connected to the `deploy` project** (Production +
> Preview). Env vars `KV_REST_API_URL`, `KV_REST_API_TOKEN`,
> `KV_REST_API_READ_ONLY_TOKEN`, `KV_URL` and `REDIS_URL` are set on the
> project. New env vars only apply to deployments built after they are
> added, so the next redeploy activates the store.
>
> CLI attempt (13 Nov 2026, 19:10 IST): `vercel integration add
> upstash/upstash-kv` stops at "Opening browser for terms acceptance" and
> waits for a human in the browser — it cannot be completed
> non-interactively. The dashboard flow was used instead.

1. Vercel Dashboard → **Storage** → **Create**.
2. Choose **Upstash Redis** (preferred) or **Vercel KV**.
3. Create the store and **connect it to the `deploy` project**.
4. **Redeploy** the project so `KV_REST_API_URL` / `KV_REST_API_TOKEN`
   are injected into the serverless functions.
5. Verify: `GET /api/alerts` should report `"source": "kv"` once an alert
   has been ingested (before any ingest it reports `"source": "seed"`),
   and `POST /api/v1/events` with a valid key should return `201`.

KV keys used (see `lib/store.ts`):

| Key | Value |
| --- | --- |
| `alerthub:alerts` | JSON array of `Alert` (newest first, capped at 500) |
| `alerthub:dedup:<externalId>` | Marker `'1'` — ingest dedupe |
| `alerthub:subs` | JSON object `deviceId → PushSubscriptionRecord` |
| `alerthub:pushlogs` | JSON array of push-delivery log entries (newest first, capped at 200) |
| `alerthub:sources` | JSON array of `Source` (optional) |
| `alerthub:ratelimit:<hash>:<minute>` | Per-key ingest rate-limit counter (60/min) |

---

## API

All handlers live in `api/` and return JSON. Shared types are in
`lib/types.ts`; storage in `lib/store.ts`; push sending in `lib/webpush.ts`.

> **Handler convention (do not "simplify" this):** the handlers are
> Vercel fetch-style — they export **named HTTP methods** (`export async
> function GET(...)` / `POST(...)`), not `export default handler`. A
> default export is treated as the Node `(req, res)` signature: `req`
> arrives as a Node `IncomingMessage` (so `req.headers.get(...)` throws)
> and a returned `Response` is ignored. Relative imports use explicit
> `.js` extensions (`../lib/store.js`) because the Node ESM loader does
> not resolve extensionless specifiers. The seed snapshot is read with
> `fs.readFileSync(new URL(..., import.meta.url))`, not a static JSON
> import, because the ESM loader requires an import attribute for JSON.
> These three points were each a real production crash (fixed 13 Nov
> 2026); changing any of them back breaks `/api/*`.

### `GET /api/alerts`

```json
{ "alerts": [Alert], "sources": [Source], "generatedAt": "…", "source": "kv" | "seed" }
```

Returns stored alerts (newest first) with `"source": "kv"`. When KV is
empty or unavailable, returns the bundled snapshot from
`src/data/seed.json` with `"source": "seed"` — real last-known data, never
invented alerts.

### `POST /api/v1/events` — ingest / webhook

Headers: `Authorization: Bearer <INGEST_API_KEY>`,
`Content-Type: application/json`.

```json
{
  "source": "gmail",
  "externalId": "gmail:abc123",
  "title": "New sign-in detected",
  "body": "…",
  "severity": "important",
  "category": "",
  "url": "https://mail.google.com/…",
  "occurredAt": "2026-11-13T06:45:28.000Z",
  "metadata": {}
}
```

`externalId` and `title` are required; `severity` must be one of
`critical | important | normal | low` (default `normal`). Stored alerts get
`sourceType: "webhook"`, `sourceLabel` from `source`, `receivedAt: now`,
`isRead: false`. Re-sending the same `externalId` returns
`200 { ok: true, id, deduped: true }` without storing again. A valid
`academic` object (subject, assessment, previous/current/max, difference,
direction, verified, isSimulation) is stored on the alert and sets
`category: "academic"` when no category is given. After a successful
store, events with severity `critical`/`important` or category `academic`
attempt a real Web Push to all subscribed devices (best-effort — a push
failure never fails the ingest); the `201` response reports it as
`push: { attempted, sent, failed }`. Normal/low events are stored only.

Responses: `201` stored · `200` duplicate · `400` bad body ·
`401` missing/wrong key · `429` over 60 requests/minute per key ·
`503` `INGEST_API_KEY` not configured or KV unavailable.

```bash
curl -X POST https://deploy-six-plum-47.vercel.app/api/v1/events \
  -H "Authorization: Bearer $INGEST_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"source":"gmail","externalId":"gmail:test-1","title":"Test alert","severity":"normal"}'
```

### `POST /api/subscribe` — register a device for push

```json
{
  "subscription": {
    "endpoint": "https://fcm.googleapis.com/fcm/send/…",
    "keys": { "p256dh": "…", "auth": "…" }
  },
  "deviceName": "Pixel 8"
}
```

Returns `200 { ok: true, deviceId }`. The `deviceId` is derived from the
endpoint (SHA-256, first 16 hex chars), so re-subscribing the same browser
updates the stored record in place — no duplicates. `400` on an invalid
body, `503` when KV is unavailable.

### `POST /api/test-push` — send a real test notification

```json
{ "deviceId": "…" }
```

Omit `deviceId` to push to every subscribed device. Sends a real Web Push
(`"AlertHub test" / "This is a test notification from AlertHub."`,
tag `alerthub-test`, url `/`) and returns
`{ ok: true, attempted, sent, failed, removedStale }`. Subscriptions that
answer `404`/`410` are stale and are removed from KV (`removedStale`).
`503` when VAPID keys are missing (`Push server not configured (VAPID keys
missing)`) or KV is unavailable; `200` with `attempted: 0` and
`note: "no devices subscribed"` when nobody is subscribed.

### Push API — `/api/push/*`

- **`POST /api/push/subscribe`** — alias of `/api/subscribe` (same body,
  same response).
- **`GET /api/push/devices`** — list subscribed devices as
  `[{ deviceId, deviceName, createdAt }]` (endpoints and keys are never
  returned). `503` when KV is unavailable.
- **`DELETE /api/push/devices/:id`** — remove one device; `200` on success,
  `404` when the id is not found.
- **`POST /api/push/test`** — canonical test send. Body (all optional):
  `{ deviceId?, title?, body?, tag?, url?, alertId?, severity? }` — defaults
  are the same "AlertHub test" text, tag `alerthub-test`, url `/`,
  `alertId = tag`, severity `normal`. Returns
  `{ ok, attempted, sent, failed, removedStale, note? }`. `400` on a
  wrong-typed field, `405` on a wrong method, `503` when VAPID or KV is
  missing.
- **`GET /api/push/health`** — `{ ok, store: "connected" | "unavailable",
  vapid: "configured" | "missing", subscriptions: number | null,
  timestamp }`. Connectedness is decided by a live `kv.ping()`, not by
  env vars. `store: "unavailable"` ⇒ `ok: false`, `subscriptions: null`.

Shared send logic lives in `lib/push-send.ts` (used by both test
endpoints): up to 2 retries on transient errors only (never on 404/410 or
other 4xx), stale 404/410 subscriptions are removed and counted, and every
attempt is written to the push-delivery log (`alerthub:pushlogs`) with a
terminal state `accepted | failed | expired`. **"Accepted by the push
service" is never presented as "delivered to the device"** — there is no
device-receipt telemetry, so no log entry claims the phone received it.

---

## Deploy

```bash
vercel --prod
```

The production project is **`deploy`** at
<https://deploy-six-plum-47.vercel.app>. `vercel.json` sets the Vite build
(`npm run build` → `dist`), an SPA rewrite that excludes `/api/*`,
`/sw.js`, `/manifest.json`, `/icons/*` and `/favicon.svg`, `no-cache` for
`/sw.js`, and immutable long caching for `/assets/*`.

---

## PWA install & phone alerts

The app ships a manifest (`public/manifest.json`), icons and a service
worker. **Android (Chrome):** open the production URL, tap the install
prompt / ⋮ → *Install app*, then allow notifications when asked (or enable
them in the *Enable phone alerts* flow in the app) and use **Send test
notification** to verify delivery. **iPhone (Safari, iOS 16.4+):** open the
URL in Safari → Share → *Add to Home Screen*, open the installed app, then
enable alerts from inside the app and send a test notification. Push only
works over HTTPS on the installed app — not from a plain browser tab on iOS.

### Icons

The PWA icons in `public/icons/` (`icon-192.png`, `icon-512.png`,
`icon-512-maskable.png`, `apple-touch-icon.png`) are derived from the
user's app icon (`alerthub-app-icon.png`, purple-blue gradient
`#4169F5 → #8057E8`, white bell); `public/favicon.svg` is the same icon
as SVG. If you clone the repo and the PNGs are missing, regenerate them
from `public/favicon.svg` (or the original 512 px icon) before deploying
— the manifest references the PNG paths. Keep the manifest identity
(`AlertHub — Notification Command Center` / `AlertHub`) unchanged so the
installed app updates seamlessly.

---

## Push notifications

1. Generate VAPID keys: `npx web-push generate-vapid-keys`.
2. Set `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` in Vercel
   env vars, plus `VITE_VAPID_PUBLIC_KEY` (= public key) for the frontend
   build. Redeploy.
3. On the phone, install the app and enable alerts (this calls
   `POST /api/subscribe`).
4. Verify with `POST /api/test-push` (or the in-app test button).

Sending lives in `lib/webpush.ts` (`configureVapid()` reads env;
`sendPush()` uses `web-push`). Keys are never hardcoded anywhere.

### Why notifications appear in the shade but not as heads-up banners

Heads-up display on Android is **not a property of the notification the
app sends** — it is a property of the Android notification channel the
notification is posted to, and it is decided by the OS + device state:

- The Web Notifications API (`showNotification()`) has **no
  `priority`/`importance` option** — any code claiming to set one is
  inventing an option the browser silently ignores.
- Since Android 8.0, every notification belongs to a channel with an
  importance level (`IMPORTANCE_HIGH` = sound + heads-up banner;
  `IMPORTANCE_DEFAULT` = sound, no banner). Importance is fixed when the
  channel is created; after that only the user can change it in system
  settings. A PWA's notifications are posted by Chrome through a
  Chrome-owned channel — the web app cannot create or configure its own.
- Do Not Disturb, a notification category set to silent, or "Show as
  pop-up" turned off each suppress the banner on their own, even when
  permission is granted.
- The service worker does everything the web platform allows: a unique
  tag per event (so a new event never silently replaces an old one),
  `renotify: true`, `vibrate` for important/critical alerts, and never
  `silent: true`. `requireInteraction` is honoured on desktop only and
  ignored on Android.

So: a notification that arrives in the shade proves delivery works; the
missing banner is the OS/channel decision, not a software error. The
in-app Notification Diagnostics (Devices page) shows the live permission,
subscription, service-worker and server state, plus the Android settings
to check.

### Optional native route (guaranteed heads-up control)

The only way to *guarantee* heads-up control is a native build — this is
documented here, **not implemented** (the app stays a PWA):

1. Wrap the same web app with [Capacitor](https://capacitorjs.com)
   (`npx cap init`, `npx cap add android`).
2. Add Firebase Cloud Messaging
   (`@capacitor-firebase/messaging`) and connect the Android app to a
   Firebase project (google-services.json).
3. In the native Android code, create a notification channel with
   `NotificationManager.IMPORTANCE_HIGH` and post FCM messages to it —
   high-importance channels always show a heads-up banner.
4. Keep the existing Web Push path as the fallback for browsers without
   the native app installed.

## Glass Navy theme (13 Nov 2026)

The UI uses the **Glass Navy** design kit (tokens in
`src/glass-navy-tokens.css`, brand assets in `public/assets/`):

- Default theme is dark Glass Navy (`#081323` background, `#718DFF`
  primary, glass panels with 18px blur, 1px cool-blue borders, 18–24px
  card radii). Light mode is preserved via `[data-theme="light"]` and the
  theme toggle in the top bar; the saved preference always wins.
- Brand: kit wordmarks (`src/assets/logo.svg` = light variant,
  `logo-dark.svg` = dark variant) in the sidebar/drawer, symbol in the
  mobile app bar and favicon. PWA identity is unchanged (id `/`, name,
  short_name, start_url, scope) so installed apps update in place; the
  manifest theme/background colour is `#081323` and the icons are the new
  kit PNGs in `public/icons/`.
- Icons: the 35 supplied outline SVGs (`public/assets/icons/`, 1.8px
  stroke, `currentColor`) via `src/components/Icons.tsx`; only
  archive/trash/copy/inbox are inline paths (no kit equivalent), in the
  same outline style. Source marks: `gmail.svg` and the custom
  `cuims-custom.svg` monogram (never presented as an official university
  logo) via `src/components/SourceIcon.tsx`, in 36–44px containers.
- Motion is sparing (toast 220ms, one 520ms bell ring on a new alert,
  1px card hover lift, 0.98 button press) and `prefers-reduced-motion`
  disables non-essential motion. On phones the card blur is dropped for
  performance and touch targets are ≥44px.
- Implementation map: `docs/glass-navy-implementation-map.md`.

---

## Architecture — and the honest note about Gmail / CUIMS

AlertHub's backend is deliberately thin: it stores alerts, dedupes ingest,
stores push subscriptions and sends Web Push. **It does not read Gmail or
CUIMS itself.** There is no Gmail OAuth on Vercel — the Google tokens live
in Muse, not in this repo.

Instead, the flow is:

```
Gmail / CUIMS
    │  read by Muse's scheduled checks (hourly mail check,
    │  daily hub refresh — the OAuth tokens live in Muse)
    ▼
Muse detects a new alert
    │  POST /api/v1/events  (Authorization: Bearer INGEST_API_KEY)
    ▼
AlertHub backend (Vercel) ──► KV ──► GET /api/alerts (frontend)
    │  + Web Push to subscribed phones (VAPID)
```

The forwarding wiring (Muse cron → `POST /api/v1/events`) is a **follow-up
step** and is not claimed to exist yet. Until it lands, new alerts arrive
only when someone/something posts to the webhook, and the inbox shows the
seed snapshot. Likewise, KV/Upstash provisioning (above) is still pending —
until then writes answer `503` rather than pretending to persist.

Project layout:

```
api/            Serverless functions (alerts, v1/events, subscribe, test-push)
lib/            types.ts · store.ts (KV) · webpush.ts (VAPID)
src/            React frontend (owned by another agent — do not touch)
src/data/seed.json   Bundled last-known snapshot (GET /api/alerts fallback)
public/         manifest, icons, favicon (do not touch)
vercel.json     Vite build + SPA rewrites + cache headers
.env.example    Placeholder env vars only — never put a real key in it
```
