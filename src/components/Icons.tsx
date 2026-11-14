import { ICON_DATA } from './iconData.generated';

/**
 * AlertHub icon system — Glass Navy pack (13 Nov 2026).
 *
 * ROOT CAUSE OF THE BLACK-ICONS BUG (fixed here): the previous version
 * rendered the outline kit SVGs as <img src="/assets/icons/*.svg">. An SVG
 * loaded through <img> is an isolated document — the page's CSS `color`
 * never reaches it, so `stroke="currentColor"` inside the file resolved to
 * the SVG initial colour (black) and every kit icon rendered black on dark
 * glass. Grep confirmed there was no black-forcing CSS anywhere; the
 * mechanism itself was the bug. Only the four inline icons ever rendered
 * correctly.
 *
 * Fix: UI/action icons are now real inline <svg> (bodies generated from
 * public/assets/icons/*.svg by scripts/generate-icons.mjs), so
 * stroke="currentColor" genuinely inherits the CSS colour of the button,
 * nav item or card that holds the icon: default #D6E3F8, hover #A7BEFF,
 * active #B9A2FF on dark glass (see --ah-icon-* in glass-navy-tokens.css),
 * with legible dark values in light mode. A baked #D6E3F8 stroke would
 * have been invisible in light mode; currentColor keeps both themes right.
 *
 * Source logos are NOT icons: Gmail, CUIMS, Tasks, System, Webhook and
 * Web Push stay full-colour <img> in SourceIcon.tsx and are never touched
 * by icon CSS. No global `svg { stroke: … }` rule exists anywhere — it
 * would destroy the multicolour marks.
 *
 * Sizes: 16 / 18 / 20 / 24 px via the `size` prop (default 20, the
 * contextual CSS rules in styles.css still size nav/button icons).
 * Decorative icons are aria-hidden; icon-only buttons carry their own
 * aria-label at the call site (all of them do — see TopBar/AlertRow/etc).
 */

export type IconName =
  | 'grid'
  | 'dashboard'
  | 'overview'
  | 'home'
  | 'bell'
  | 'bellRinging'
  | 'notificationDot'
  | 'mail'
  | 'school'
  | 'academic'
  | 'graduationCap'
  | 'check'
  | 'checkCircle'
  | 'layers'
  | 'phone'
  | 'settings'
  | 'star'
  | 'starFill'
  | 'archive'
  | 'trash'
  | 'close'
  | 'refresh'
  | 'retry'
  | 'sync'
  | 'search'
  | 'external'
  | 'key'
  | 'clock'
  | 'inbox'
  | 'alert'
  | 'warning'
  | 'copy'
  | 'menu'
  | 'history'
  | 'tasks'
  | 'system'
  | 'webhook'
  | 'wifi'
  | 'server'
  | 'send'
  | 'plus'
  | 'filter'
  | 'filterX'
  | 'filterLines'
  | 'activity'
  | 'book'
  | 'calendar'
  | 'calendarCheck'
  | 'listCheck'
  | 'arrowRight'
  | 'chevronRight'
  | 'shield'
  | 'moon'
  | 'sun'
  | 'theme'
  | 'eye'
  | 'info'
  | 'user'
  | 'more'
  | 'sparkles';

/** Generated icon file (without .svg) for each icon name. */
const KIT: Partial<Record<IconName, string>> = {
  grid: 'overview',
  dashboard: 'overview',
  overview: 'overview',
  home: 'home',
  bell: 'bell',
  bellRinging: 'bell-ringing',
  notificationDot: 'notification-dot',
  mail: 'mail',
  school: 'academic',
  academic: 'academic',
  graduationCap: 'graduation-cap',
  check: 'check',
  checkCircle: 'check-circle',
  layers: 'layers',
  phone: 'phone',
  settings: 'settings',
  star: 'star',
  // Starred state uses the same outline star, coloured by CSS — the pack
  // has no filled variant and the two styles must not be mixed.
  starFill: 'star',
  archive: 'archive',
  trash: 'delete',
  close: 'close',
  refresh: 'refresh',
  retry: 'retry',
  sync: 'sync',
  search: 'search',
  external: 'external-link',
  key: 'key',
  clock: 'clock',
  alert: 'warning',
  warning: 'warning',
  menu: 'menu',
  history: 'history',
  tasks: 'tasks',
  system: 'system',
  webhook: 'webhook',
  wifi: 'wifi',
  server: 'server',
  send: 'send',
  plus: 'plus',
  filter: 'filter',
  filterX: 'filter-x',
  filterLines: 'filter-lines',
  activity: 'activity',
  book: 'book',
  calendar: 'calendar',
  calendarCheck: 'calendar-check',
  listCheck: 'list-check',
  arrowRight: 'arrow-right',
  chevronRight: 'chevron-right',
  shield: 'shield',
  moon: 'moon',
  sun: 'sun',
  theme: 'theme',
  eye: 'eye',
  info: 'info',
  user: 'user',
  more: 'more',
  sparkles: 'sparkles',
};

/** Inline paths, only for icons no asset file supplies. Same outline style
 * (1.8px stroke, currentColor) as the 24×24 kit files. */
const INLINE: Partial<Record<IconName, React.ReactNode>> = {
  copy: (
    <>
      <rect x="9" y="9" width="13" height="13" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </>
  ),
  inbox: (
    <>
      <path d="M22 12h-6l-2 3h-4l-2-3H2" />
      <path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
    </>
  ),
};

export type IconSize = 16 | 18 | 20 | 24;

export function Icon({
  name,
  className,
  size,
}: {
  name: IconName;
  className?: string;
  size?: IconSize;
}) {
  const cls = `ah-icon${size ? ` ah-icon--${size}` : ''}${className ? ` ${className}` : ''}`;
  const file = KIT[name];
  if (file) {
    const data = ICON_DATA[file];
    if (!data) {
      // Generated data missing (stale build) — render nothing rather than a
      // broken image; the prebuild script regenerates it on every build.
      return null;
    }
    return (
      <svg
        className={cls}
        viewBox={data.viewBox}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        focusable="false"
        dangerouslySetInnerHTML={{ __html: data.body }}
      />
    );
  }
  return (
    <svg
      className={cls}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {INLINE[name]}
    </svg>
  );
}
