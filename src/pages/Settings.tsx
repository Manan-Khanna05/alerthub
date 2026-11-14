import { useState } from 'react';
import type {
  Alert,
  DeliveryLog,
  Device,
  NotificationChannelPrefs,
  Preferences,
  Priority,
  Profile,
  Source,
  TaskItem,
  ThemePreference,
  ToastKind,
} from '../lib/types';
import {
  addSimulatedAlertToLocalStore,
  buildMarksUpdateAlert,
  computeDifference,
  marksUpdateBody,
  saveSimulationRecord,
  sendMarksUpdatePush,
  type ServerPushResult,
} from '../lib/simulator';
import {
  PRIORITIES,
  PRIORITY_LABELS,
  channelPrefsFor,
} from '../lib/priority';
import { SourceIcon } from '../components/SourceIcon';
import '../notification-center.css';

interface SettingsPageProps {
  profile: Profile;
  preferences: Preferences;
  alerts: Alert[];
  sources: Source[];
  tasks: TaskItem[];
  devices: Device[];
  deliveryLogs: DeliveryLog[];
  onUpdatePreferences: (patch: Partial<Preferences>) => void;
  showToast: (message: string, kind?: ToastKind) => void;
}

function ToggleRow({
  title,
  desc,
  checked,
  disabled,
  onChange,
}: {
  title: string;
  desc: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="switch-row">
      <div className="switch-text">
        <strong>{title}</strong>
        <span>{desc}</span>
      </div>
      <button
        type="button"
        className="switch"
        role="switch"
        aria-checked={checked}
        aria-label={title}
        disabled={disabled}
        onClick={() => onChange(!checked)}
      />
    </div>
  );
}

