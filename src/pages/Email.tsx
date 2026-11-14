import type { Source } from '../lib/types';
import { formatDateTime } from '../lib/format';
import { Icon } from '../components/Icons';
import { SourceIcon } from '../components/SourceIcon';

interface EmailPageProps {
  source: Source | undefined;
  watchedEmail: string;
  onRetry: (source: Source) => void;
  retrying: boolean;
}

export function EmailPage({ source, watchedEmail, onRetry, retrying }: EmailPageProps) {
  return (
    <div>
      <div className="page-head">
        <h1>Email</h1>
        <p>Gmail inbox monitored by AlertHub.</p>
      </div>

      <div className="card glass glow-blue">
        <div className="source-card-head">
          <span className="source-icon">
            <SourceIcon sourceType="email" label="Gmail" />
          </span>
          <div>
            <h3>{watchedEmail}</h3>
            <div className="src-sub">Gmail account watched by AlertHub</div>
          </div>
          <span className="pill pill-ok">Account connected</span>
        </div>

        <dl className="kv">
          <dt>Permission</dt>
          <dd>Mailbox read permission: Granted (granted ~13:11 IST, 13 Nov 2026)</dd>
          <dt>Events</dt>
          <dd>{source ? `${source.eventCount} alerts ingested from this mailbox` : '—'}</dd>
          <dt>Last check</dt>
          <dd>
            {source?.lastCheckedAt ? formatDateTime(source.lastCheckedAt) : '—'} IST
          </dd>
          <dt>Schedule</dt>
          <dd>Hourly — Muse checks the mailbox and forwards new mail to this app</dd>
          <dt>Status</dt>
          <dd>{source?.detail ?? '—'}</dd>
        </dl>

        <div className="note info">
          <p>
            Mail is read by Muse&apos;s hourly checks and forwarded to this app — nothing
            is sent from your mailbox by AlertHub itself.
          </p>
        </div>

        {source ? (
          <button
            type="button"
            className="btn"
            disabled={retrying}
            onClick={() => onRetry(source)}
          >
            <Icon name="refresh" /> {retrying ? 'Checking…' : 'Check now'}
          </button>
        ) : null}
      </div>
    </div>
  );
}
