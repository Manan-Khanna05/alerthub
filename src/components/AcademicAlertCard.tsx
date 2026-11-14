/**
 * Academic alert card (Phase 7).
 * Colour is never the only signal: every direction also carries a text
 * label ("Improved +6", "Decreased −3", "New result", "No change").
 * Simulated alerts always show a TEST / SIMULATION badge.
 */
import '../notification-center.css';
import type { AcademicChange, Alert } from '../lib/types';
import { differenceLabel } from '../lib/simulator';
import { formatDateTime } from '../lib/format';
import { Icon } from './Icons';
import { SourceIcon } from './SourceIcon';

export function directionClass(direction: AcademicChange['direction']): string {
  switch (direction) {
    case 'up':
      return 'acad-up';
    case 'down':
      return 'acad-down';
    case 'new':
      return 'acad-new';
    case 'unchanged':
      return 'acad-unchanged';
  }
}

function percentage(academic: AcademicChange): string | null {
  if (!academic.max || academic.max <= 0) return null;
  return `${((academic.current / academic.max) * 100).toFixed(1)}%`;
}

interface AcademicAlertCardProps {
  alert: Alert;
  /** Open the full detail view (AlertDetail). */
  onView?: (alert: Alert) => void;
  compact?: boolean;
}

export function AcademicAlertCard({
  alert,
  onView,
  compact = false,
}: AcademicAlertCardProps) {
  const academic = alert.academic;
  if (!academic) return null;
  const pct = percentage(academic);
  const isSim = academic.isSimulation;

  return (
    <article
      className={`academic-card glass ${directionClass(academic.direction)}${compact ? ' compact' : ''}`}
      aria-label={`Marks update for ${academic.subject}: ${differenceLabel(academic)}`}
    >
      <div className="academic-card-head">
        <SourceIcon sourceType="cuims" label="CUIMS" />
        <div className="academic-titles">
          <strong className="academic-subject">{academic.subject}</strong>
          <span className="academic-assessment">{academic.assessment}</span>
        </div>
        <span className={`academic-diff-label ${directionClass(academic.direction)}`}>
          {differenceLabel(academic)}
        </span>
      </div>

      <div className="academic-marks">
        <div className="academic-mark current">
          <span className="academic-mark-label">Updated marks</span>
          <strong>
            {academic.current}
            <span className="academic-mark-max"> / {academic.max}</span>
          </strong>
          {pct ? <span className="academic-pct">{pct}</span> : null}
        </div>
        <div className="academic-mark previous">
          <span className="academic-mark-label">Previous marks</span>
          <strong>
            {academic.previous === null ? (
              '—'
            ) : (
              <>
                {academic.previous}
                <span className="academic-mark-max"> / {academic.max}</span>
              </>
            )}
          </strong>
          <span className="academic-pct">
            {academic.previous === null
              ? 'First result'
              : `Δ ${academic.difference > 0 ? '+' : ''}${academic.difference}`}
          </span>
        </div>
      </div>

      <div className="academic-meta">
        <span className="academic-verification">
          {academic.verified ? (
            '✓ Verified CUIMS data'
          ) : isSim ? (
            <>
              <Icon name="warning" /> SIMULATION — test only, not a real
              CUIMS result
            </>
          ) : (
            'Unverified — not confirmed against CUIMS'
          )}
        </span>
        <span className="academic-time">
          Updated {formatDateTime(alert.occurredAt)} IST
        </span>
      </div>

      {isSim ? (
        <span className="sim-badge">TEST · SIMULATION</span>
      ) : null}

      {!compact ? (
        <div className="academic-actions">
          {onView ? (
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => onView(alert)}
            >
              View Result
            </button>
          ) : null}
          {alert.sourceUrl ? (
            <a className="btn" href={alert.sourceUrl}>
              <Icon name="external" /> Open source
            </a>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}
