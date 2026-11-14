import type { Source } from '../lib/types';
import { formatDateTime } from '../lib/format';
import { Icon } from './Icons';
import { SourceIcon } from './SourceIcon';

/** Every source renders through SourceIcon: Gmail / CUIMS / Tasks /
 * System / Webhook get their full-colour supplied mark; anything else
 * falls back to the outline bell in a glass tile. */

function statusPill(status: Source['status']): { label: string; cls: string } {
  switch (status) {
    case 'ok':
      return { label: 'Healthy', cls: 'pill-ok' };
    case 'connected':
      return { label: 'Connected', cls: 'pill-ok' };
    case 'unreachable':
      return { label: 'Unreachable', cls: 'pill-bad' };
    case 'disabled':
      return { label: 'Disabled', cls: 'pill-neutral' };
    default:
      return { label: status, cls: 'pill-neutral' };
  }
}

/** Map a source key to the SourceIcon sourceType. */
function sourceTypeFor(key: string): string {
  switch (key) {
    case 'gmail':
      return 'email';
    case 'cuims':
      return 'cuims';
    case 'tasks':
      return 'task';
    case 'system':
      return 'system';
    case 'webhook':
      return 'webhook';
    case 'webpush':
    case 'web-push':
      return 'web-push';
    default:
      return 'unknown';
  }
}

/** Top-edge accent glow per source card: Gmail blue, CUIMS violet,
 * Tasks cyan. Other sources (system / webhook) get no glow. */
function sourceGlow(key: string): string {
  switch (key) {
    case 'gmail':
      return 'glow-blue';
    case 'cuims':
      return 'glow-violet';
    case 'tasks':
      return 'glow-cyan';
    default:
      return '';
  }
}

interface SourceCardProps {
  source: Source;
  onRetry: (source: Source) => void;
  onToggleEnabled?: (source: Source) => void;
  retrying?: boolean;
}

export function SourceCard({
  source,
  onRetry,
  onToggleEnabled,
  retrying,
}: SourceCardProps) {
  const pill = statusPill(source.enabled ? source.status : 'disabled');
  const glow = sourceGlow(source.key);
  return (
    <div className={`card source-card glass${glow ? ` ${glow}` : ''}`}>
      <div className="source-card-head">
        <span className="source-icon">
          <SourceIcon sourceType={sourceTypeFor(source.key)} label={source.name} />
        </span>
        <div>
          <h3>{source.name}</h3>
          <div className="src-sub">
            {source.eventCount} event{source.eventCount === 1 ? '' : 's'}
            {source.kind ? ` · ${source.kind}` : ''}
          </div>
        </div>
        <span className={`pill ${pill.cls}`}>{pill.label}</span>
      </div>
      <p className="source-detail">{source.detail}</p>
      <div className="source-foot">
        <span>
          Last checked{' '}
          {source.lastCheckedAt ? formatDateTime(source.lastCheckedAt) : 'never'}
        </span>
        {source.lastSuccessAt ? (
          <span>· Last success {formatDateTime(source.lastSuccessAt)}</span>
        ) : null}
        <span className="spacer" />
        {onToggleEnabled ? (
          <button
            type="button"
            className="switch"
            role="switch"
            aria-checked={source.enabled}
            aria-label={`Enable ${source.name}`}
            onClick={() => onToggleEnabled(source)}
          />
        ) : null}
        <button
          type="button"
          className="btn btn-sm"
          disabled={retrying}
          onClick={() => onRetry(source)}
        >
          <Icon name="retry" /> {retrying ? 'Retrying…' : 'Retry'}
        </button>
      </div>
    </div>
  );
}
