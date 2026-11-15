# CUIMS multi-user synchronization — root-cause audit

**Repository:** `Manan-Khanna05/alerthub`  
**Branch audited:** `main`  
**Audit date:** 15 November 2026  
**Scope:** CUIMS connection observed in the supplied WhatsApp recording; current frontend, API, persistence and push architecture.  
**Change status:** Audit only. No production code, credentials, database records or deployment settings were changed.

## Executive finding

The current `main` branch does not implement a CUIMS account connection or a per-student academic synchronization pipeline.

The CUIMS page is a **viewer for a marks snapshot** passed into the React app. That snapshot is loaded from the bundled `src/data/seed.json` fallback unless the server returns fields that the current API does not presently return. The page's **Retry check** action does not contact CUIMS; it calls the same AlertHub `GET /api/alerts` endpoint again.

The backend README explicitly states that AlertHub itself does not read CUIMS or Gmail, that external Muse scheduled checks were intended to forward events through a shared webhook, and that the forwarding wiring was a follow-up rather than an implemented flow.

Therefore the recorded flow — opening CUIMS, signing in successfully there, returning to AlertHub, and seeing no student data — is consistent with the code in `main`: **an external portal login does not create an AlertHub connection, does not deliver an authenticated CUIMS session to the backend, and does not start any data import.**

## Findings

### P0 — No AlertHub authentication / multi-user account model

Evidence:
- `src/App.tsx` initializes the application from the bundled seed snapshot and local browser state.
- `src/lib/store.ts` persists preferences, read/star/archive state, tasks and device UI state under one browser-local key, `alerthub:state:v1`.
- `src/lib/types.ts` defines a single `Profile` and `MarksSnapshot`; neither an authenticated user identity nor a connected university-account model is present.
- The Settings page contains notification preferences and a marks-update simulator. It does not implement a real CUIMS account connection or a per-user connected-account manager.
- The Sources page lists configured sources and retry/enable actions; it is not an OAuth or university-account connection flow.

Impact:
- Another AlertHub user cannot be mapped to their own CUIMS identity and academic records through the current code.
- The current profile and marks data model is a single-profile application, not a multi-tenant student platform.

### P0 — CUIMS page does not perform CUIMS synchronization

Evidence:
- `src/pages/Cuims.tsx` receives only `source`, `marks`, `onRetry` and `retrying` props.
- It renders `marks?.subjects` and the supplied marks snapshot. It contains no CUIMS authentication client, API client, session exchange, import action or sync job.
- The page labels the source as `students.cuchd.in`, displays a stored last-check detail, and says the schedule is hourly.
- Its fallback message says there is no saved login for `cuchd.in` and suggests saving a login in the browser.
- The only retry button invokes `onRetry(source)`.
- In `src/App.tsx`, `handleRetry` ignores the source as a synchronization target: it calls `fetchAlerts()`, which is a request to AlertHub's own `/api/alerts` endpoint. It does not call CUIMS.
- The same handler then displays a success toast saying the source was checked when the generic AlertHub request succeeds. That message can be misleading because it does not prove CUIMS was queried.

Impact:
- A successful login on the official CUIMS site cannot populate this page through the currently implemented code.
- Pressing Retry refreshes AlertHub's stored alert payload; it does not re-authenticate or fetch academic data from CUIMS.

### P0 — API response and frontend fallback keep academic data tied to the seed snapshot

Evidence:
- `api/alerts.ts` returns only `alerts`, `sources`, `generatedAt` and `source`.
- `src/lib/api.ts` fills missing profile, preferences, tasks, devices, delivery logs, marks and metadata from `src/data/seed.json`.
- Consequently, the current `GET /api/alerts` response does not provide a per-user marks snapshot or profile. The frontend fills those fields from the single bundled seed record.
- `api/v1/events.ts` accepts generic alert events and may attach an `academic` change to an individual alert. It stores an alert; it does not update the `MarksSnapshot` served to the CUIMS page.