export function SettingsPage({
  profile,
  preferences,
  alerts,
  sources,
  tasks,
  devices,
  deliveryLogs,
  onUpdatePreferences,
  showToast,
}: SettingsPageProps) {
  const exportJson = () => {
    const payload = {
      exportedAt: new Date().toISOString(),
      timezone: 'Asia/Calcutta',
      profile,
      preferences,
      alerts,
      sources,
      tasks,
      devices,
      deliveryLogs,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `alerthub-export-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    showToast('Export downloaded as JSON.', 'success');
  };

  const theme = preferences.theme;
  const themeButton = (value: ThemePreference, label: string) => (
    <button
      key={value}
      type="button"
      className={`chip${theme === value ? ' active' : ''}`}
      onClick={() => onUpdatePreferences({ theme: value })}
    >
      {label}
    </button>
  );

  /* --- Academic Marks Update Simulator (Notification Testing) --- */
  const [simCourse, setSimCourse] = useState('Sample Course');
  const [simAssessment, setSimAssessment] = useState('MST-1');
  const [simPrevious, setSimPrevious] = useState('18');
  const [simUpdated, setSimUpdated] = useState('24');
  const [simMax, setSimMax] = useState('30');
  const [simPriority, setSimPriority] = useState<Priority>('high');
  const [simDeviceId, setSimDeviceId] = useState('');
  const [simBusy, setSimBusy] = useState(false);
  const [simResult, setSimResult] = useState<{
    eventId: string;
    externalId: string;
    server: ServerPushResult;
    localFallbackUsed: boolean;
  } | null>(null);

  const parseMarks = (v: string): number | null => {
    const trimmed = v.trim();
    if (trimmed === '') return null;
    const n = Number(trimmed);
    return Number.isFinite(n) ? n : null;
  };
  const simPrevNum = parseMarks(simPrevious);
  const simPrevValid = simPrevious.trim() === '' || simPrevNum !== null;
  const simUpdatedNum = parseMarks(simUpdated);
  const simMaxNum = parseMarks(simMax);
  const simValid =
    simCourse.trim().length > 0 &&
    simAssessment.trim().length > 0 &&
    simPrevValid &&
    simUpdatedNum !== null &&
    simUpdatedNum >= 0 &&
    simMaxNum !== null &&
    simMaxNum > 0 &&
    simUpdatedNum <= simMaxNum &&
    (simPrevNum === null || simPrevNum <= simMaxNum);
  const simDiff =
    simValid && simUpdatedNum !== null
      ? computeDifference(simPrevNum, simUpdatedNum)
      : null;
  const simPreviewBody =
    simValid && simUpdatedNum !== null && simMaxNum !== null
      ? marksUpdateBody({
          course: simCourse.trim(),
          assessment: simAssessment.trim(),
          previous: simPrevNum,
          updated: simUpdatedNum,
          max: simMaxNum,
          priority: simPriority,
          deviceId: simDeviceId || null,
        })
      : null;

  const runSimulation = async () => {
    if (!simValid || simUpdatedNum === null || simMaxNum === null || simBusy)
      return;
    setSimBusy(true);
    setSimResult(null);
    try {
      const input = {
        course: simCourse.trim(),
        assessment: simAssessment.trim(),
        previous: simPrevNum,
        updated: simUpdatedNum,
        max: simMaxNum,
        priority: simPriority,
        deviceId: simDeviceId || null,
      };
      const { eventId, academic, alert } = buildMarksUpdateAlert(input);
      // Real server-side Web Push first — the result is recorded honestly.
      const server = await sendMarksUpdatePush({
        deviceId: input.deviceId,
        title: alert.title,
        body: alert.body,
        tag: `marks-update-${eventId}`,
        url: `/alerts/${alert.externalId}`,
        alertId: alert.externalId,
        severity: alert.severity,
      });
      const localFallbackUsed = !server.ok;
      addSimulatedAlertToLocalStore(alert, server.note);
      saveSimulationRecord({
        kind: 'SIMULATION',
        eventId,
        externalId: alert.externalId,
        createdAt: new Date().toISOString(),
        course: input.course,
        assessment: input.assessment,
        previous: input.previous,
        current: input.updated,
        max: input.max,
        difference: academic.difference,
        direction: academic.direction,
        priority: input.priority,
        deviceId: input.deviceId,
        serverResult: server.note,
        localFallbackUsed,
      });
      setSimResult({
        eventId,
        externalId: alert.externalId,
        server,
        localFallbackUsed,
      });
      showToast(
        server.ok
          ? 'Simulation sent — test alert added to the feed.'
          : 'Simulation added to the local feed — server push did not send (see status below).',
        server.ok ? 'success' : 'info',
      );
    } finally {
      setSimBusy(false);
    }
  };

  const setPriorityChannel = (
    priority: Priority,
    channel: keyof NotificationChannelPrefs,
    value: boolean,
  ) => {
    const current = channelPrefsFor(preferences.priorityPrefs, priority);
    onUpdatePreferences({
      priorityPrefs: {
        ...preferences.priorityPrefs,
        [priority]: { ...current, [channel]: value },
      },
    });
  };

  return (
    <div>
      <div className="page-head">
        <h1>Settings</h1>
        <p>Profile, notifications, theme and data export.</p>
      </div>

      <div className="grid-2">
        <div className="card glass">
          <h2>Profile</h2>
          <div className="profile-grid" style={{ marginTop: 12 }}>
            <div className="pf">
              <label>Name</label>
              <div>{profile.name}</div>
            </div>
            <div className="pf">
              <label>UID</label>
              <div>{profile.uid}</div>
            </div>
            <div className="pf">
              <label>Email</label>
              <div>{profile.email}</div>
            </div>
            <div className="pf">
              <label>Programme</label>
              <div>{profile.programme}</div>
            </div>
            <div className="pf">
              <label>Section / Group</label>
              <div>{profile.section}</div>
            </div>
            <div className="pf">
              <label>Timezone</label>
              <div>Asia/Calcutta (IST)</div>
            </div>
          </div>
        </div>

        <div className="card glass">
          <h2>Theme</h2>
          <p className="card-sub">
            Dark (Glass Navy) is the default. Light is available anytime.
          </p>
          <div className="chip-row">
            {themeButton('light', 'Light')}
            {themeButton('dark', 'Dark')}
          </div>
          <h2 style={{ marginTop: 18 }}>Data export</h2>
          <p className="card-sub">
            Downloads alerts, sources, tasks, devices, delivery log and
            preferences as one JSON file.
          </p>
          <button type="button" className="btn" onClick={exportJson}>
            Export as JSON
          </button>
        </div>
      </div>

      <div className="card glass glow-blue">
        <h2>Notification preferences</h2>
        <ToggleRow
          title="Master switch"
          desc="Turn all AlertHub notifications on or off."
          checked={preferences.masterEnabled}
          onChange={(v) => onUpdatePreferences({ masterEnabled: v })}
        />
        <h3 style={{ marginTop: 16 }}>Sources</h3>
        <ToggleRow
          title="Email (Gmail)"
          desc={`Alerts from ${preferences.watchedEmail}`}
          checked={preferences.emailEnabled}
          onChange={(v) => onUpdatePreferences({ emailEnabled: v })}
        />
        <ToggleRow
          title="CUIMS marks"
          desc="New or changed marks only."
          checked={preferences.cuimsEnabled}
          onChange={(v) => onUpdatePreferences({ cuimsEnabled: v })}
        />
        <ToggleRow
          title="Task reminders"
          desc="Reminders for tasks you add in AlertHub."
          checked={preferences.taskEnabled}
          onChange={(v) => onUpdatePreferences({ taskEnabled: v })}
        />
        <ToggleRow
          title="System"
          desc="Sync, health and operational events from AlertHub itself."
          checked={preferences.systemEnabled}
          onChange={(v) => onUpdatePreferences({ systemEnabled: v })}
        />
        <ToggleRow
          title="Webhook"
          desc="Events posted to the generic webhook endpoint."
          checked={preferences.webhookEnabled}
          onChange={(v) => onUpdatePreferences({ webhookEnabled: v })}
        />
        <h3 style={{ marginTop: 16 }}>Severity</h3>
        <ToggleRow
          title="Critical"
          desc="Highest-priority alerts."
          checked={preferences.criticalEnabled}
          onChange={(v) => onUpdatePreferences({ criticalEnabled: v })}
        />
        <ToggleRow
          title="Important"
          desc="Important alerts, e.g. fee and account notices."
          checked={preferences.importantEnabled}
          onChange={(v) => onUpdatePreferences({ importantEnabled: v })}
        />
        <ToggleRow
          title="Normal"
          desc="Everyday alerts."
          checked={preferences.normalEnabled}
          onChange={(v) => onUpdatePreferences({ normalEnabled: v })}
        />
        <ToggleRow
          title="Low"
          desc="Low-priority alerts (off by default)."
          checked={preferences.lowEnabled}
          onChange={(v) => onUpdatePreferences({ lowEnabled: v })}
        />
        <ToggleRow
          title="Digest low-priority alerts"
          desc="Bundle low-priority alerts into a digest instead of sending each one."
          checked={preferences.digestLow}
          onChange={(v) => onUpdatePreferences({ digestLow: v })}
        />
        <h3 style={{ marginTop: 16 }}>Quiet hours</h3>
        <ToggleRow
          title="Enable quiet hours"
          desc="Hold non-critical notifications during quiet hours."
          checked={preferences.quietEnabled}
          onChange={(v) => onUpdatePreferences({ quietEnabled: v })}
        />
        <div className="form-inline" style={{ marginTop: 12 }}>
          <div className="field narrow">
            <label htmlFor="quiet-start">Quiet hours start</label>
            <input
              id="quiet-start"
              className="input"
              type="time"
              value={preferences.quietStart}
              disabled={!preferences.quietEnabled}
              onChange={(e) =>
                onUpdatePreferences({ quietStart: e.target.value })
              }
            />
          </div>
          <div className="field narrow">
            <label htmlFor="quiet-end">Quiet hours end</label>
            <input
              id="quiet-end"
              className="input"
              type="time"
              value={preferences.quietEnd}
              disabled={!preferences.quietEnabled}
              onChange={(e) => onUpdatePreferences({ quietEnd: e.target.value })}
            />
          </div>
        </div>
      </div>

      <div className="card glass">
        <h2>Notification priorities</h2>
        <p className="card-sub">
          How each priority is delivered. Marks changes are High; only
          severity-critical events (e.g. a security notice) are Critical.
        </p>
        {PRIORITIES.map((p) => {
          const chans = channelPrefsFor(preferences.priorityPrefs, p);
          const desc: Record<Priority, string> = {
            critical: 'Security notices and other critical events.',
            high: 'Marks updates (CUIMS) and important alerts.',
            normal: 'Tasks and routine email.',
            low: 'System and sync information.',
          };
          const channels: {
            key: keyof NotificationChannelPrefs;
            label: string;
          }[] = [
            { key: 'banner', label: 'Banner' },
            { key: 'push', label: 'Push' },
            { key: 'sound', label: 'Sound' },
            { key: 'vibration', label: 'Vibration' },
          ];
          return (
            <div key={p} className="priority-row">
              <div className="priority-name">
                <strong>{PRIORITY_LABELS[p]}</strong>
                <span>{desc[p]}</span>
              </div>
              {channels.map((c) => (
                <label key={c.key} className="priority-toggle">
                  <input
                    type="checkbox"
                    checked={chans[c.key]}
                    onChange={(e) =>
                      setPriorityChannel(p, c.key, e.target.checked)
                    }
                  />
                  {c.label}
                </label>
              ))}
            </div>
          );
        })}
      </div>

      <div className="card glass glow-violet">
        <h2>Notification Testing</h2>
        <h3 style={{ marginTop: 12 }}>Academic Marks Update Simulator</h3>
        <p className="card-sub">
          Sends a test CUIMS marks-update notification through the real push
          pipeline. This is a <strong>SIMULATION</strong> — it does not read
          CUIMS, does not change any university result, and never writes to
          the marks data or the marks baseline. The test alert is labelled
          TEST / SIMULATION in the feed, in its detail view and in the
          delivery log.
        </p>
        <div className="sim-form">
          <div className="field">
            <label htmlFor="sim-source">Source</label>
            <input
              id="sim-source"
              className="input"
              type="text"
              value="CUIMS"
              disabled
              aria-label="Source (fixed to CUIMS)"
            />
            <div className="hint">Fixed — simulations always come from CUIMS.</div>
          </div>
          <div className="form-inline">
            <div className="field">
              <label htmlFor="sim-course">Course name</label>
              <input
                id="sim-course"
                className="input"
                type="text"
                value={simCourse}
                onChange={(e) => setSimCourse(e.target.value)}
                placeholder="Sample Course"
              />
            </div>
            <div className="field narrow">
              <label htmlFor="sim-assessment">Assessment type</label>
              <input
                id="sim-assessment"
                className="input"
                type="text"
                value={simAssessment}
                onChange={(e) => setSimAssessment(e.target.value)}
                placeholder="MST-1"
              />
            </div>
          </div>
          <div className="form-inline">
            <div className="field narrow">
              <label htmlFor="sim-previous">Previous marks</label>
              <input
                id="sim-previous"
                className="input"
                type="number"
                min={0}
                value={simPrevious}
                onChange={(e) => setSimPrevious(e.target.value)}
                placeholder="Leave blank for a new result"
              />
              <div className="hint">Leave blank for a new result.</div>
            </div>
            <div className="field narrow">
              <label htmlFor="sim-updated">Updated marks</label>
              <input
                id="sim-updated"
                className="input"
                type="number"
                min={0}
                value={simUpdated}
                onChange={(e) => setSimUpdated(e.target.value)}
              />
            </div>
            <div className="field narrow">
              <label htmlFor="sim-max">Maximum marks</label>
              <input
                id="sim-max"
                className="input"
                type="number"
                min={1}
                value={simMax}
                onChange={(e) => setSimMax(e.target.value)}
              />
            </div>
          </div>
          {simDiff ? (
            <div
              className={`sim-diff${simDiff.difference > 0 ? ' positive' : simDiff.difference < 0 ? ' negative' : ''}`}
              aria-live="polite"
            >
              {simDiff.direction === 'new'
                ? `New result: ${simUpdatedNum}/${simMaxNum}`
                : simDiff.direction === 'unchanged'
                  ? `No change: ${simUpdatedNum}/${simMaxNum}`
                  : `Difference: ${simDiff.difference > 0 ? '+' : ''}${simDiff.difference} marks (${simPrevNum}/${simMaxNum} → ${simUpdatedNum}/${simMaxNum})`}
            </div>
          ) : null}
          <div className="form-inline">
            <div className="field narrow">
              <label htmlFor="sim-priority">Test notification priority</label>
              <select
                id="sim-priority"
                className="select"
                value={simPriority}
                onChange={(e) => setSimPriority(e.target.value as Priority)}
              >
                <option value="critical">CRITICAL</option>
                <option value="high">HIGH</option>
                <option value="normal">NORMAL</option>
                <option value="low">LOW</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="sim-device">Target device</label>
              <select
                id="sim-device"
                className="select"
                value={simDeviceId}
                onChange={(e) => setSimDeviceId(e.target.value)}
              >
                <option value="">All devices</option>
                {devices.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                    {d.subscribed ? '' : ' (not subscribed)'}
                  </option>
                ))}
              </select>
            </div>
          </div>
          {!simValid ? (
            <p className="sim-note" role="alert">
              Check the marks: updated marks must be a number between 0 and
              the maximum, and previous marks (if given) must not exceed the
              maximum.
            </p>
          ) : null}
          <div>
            <button
              type="button"
              className="btn btn-primary"
              disabled={!simValid || simBusy}
              onClick={runSimulation}
            >
              {simBusy ? 'Simulating…' : 'Simulate Marks Update'}
            </button>
          </div>
        </div>

        {simPreviewBody ? (
          <div className="sim-preview" aria-label="Notification preview">
            <h3>Notification preview (in-app)</h3>
            <span className="sim-badge">TEST · SIMULATION</span>
            <div
              style={{
                display: 'flex',
                gap: 10,
                alignItems: 'center',
                marginTop: 6,
              }}
            >
              <SourceIcon sourceType="cuims" label="CUIMS" />
              <div className="sim-preview-title">🎓 CUIMS Marks Updated</div>
            </div>
            <p>{simPreviewBody}</p>
          </div>
        ) : null}

        {simResult ? (
          <div className="sim-status" aria-live="polite">
            <strong>Testing status</strong>
            <dl>
              <dt>Event ID</dt>
              <dd className="mono">{simResult.eventId}</dd>
              <dt>External ID</dt>
              <dd className="mono">{simResult.externalId}</dd>
              <dt>Server push</dt>
              <dd>{simResult.server.note}</dd>
              <dt>Endpoint</dt>
              <dd className="mono">
                {simResult.server.endpoint === 'none'
                  ? '—'
                  : `/api/${simResult.server.endpoint}`}
                {simResult.server.status !== null
                  ? ` (HTTP ${simResult.server.status})`
                  : ''}
              </dd>
              <dt>Devices sent to</dt>
              <dd>{simResult.server.sent}</dd>
              <dt>Local fallback</dt>
              <dd>
                {simResult.localFallbackUsed
                  ? 'Yes — the test alert is in the local feed and shown in the preview above; no phone push was confirmed.'
                  : 'No — the server push was used.'}
              </dd>
            </dl>
            <p className="sim-note">
              The simulated alert is stored in localStorage as a SIMULATION
              record and added to the local feed. It does not change any real
              marks.
            </p>
          </div>
        ) : null}
      </div>
    </div>
  );
}
