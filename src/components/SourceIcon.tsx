import type { Alert, SourceType } from '../lib/types';
import { Icon } from './Icons';

/**
 * Source mark: the identifying logo/icon for an alert's source.
 *
 * Full-colour logos, rendered as <img> so their own colours are never
 * touched by icon CSS (no filter, no stroke override — the multicolour
 * Gmail M and the blue-violet-cyan CUIMS mark must stay exactly as drawn):
 *
 * - Gmail → the supplied multicolour Gmail mark (assets/logos/gmail.svg)
 *   on a white/light tile (.source-mark--gmail).
 * - CUIMS → the supplied custom CUIMS monogram (assets/logos/cuims.svg,
 *   also kept as cuims-custom.svg for existing references). It is a custom
 *   source monogram, NOT an official university logo — it is never
 *   presented as one. The mark carries its own gradient tile, so the
 *   container is bare (.source-mark--bare).
 * - Tasks / System / Webhook / Web Push → the supplied full-colour source
 *   marks (assets/logos/tasks.svg etc.), each with its own baked-in tile
 *   (green / blue / violet / cyan-blue), so the container is bare too.
 * - Anything else → the matching outline UI icon inside a glass tile.
 *
 * Container is 40px (desktop) / 36px (mobile) via `.source-mark` in
 * styles.css; logos render with object-fit: contain inside it.
 */
export function SourceIcon({
  sourceType,
  className = '',
  label,
}: {
  sourceType: SourceType | string;
  className?: string;
  label?: string;
}) {
  if (sourceType === 'email') {
    return (
      <span
        className={`source-mark source-mark--gmail${className ? ` ${className}` : ''}`}
        role="img"
        aria-label={label ?? 'Gmail'}
      >
        <img src="/assets/logos/gmail.svg" alt="" draggable={false} />
      </span>
    );
  }
  if (sourceType === 'cuims') {
    return (
      <span
        className={`source-mark source-mark--bare${className ? ` ${className}` : ''}`}
        role="img"
        aria-label={label ?? 'CUIMS'}
      >
        <img src="/assets/logos/cuims.svg" alt="" draggable={false} />
      </span>
    );
  }
  const fullColour: Partial<Record<string, { src: string; label: string }>> = {
    task: { src: '/assets/logos/tasks.svg', label: 'Tasks' },
    system: { src: '/assets/logos/system.svg', label: 'System' },
    webhook: { src: '/assets/logos/webhook.svg', label: 'Webhook' },
    webpush: { src: '/assets/logos/web-push.svg', label: 'Web Push' },
    'web-push': { src: '/assets/logos/web-push.svg', label: 'Web Push' },
  };
  const mark = fullColour[sourceType];
  if (mark) {
    return (
      <span
        className={`source-mark source-mark--bare${className ? ` ${className}` : ''}`}
        role="img"
        aria-label={label ?? mark.label}
      >
        <img src={mark.src} alt="" draggable={false} />
      </span>
    );
  }
  return (
    <span
      className={`source-mark${className ? ` ${className}` : ''}`}
      aria-hidden="true"
    >
      <Icon name="bell" />
    </span>
  );
}

/** The alert's source type, for components that need the raw value. */
export function sourceTypeOf(alert: Alert): SourceType {
  return alert.sourceType;
}
