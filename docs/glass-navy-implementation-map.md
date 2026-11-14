# Glass Navy — implementation map (13 Nov 2026)

Source of truth: `~/workspace/user/files/` (MASTER_PROMPT_GLASS_NAVY.md,
BRAND_GUIDELINES.md, glass-navy-tokens.css, ASSET_MANIFEST.json).
Preview `glass-navy-preview.html` is a visual reference only — never copied.

## Current architecture (preserved)
- Vite + React + TS, 8 views (overview, alerts, email, cuims, tasks, sources,
  devices, settings) + NEW `history` view (delivery logs + archived alerts,
  real data only). State-based routing in `src/App.tsx`; state in
  `src/lib/store.ts` (localStorage `alerthub:state:v1`); seed in
  `src/data/seed.json`. API under `api/` (@vercel/kv, VAPID web-push) — NOT
  touched by the theme work. PWA: `public/manifest.json`, `public/sw.js`
  (alerthub-v7), `public/icons/`.

## Component → target screen
| Current | Glass Navy target |
|---|---|
| `src/components/Sidebar.tsx` | Wordmark (dark/light variant by theme), nav: Overview, All Alerts, Academic/CUIMS, Gmail, Tasks / Sources, Phone Devices, History, Settings; Gmail + CUIMS items use source logos |
| `src/components/TopBar.tsx` | Global search, refresh/sync, theme toggle, bell + unread badge (one ring on new alert), account menu; brand symbol on mobile |
| `src/components/BottomNav.tsx` | Own list: Overview, Alerts, Sources, Devices, Settings; safe-area insets; ≥44px targets |
| `src/components/NavDrawer.tsx` | Kept (full navigation on mobile); wordmark + same nav lists |
| `src/components/Icons.tsx` | Kit icon system: 35 supplied outline SVGs via `<img>` (currentColor inherits), 1.8px stroke; inline paths kept ONLY for archive/trash/copy/inbox (no kit equivalent), same outline style |
| `src/components/SourceIcon.tsx` (new) | gmail.svg / cuims-custom.svg logos + generic icons per sourceType; 36–44px desktop, 32–40px mobile; never recolour Gmail |
| `src/components/AlertRow.tsx` | Source logo in row, absolute timestamp (title attr), priority label, star |
| `src/components/AcademicAlertCard.tsx` | CUIMS logo; ⚠ emoji → warning icon |
| `src/components/AlertDetail.tsx` | Source logo in header |
| `src/components/NotificationBanner.tsx` | Glass banner + source logo; `.ah-notice-enter` animation |
| `src/components/Toast.tsx` | Glass toast (CSS only) |
| `src/pages/Overview.tsx` | Metric cards with source logos; no fabricated charts |
| `src/pages/Sources.tsx` + `SourceCard.tsx` | Source logos; truthful status pills |
| `src/pages/Email.tsx`, `Cuims.tsx` | Page headers with source logos |
| `src/pages/Devices.tsx` | Phone notification preview with source logo |
| `src/pages/Settings.tsx` | Simulator preview keeps the real notification title (🎓 is notification content, not a UI icon); theme toggle preserved |
| `src/pages/History.tsx` (new) | Delivery logs + archived alerts |
| `src/styles.css` | Variables mapped to `--ah-*` tokens; glass on cards/sidebar/topbar/sheet/drawer; radii 18–24px; button press 0.98; focus-visible rings; reduced-motion via tokens |
| `src/glass-navy-tokens.css` (new, copied) | Imported first in `main.tsx` |
| `public/manifest.json` | theme/background `#081323`; new PNG icons; id/name/short_name/start_url/scope UNCHANGED |
| `public/assets/logos|icons/` (new) | Kit logos + 35 icons, local only |
| `public/icons/`, `public/favicon.svg` | New PNGs + kit favicon |

## Theme
- Default dark = Glass Navy (`:root` in tokens). Light via
  `[data-theme="light"]` (tokens). Preference default: `dark` (seed.json);
  saved preference always respected; toggle cycles dark/light. Theme-color
  meta `#081323` / `#F2F6FC`.
- CUIMS mark is a CUSTOM monogram, never presented as the official logo.

## Verification (headless Chromium at /opt/meta-chromium/chrome via
puppeteer-core, local preview server; parent does live-device checks)
- build, typecheck; asset paths; all 9 views render; 320/360/390/430/768/
  1280 widths; dark + light; no horizontal overflow; bottom nav clear of
  content; SW registered; /api/push/health live after deploy.
