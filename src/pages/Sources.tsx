import { useState } from 'react';
import type { Source } from '../lib/types';
import { SourceCard } from '../components/SourceCard';
import { Icon } from '../components/Icons';
import { postWebhookTestEvent } from '../lib/api';
import {
  generateApiKey,
  loadApiKey,
  saveApiKey,
} from '../lib/store';

interface SourcesPageProps {
  sources: Source[];
  retryingSourceId: number | null;
  onRetry: (source: Source) => void;
  onToggleEnabled: (source: Source) => void;
}

const EXAMPLE_PAYLOAD = `fetch('/api/v1/events', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer <your-api-key>'
  },
  body: JSON.stringify({
    externalId: 'order-12345',
    title: 'Order shipped',
    body: 'Your order has left the warehouse.',
    sender: 'Shop',
    sourceType: 'webhook',
    sourceLabel: 'Webhook · shop',
    severity: 'normal',
    occurredAt: new Date().toISOString()
  })
});`;

export function SourcesPage({
  sources,
  retryingSourceId,
  onRetry,
  onToggleEnabled,
}: SourcesPageProps) {
  const [apiKey, setApiKey] = useState<string | null>(() => loadApiKey());
  const [justCreated, setJustCreated] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [testBusy, setTestBusy] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);
  const [testOk, setTestOk] = useState<boolean | null>(null);

  const endpoint =
    typeof window !== 'undefined'
      ? `${window.location.origin}/api/v1/events`
      : '/api/v1/events';

  const handleGenerate = () => {
    const key = generateApiKey();
    saveApiKey(key);
    setApiKey(key);
    setJustCreated(key);
    setCopied(false);
  };

  const handleRevoke = () => {
    saveApiKey(null);
    setApiKey(null);
    setJustCreated(null);
  };

  const handleCopy = async () => {
    const key = justCreated ?? apiKey;
    if (!key) return;
    try {
      await navigator.clipboard.writeText(key);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  const handleTestEvent = async () => {
    setTestBusy(true);
    setTestResult(null);
    const res = await postWebhookTestEvent(apiKey);
    setTestOk(res.ok);
    setTestResult(res.detail);
    setTestBusy(false);
  };

  const maskedKey = apiKey
    ? `${apiKey.slice(0, 8)}${'•'.repeat(20)}`
    : null;

  return (
    <div>
      <div className="page-head">
        <h1>Sources</h1>
        <p>Every feed that can raise an alert in AlertHub.</p>
      </div>

      <div className="grid-2">
        {sources.map((s) => (
          <SourceCard
            key={s.id}
            source={s}
            onRetry={onRetry}
            onToggleEnabled={onToggleEnabled}
            retrying={retryingSourceId === s.id}
          />
        ))}
      </div>

      <div className="card glass glow-cyan" style={{ marginTop: 16 }}>
        <h2>Generic webhook</h2>
        <p className="card-sub">
          Any app or script can post events into AlertHub.
        </p>
        <dl className="kv">
          <dt>Endpoint</dt>
          <dd className="mono">{endpoint}</dd>
          <dt>Method</dt>
          <dd className="mono">POST · application/json</dd>
          <dt>Auth</dt>
          <dd className="mono">Authorization: Bearer &lt;api-key&gt;</dd>
          <dt>Idempotency</dt>
          <dd>
            Events are deduplicated by <span className="mono">externalId</span> —
            re-posting the same externalId will not create a duplicate alert.
          </dd>
        </dl>
        <pre className="code-block">{EXAMPLE_PAYLOAD}</pre>
        <div style={{ marginTop: 14, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button
            type="button"
            className="btn btn-primary"
            disabled={testBusy}
            onClick={handleTestEvent}
          >
            {testBusy ? 'Sending…' : 'Send test event'}
          </button>
        </div>
        {testResult ? (
          <div className={`note ${testOk ? 'good' : 'bad'}`}>
            <p>{testResult}</p>
            {!testOk && !apiKey ? (
              <p>
                No API key is configured — generate one below and use it as the
                Bearer token. The failure above is the server&apos;s honest
                response, not a simulated success.
              </p>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="card glass">
        <h2>Webhook API key</h2>
        <p className="card-sub">
          Keys are generated in this browser and stored only in localStorage.
        </p>
        {apiKey ? (
          <>
            <div className="key-box">
              <code>{justCreated ?? maskedKey}</code>
              <button type="button" className="btn btn-sm" onClick={handleCopy}>
                <Icon name="copy" /> {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
            {justCreated ? (
              <div className="note">
                <p>
                  This key is shown in full only once — copy it now. After you
                  leave this page it will be masked.
                </p>
              </div>
            ) : (
              <p style={{ fontSize: 13, color: 'var(--muted)' }}>
                The stored key is masked. Generate a new one to replace it.
              </p>
            )}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button type="button" className="btn" onClick={handleGenerate}>
                Generate new key
              </button>
              <button type="button" className="btn btn-danger" onClick={handleRevoke}>
                Revoke key
              </button>
            </div>
          </>
        ) : (
          <>
            <p style={{ fontSize: 13.5, color: 'var(--muted)' }}>
              No webhook API key is configured yet.
            </p>
            <button type="button" className="btn btn-primary" onClick={handleGenerate}>
              <Icon name="key" /> Generate API key
            </button>
          </>
        )}
      </div>
    </div>
  );
}