Impact:
- Even if a marks-change alert is posted through the generic webhook, that does not import a complete academic record or update the Marks / Results page.
- The current response contract has no way to return different student profiles or marks to different authenticated users.

### P0 — Storage is global, not partitioned by student

Evidence:
- `lib/store.ts` uses global keys including `alerthub:alerts`, `alerthub:sources`, `alerthub:subs` and `alerthub:pushlogs`.
- Stored `Alert`, `Source` and `PushSubscriptionRecord` types do not include a mandatory `userId`.
- `api/alerts.ts` has no authenticated-user check before returning the global alert/source collection.
- `api/v1/events.ts` authenticates ingestion with one shared `INGEST_API_KEY`; its event schema has no required student/user owner.
- `api/push/devices.ts` returns the global device list without an authenticated user scope.
- `lib/push-send.ts` targets every subscription when `deviceId` is omitted.
- `api/push/test.ts` permits omission of `deviceId`, which means the backend's current send routine can target every stored subscription.

Impact:
- This architecture is unsafe to expose as multi-user. A per-student integration must not be added on top of the current global keys and endpoints.
- Alerts, sources, subscriptions, push delivery and academic records need an authenticated owner boundary before additional users are enabled.

### P1 — Gmail is also an external forwarding design, not per-user OAuth in this repository

Evidence:
- The README's architecture section says the backend does not read Gmail itself and that Google tokens live outside this repository in Muse.
- The README describes hourly Gmail checks and a daily hub refresh, but says the Muse-to-`POST /api/v1/events` forwarding wiring was a follow-up and was not claimed to exist.
- The current profile/preferences include one watched email value, rather than multiple independent OAuth connections.

Impact:
- A multi-user release needs a separate Gmail OAuth connection and token ownership for each AlertHub user. A single shared watched-email setting or external token cannot represent multiple users.

### P1 — Public seed data needs to be de-personalized before multi-user release

Evidence:
- The repository is public.
- `src/data/seed.json` includes one named student profile, university UID, email address, academic programme/section and a marks snapshot.
- `GET /api/alerts` deliberately falls back to this bundled file when KV is empty or unavailable.

Impact:
- Personal profile/academic data should not be shipped as a public default response or committed as a live-data seed.
- Replace it with synthetic, clearly labelled demo data with no real UID/email/marks. Migrate the existing owner's records into a properly authenticated account before removing the personal seed. Keep a protected backup during migration.

### P1 — Repository documentation is inconsistent about storage provisioning

Evidence:
- `.env.example` says Vercel KV / Upstash is required for persistent API writes.
- The README has a later section saying an Upstash store was connected to the Vercel project on 13 November 2026.
- The header comment in `lib/store.ts` still says no store is provisioned and writes will return 503.
- The README architecture section also contains older text saying KV provisioning is still pending.

Impact:
- Verify actual Production and Preview environment variables and a live store health check before relying on persistence. Update the stale comments/docs after verification; do not infer storage health from old prose.

## What is actually implemented today

| Area | Current repository implementation | Not implemented in current `main` |
|---|---|---|
| CUIMS | Static marks snapshot viewer; source status/details; generic retry | CUIMS account connection, authenticated data adapter, profile/attendance/timetable import, per-user sync |
| Gmail | A single watched-email preference; external forwarding described in README | Per-user Google OAuth/token storage and actual Gmail reader in this repository |
| Alerts | Generic shared ingest endpoint; Redis/KV list storage | Authenticated user-owned alert feeds |
| Push | VAPID, global device subscriptions and send routine | User-owned subscriptions and authorization checks |
| Accounts | Static seeded profile + browser local state | Registration/login, server sessions, user identity and tenant isolation |

## Correct target architecture

Do not treat a link to the CUIMS login page as a connected account.

Use separate layers:

