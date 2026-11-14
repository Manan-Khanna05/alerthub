export const TIMEZONE = 'Asia/Calcutta';

const dateTimeFmt = new Intl.DateTimeFormat('en-IN', {
  timeZone: TIMEZONE,
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
});

const timeFmt = new Intl.DateTimeFormat('en-IN', {
  timeZone: TIMEZONE,
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
});

const dateFmt = new Intl.DateTimeFormat('en-IN', {
  timeZone: TIMEZONE,
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});

const hourFmt = new Intl.DateTimeFormat('en-IN', {
  timeZone: TIMEZONE,
  hour: 'numeric',
  hour12: false,
});

/** Full date + time in Asia/Calcutta, e.g. "13 Nov 2026, 12:38 pm". */
export function formatDateTime(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return dateTimeFmt.format(d);
}

/** Time only in Asia/Calcutta, e.g. "12:38 pm". */
export function formatTime(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return timeFmt.format(d);
}

/** Date only in Asia/Calcutta, e.g. "13 Nov 2026". */
export function formatDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return dateFmt.format(d);
}

/** "2026-11-13" calendar key in Asia/Calcutta for a timestamp. */
export function istDateKey(iso: string): string {
  const d = new Date(iso);
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(d);
  const get = (type: string): string =>
    parts.find((p) => p.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

/** "2026-11-13" calendar key for today in Asia/Calcutta. */
export function todayIstKey(): string {
  return istDateKey(new Date().toISOString());
}

/** Current hour (0–23) in Asia/Calcutta. */
export function istHourNow(): number {
  return Number(hourFmt.format(new Date()));
}

export function greeting(): string {
  const h = istHourNow();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

/** Relative time ("5m ago", "2h ago", "Yesterday", or a short date). */
export function relativeTime(iso: string, now = new Date()): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '—';
  const diffMs = now.getTime() - then;
  if (diffMs < 0) return formatDateTime(iso);
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days}d ago`;
  return formatDate(iso);
}

/** "13 Nov 2026, 12:38 pm IST" — explicit IST label for failure details. */
export function formatDateTimeIst(iso: string | null): string {
  const base = formatDateTime(iso);
  return base === '—' ? base : `${base} IST`;
}