1. **AlertHub authentication** — every student signs in to AlertHub and receives a server-verified user ID.
2. **Provider connection** — CUIMS/UIMS and Gmail are separate connected accounts associated with that AlertHub user.
3. **Authorized provider adapter** — use a documented/approved CUIMS integration or other explicitly supported data-export mechanism. Do not assume browser login automatically grants backend access. Do not scrape authenticated pages, extract browser cookies, defeat CAPTCHA/MFA, or store university passwords as a workaround.
4. **Per-user sync worker** — imports only the authenticated user's available profile, subjects, attendance, timetable, results and permitted LMS metadata. Store source timestamps and sync-run outcomes.
5. **User-owned persistence** — every academic record, source, alert, push subscription and delivery log has a mandatory owner ID enforced server-side.
6. **Realtime UI** — publish updates only to the authenticated user's active sessions; routine data updates must not require a Vercel code redeployment.

### Recommended persistence/auth foundation

The current flat KV collections are suitable for small global alert/push records, not a relational multi-student academic system. Use a relational database with row-level access controls (for example, Postgres with RLS) for users, connected accounts, subjects, attendance snapshots, timetable events, results, LMS metadata, sync runs, alerts and devices. KV/Redis may remain for queues, short-lived locks or rate limits, but not as the only tenant boundary.

Never store raw university passwords. For Gmail, use the official Google OAuth flow and store refresh tokens encrypted server-side and scoped to the owning AlertHub user.

### CUIMS capability gate

The public CUIMS/UIMS entry point documents student access with a UID and password. The public material inspected for this audit does not document a third-party student-data API or OAuth delegation flow. That does not prove no private/partner interface exists; it means the repository cannot implement one by guessing.

Before building the provider adapter, obtain and verify one of:
- CU/IT-approved API documentation and credentials;
- an authorized partner integration or SSO contract;
- a supported export/download workflow that students can import.

If none is available, show **Portal linked / data sync unavailable** accurately and provide a secure manual import/official portal fallback. Do not mark a student as synced just because an external login page opened.

## Implementation sequence

1. Create a protected backup of existing KV data and current seed records.
2. Add AlertHub authentication and server-side session validation.
3. Add relational multi-tenant schema and row-level ownership policies.
4. Migrate the owner's existing data into the owner's user ID; remove personal data from the public seed after verification.
5. Change every read/write API to require authentication and scope by the server-derived user ID.
6. Partition push subscriptions and send jobs by user; remove unauthenticated global device listing/sending.
7. Implement the CUIMS adapter only after the authorized access method has been proven with a test account.
8. Implement separate Gmail OAuth connections per user.
9. Add sync runs, initial import, incremental sync, deduplication, retries and last-success status.
10. Add two-user integration tests and verify strict data separation before allowing public registration.

## Required acceptance tests

- Student A and Student B can sign in independently.
- CUIMS connection status changes only after a real, verified provider handshake.
- A successful CUIMS website login without a data-access grant remains **not synced**.
- Student A's profile, attendance, marks, subjects, timetable, LMS metadata and alerts never appear for Student B.
- A CUIMS sync failure preserves the last successful snapshot.
- A marks-change webhook updates the owning user's academic record only when it contains a validated, authorized user association; a generic shared ingest key is not sufficient.
- Push devices and test sends are scoped to the authenticated owner.
- Unauthenticated requests cannot read academic data, alert feeds, device lists or connected-account status.
- Seed fallback contains synthetic demo data only.
- Routine data synchronization works without redeploying Vercel.
- Build, typecheck, integration tests and production smoke tests pass.

## Audit conclusion

The reported failure is not one missing callback that can be fixed by changing the CUIMS link. The current repository is a single-profile notification hub with a generic event-ingest API and global storage. It has no CUIMS account connector, no per-user authentication model, and no student-scoped academic APIs. The external CUIMS login therefore has nowhere in this repository to hand off an authenticated provider identity or write a student's academic records.

The first engineering task is to establish authenticated user ownership and a supported CUIMS data-access path. Only then can automatic multi-user synchronization be implemented safely and verified.
