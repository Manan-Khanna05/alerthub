import { useEffect, useMemo, useState } from 'react';
import type { MarksSnapshot, Source } from '../lib/types';
import { formatDateTime } from '../lib/format';
import { Icon } from '../components/Icons';
import { SourceIcon } from '../components/SourceIcon';
import { RadarChart } from '../components/RadarChart';
import {
  analyzeSubjects,
  computeSgpa,
  focusAnalysis,
  fmt1,
  fmt2,
  gradeTone,
  GRADE_BANDS,
  overallAverage,
  SGPA_BANDS,
  shortLabel,
  theoryInternal,
} from '../lib/analytics';

interface CuimsPageProps {
  source: Source | undefined;
  marks: MarksSnapshot | undefined;
  onRetry: (source: Source) => void;
  retrying: boolean;
}

type CuimsTab = 'overview' | 'sgpa' | 'internal' | 'focus' | 'marks';

const TABS: { id: CuimsTab; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'sgpa', label: 'SGPA' },
  { id: 'internal', label: 'Internal Marks' },
  { id: 'focus', label: 'Focus' },
  { id: 'marks', label: 'All Marks' },
];

const CREDITS_KEY = 'alerthub:credits:v1';

function loadCreditOverrides(): Record<string, number> {
  try {
    const raw = localStorage.getItem(CREDITS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const out: Record<string, number> = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (typeof v === 'number' && Number.isFinite(v)) out[k] = v;
    }
    return out;
  } catch {
    return {};
  }
}

export function CuimsPage({ source, marks, onRetry, retrying }: CuimsPageProps) {
  const healthy = source?.status === 'ok' || source?.status === 'connected';
  const subjects = marks?.subjects ?? [];
  const totalComponents = subjects.reduce((n, s) => n + s.marks.length, 0);

  const [tab, setTab] = useState<CuimsTab>('overview');
  const [selectedCode, setSelectedCode] = useState<string | null>(null);
  const [creditOverrides, setCreditOverrides] = useState<Record<string, number>>(
    () => loadCreditOverrides(),
  );

  useEffect(() => {
    try {
      localStorage.setItem(CREDITS_KEY, JSON.stringify(creditOverrides));
    } catch {
      // Storage unavailable — edits still apply for this session.
    }
  }, [creditOverrides]);

  const analyses = useMemo(
    () => (marks ? analyzeSubjects(marks, creditOverrides) : []),
    [marks, creditOverrides],
  );
  const sgpa = useMemo(() => computeSgpa(analyses), [analyses]);
  const average = useMemo(() => overallAverage(analyses), [analyses]);
  const focus = useMemo(
    () => focusAnalysis(analyses, subjects),
    [analyses, subjects],
  );
  const theoryByCode = useMemo(() => {
    const map = new Map<string, ReturnType<typeof theoryInternal>>();
    for (const s of subjects) map.set(s.code, theoryInternal(s));
    return map;
  }, [subjects]);

  const weakest = focus.weakest[0];
  const strongest = focus.strongest[0];
  const selected =
    analyses.find((a) => a.code === selectedCode) ?? weakest ?? null;
  const selectedTheory = selected
    ? theoryByCode.get(selected.code)
    : undefined;

  const setCredit = (code: string, value: string) => {
    const n = Number(value);
    if (!Number.isFinite(n)) return;
    const clamped = Math.max(0, Math.min(10, Math.round(n)));
    setCreditOverrides((prev) => ({ ...prev, [code]: clamped }));
  };

  const focusBullets: string[] = useMemo(() => {
    const out: string[] = [];
    if (weakest) {
      const weakComps = focus.weakComponents.filter(
        (c) => c.code === weakest.code,
      );
      const worst = weakComps[0];
      out.push(
        `${weakest.subject} needs the most attention at ${fmt1(weakest.pct)}% (grade ${weakest.grade.letter}).` +
          (worst
            ? ` Its weakest part is ${worst.exam} at ${worst.obtained}/${worst.max} (${fmt1(worst.pct)}%).`
            : ''),
      );
    }
    for (const c of focus.weakComponents.slice(0, 3)) {
      const lost = c.max - c.obtained;
      out.push(
        `${c.subject} · ${c.exam}: ${c.obtained}/${c.max} (${fmt1(c.pct)}%) — ${fmt1(lost)} mark${lost === 1 ? '' : 's'} lost here.`,
      );
    }
    if (strongest) {
      out.push(
        `${strongest.subject} is your strongest at ${fmt1(strongest.pct)}% (grade ${strongest.grade.letter}) — keep it steady, it is lifting your SGPA.`,
      );
    }
    const partial = subjects
      .map((s) => ({ s, t: theoryByCode.get(s.code) }))
      .filter(
        (x) => x.t && x.t.applicable && x.t.postedSlots < 5,
      );
    if (partial.length > 0) {
      out.push(
        `Only MSTs are posted so far for ${partial
          .map((x) => x.s.subject)
          .join(', ')} — their theory-internal totals will rise as CUIMS posts assignments, quizzes and case studies.`,
      );
    }
    const lowTheory = subjects
      .map((s) => ({ s, t: theoryByCode.get(s.code) }))
      .filter((x) => x.t && x.t.applicable && x.t.total < 20)
      .sort((a, b) => (a.t?.total ?? 0) - (b.t?.total ?? 0));
    if (lowTheory.length > 0) {
      out.push(
        `Theory internals below 20/40: ${lowTheory
          .map((x) => `${x.s.subject} (${fmt2(x.t?.total ?? 0)})`)
          .join(', ')} — the end-semester exam (60 marks) will carry most of the weight in these subjects.`,
      );
    }
    return out;
  }, [weakest, strongest, focus.weakComponents, subjects, theoryByCode]);

  return (
    <div>
      <div className="page-head">
        <h1>CUIMS Marks</h1>
        <p>Chandigarh University marks, watched hourly.</p>
      </div>

      <div className="card glass glow-cyan">
        <div className="source-card-head">
          <span className="source-icon">
            <SourceIcon sourceType="cuims" label="CUIMS" />
          </span>
          <div>
            <h3>CUIMS Marks</h3>
            <div className="src-sub">students.cuchd.in</div>
          </div>
          {healthy ? (
            <span className="pill pill-ok">Marks up to date</span>
          ) : (
            <span className="pill pill-bad">Portal unavailable at last check</span>
          )}
        </div>

        <div className={healthy ? 'note' : 'note bad'}>
          <p>
            <strong>What happened at the last check:</strong>{' '}
            {source?.detail ??
              'CUIMS login failed 13 Nov 2026 ~14:22 IST: students.cuchd.in loaded (no HTTP 404) but no saved login exists for cuchd.in, so the User Id step could not be completed and marks were not read.'}
          </p>
        </div>

        <dl className="kv">
          <dt>Marks baseline</dt>
          <dd>
            {marks
              ? `${subjects.length} subjects, ${totalComponents} components — Session ${marks.session}, read ${marks.checkedAtIst}.`
              : 'No marks baseline yet — the failed check did not create or change one.'}
          </dd>
          <dt>Last check</dt>
          <dd>
            {source?.lastCheckedAt ? formatDateTime(source.lastCheckedAt) : '—'} IST
          </dd>
          <dt>Schedule</dt>
          <dd>Hourly</dd>
          <dt>Reporting rule</dt>
          <dd>Only new or changed marks are reported — no change means no alert.</dd>
        </dl>

        {!healthy ? (
          <div className="note info">
            <p>
              To fix this, save a login for cuchd.in in the browser (or complete the
              User Id step once) so the daily check can sign in and read marks.
            </p>
          </div>
        ) : null}

        {source ? (
          <button
            type="button"
            className="btn"
            disabled={retrying}
            onClick={() => onRetry(source)}
          >
            <Icon name="refresh" /> {retrying ? 'Retrying…' : 'Retry check'}
          </button>
        ) : null}
      </div>

      {subjects.length === 0 ? null : (
        <div className="card glass" style={{ marginTop: 16 }}>
          <div className="cuims-tabs" role="tablist" aria-label="CUIMS analysis">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={tab === t.id}
                className={`chip${tab === t.id ? ' active' : ''}`}
                onClick={() => setTab(t.id)}
              >
                {t.label}
              </button>
            ))}
          </div>

          {tab === 'overview' ? (
            <div>
              <h2>Performance Radar</h2>
              <p className="card-sub">
                Tap points for details · each axis is a subject&apos;s overall % ·
                10 subjects, {totalComponents} exams · {marks?.session}
              </p>
              <RadarChart
                analyses={analyses}
                average={average}
                selectedCode={selected?.code ?? null}
                onSelect={setSelectedCode}
              />
              {selected ? (
                <div className="radar-detail">
                  <div className="radar-detail-head">
                    <strong>{selected.subject}</strong>
                    <span className="src-sub">{selected.code}</span>
                    <span
                      className={`grade-pill grade-${gradeTone(selected.grade.letter)}`}
                    >
                      {selected.grade.letter}
                    </span>
                  </div>
                  <p className="card-sub" style={{ margin: '4px 0 0' }}>
                    {selected.obtained} / {selected.total} · {fmt1(selected.pct)}%
                    {' · '}
                    {selected.examCount} exams · {selected.credits} credits
                    {selectedTheory && selectedTheory.applicable
                      ? ` · Theory internal ${fmt2(selectedTheory.total)}/40`
                      : ''}
                  </p>
                </div>
              ) : null}
              <div className="stat-grid" style={{ marginTop: 16, marginBottom: 0 }}>
                <div className="card glass stat-card">
                  <div className="stat-label">Overall avg</div>
                  <div className="stat-value">{fmt1(average)}%</div>
                  <div className="stat-note">mean of 10 subjects</div>
                </div>
                <div className="card glass stat-card">
                  <div className="stat-label">Projected SGPA</div>
                  <div className="stat-value">{fmt2(sgpa.sgpa)}</div>
                  <div className="stat-note">
                    {sgpa.band} · {sgpa.totalCredits} credits
                  </div>
                </div>
                <div className="card glass stat-card">
                  <div className="stat-label">Strongest</div>
                  <div className="stat-value" style={{ fontSize: 20 }}>
                    {strongest ? shortLabel(strongest.code, strongest.subject) : '—'}
                  </div>
                  <div className="stat-note">
                    {strongest ? `${fmt1(strongest.pct)}%` : ''}
                  </div>
                </div>
                <div className="card glass stat-card">
                  <div className="stat-label">Needs focus</div>
                  <div className="stat-value" style={{ fontSize: 20 }}>
                    {weakest ? shortLabel(weakest.code, weakest.subject) : '—'}
                  </div>
                  <div className="stat-note">
                    {weakest ? `${fmt1(weakest.pct)}%` : ''}
                  </div>
                </div>
              </div>
            </div>
          ) : null}

          {tab === 'sgpa' ? (
            <div>
              <h2>Projected SGPA</h2>
              <p className="card-sub">
                From internal marks only — no end-semester marks are posted yet,
                so this will change after the end-semester exams.
              </p>
              <div className="sgpa-hero glow-violet">
                <div className="sgpa-value">{fmt2(sgpa.sgpa)}</div>
                <div>
                  <span className="pill pill-accent pill-no-dot">{sgpa.band}</span>
                </div>
                <p className="card-sub" style={{ marginTop: 8 }}>
                  {sgpa.totalPoints} credit-points ÷ {sgpa.totalCredits} credits ·
                  equivalent {fmt1((sgpa.sgpa - 0.75) * 10)}% by the CU formula
                  (SGPA − 0.75) × 10
                </p>
              </div>
              <div className="table-scroll">
                <table className="analytics-table">
                  <thead>
                    <tr>
                      <th>Subject</th>
                      <th className="num">%</th>
                      <th>Grade</th>
                      <th className="num">Points</th>
                      <th className="num">Credits</th>
                      <th className="num">Weighted</th>
                    </tr>
                  </thead>
                  <tbody>
                    {analyses.map((a) => (
                      <tr key={a.code}>
                        <td>
                          <strong>{a.subject}</strong>
                          <br />
                          <span className="src-sub">
                            {a.code}
                          </span>
                        </td>
                        <td className="num">{fmt1(a.pct)}%</td>
                        <td>
                          <span
                            className={`grade-pill grade-${gradeTone(a.grade.letter)}`}
                          >
                            {a.grade.letter}
                          </span>
                        </td>
                        <td className="num">{a.grade.points}</td>
                        <td className="num">
                          <input
                            type="number"
                            className="credit-input"
                            min={0}
                            max={10}
                            step={1}
                            value={a.credits}
                            aria-label={`Credits for ${a.subject}`}
                            onChange={(e) => setCredit(a.code, e.target.value)}
                          />
                        </td>
                        <td className="num">{a.weighted}</td>
                      </tr>
                    ))}
                    <tr className="total-row">
                      <td>
                        <strong>Total</strong>
                      </td>
                      <td className="num">{fmt1(average)}% avg</td>
                      <td />
                      <td />
                      <td className="num">{sgpa.totalCredits}</td>
                      <td className="num">{sgpa.totalPoints}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <div style={{ marginTop: 10 }}>
                <button
                  type="button"
                  className="btn btn-sm"
                  onClick={() => setCreditOverrides({})}
                >
                  Reset credits to defaults
                </button>
              </div>
              <div className="note info">
                <p>
                  <strong>Credits:</strong> all 10 are verified — 7 against the
                  official CU BE CSE (Full Stack) Semester 3 curriculum
                  (cuchd.in), and 3 confirmed from your attendance app
                  (13 Nov 2026): Aptitude-I (1), Entrepreneurship Mindset
                  (1) and Critical Enquiry (1). DBMS (4) was also confirmed
                  from the same screenshots. The total is 26 credits. Tap a
                  credit number to change it; the SGPA updates live and your
                  edits are saved on this device.
                </p>
              </div>
              <h3 style={{ marginTop: 16 }}>Grade scale (CU, 10-point)</h3>
              <div className="table-scroll">
                <table className="analytics-table">
                  <thead>
                    <tr>
                      <th>Grade</th>
                      <th className="num">% range</th>
                      <th className="num">Points</th>
                    </tr>
                  </thead>
                  <tbody>
                    {GRADE_BANDS.map((b) => (
                      <tr key={b.letter}>
                        <td>
                          <span
                            className={`grade-pill grade-${gradeTone(b.letter)}`}
                          >
                            {b.letter}
                          </span>
                        </td>
                        <td className="num">{b.range}</td>
                        <td className="num">{b.points}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="card-sub" style={{ marginTop: 8 }}>
                All your subjects are currently at 50% or above, so only the
                A+ to C+ bands affect your SGPA today.
              </p>
              <h3 style={{ marginTop: 16 }}>SGPA evaluation bands</h3>
              <div className="table-scroll">
                <table className="analytics-table">
                  <thead>
                    <tr>
                      <th>SGPA</th>
                      <th>Evaluation</th>
                    </tr>
                  </thead>
                  <tbody>
                    {SGPA_BANDS.map((b) => (
                      <tr key={b.label}>
                        <td className="num">
                          {b.min === 0
                            ? 'below 6'
                            : b.min === 9
                              ? '9 – 10'
                              : `${b.min} – ${(b.min + 0.99).toFixed(2)}`}
                        </td>
                        <td>{b.label}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}

          {tab === 'internal' ? (
            <div>
              <h2>Theory Internal Marks (out of 40)</h2>
              <p className="card-sub">
                Same formula as the CU theory calculator. Attendance is not in
                CUIMS, so the shown total is out of 38 at most until attendance
                is known.
              </p>
              <pre className="code-block">{`internal = MST-1/2 + MST-2/2 + Assignment + Quiz + Surprise Test/3 + Attendance
Maxes: MST-1 20 · MST-2 20 · Assignment 10 · Quiz 4 · Surprise Test 12 · Attendance 2`}</pre>
              <div className="note info" style={{ marginTop: 12 }}>
                <p>
                  <strong>How CUIMS components map:</strong> Mid-Semester Test-1
                  and Test-2 (out of 20) are halved · Assignment / Assignment Mark
                  (out of 12) is scaled to 10 · Surprise Test / Quiz (out of 12)
                  is scaled to 4 (Quiz slot) · Case Study / Course Project (out
                  of 20) is scaled to 12, then ÷ 3 (Surprise Test slot) ·
                  Attendance is not in CUIMS, so it is shown as 0/2 (missing —
                  not zero marks earned). For practical-heavy hybrid subjects the
                  formula covers the theory part only; practical components are
                  shown separately below each subject.
                </p>
              </div>
              {subjects.map((s) => {
                const t = theoryByCode.get(s.code);
                const a = analyses.find((x) => x.code === s.code);
                if (!t) return null;
                return (
                  <div key={s.code} className="marks-subject">
                    <div className="marks-subject-head">
                      <strong>{s.subject}</strong>
                      <span className="src-sub">{s.code}</span>
                      <span style={{ marginLeft: 'auto' }}>
                        {t.applicable ? (
                          <strong>{fmt2(t.total)} / 40</strong>
                        ) : (
                          <span className="pill pill-neutral pill-no-dot">
                            Formula N/A
                          </span>
                        )}
                      </span>
                    </div>
                    {t.applicable ? (
                      <>
                        <table className="marks-table">
                          <thead>
                            <tr>
                              <th>Component</th>
                              <th>How it maps</th>
                              <th className="num">Marks</th>
                            </tr>
                          </thead>
                          <tbody>
                            {t.rows.map((r) => (
                              <tr key={r.label}>
                                <td>{r.label}</td>
                                <td style={{ color: 'var(--muted)' }}>
                                  {r.detail}
                                </td>
                                <td className="num">
                                  {fmt2(r.obtained)} / {r.max}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        <p className="card-sub" style={{ marginTop: 6 }}>
                          Total {fmt2(t.total)} / 40
                          {t.postedSlots < 5
                            ? ` · only ${t.postedSlots} of 5 theory slots posted so far — the total will rise as CUIMS posts the rest`
                            : ''}
                          {' · '}max without attendance: 38/40.
                        </p>
                      </>
                    ) : (
                      <p className="card-sub">
                        This subject uses a different assessment pattern (no MST /
                        assignment / quiz components in CUIMS), so the theory
                        formula does not apply. Overall:{' '}
                        {a ? `${fmt1(a.pct)}% (${a.obtained}/${a.total})` : '—'}.
                      </p>
                    )}
                    {t.practical ? (
                      <p className="card-sub">
                        <strong>Practical (separate from theory):</strong>{' '}
                        {t.practical.obtained}/{t.practical.total} ={' '}
                        {fmt1(t.practical.pct)}% ·{' '}
                        {t.practical.items
                          .map((m) => `${m.exam} ${m.obtained ?? 'ABSENT'}/${m.max}`)
                          .join(' · ')}
                      </p>
                    ) : null}
                    {t.applicable && t.unmapped.length > 0 ? (
                      <p className="card-sub">
                        Not counted in the theory formula:{' '}
                        {t.unmapped
                          .map((m) => `${m.exam} ${m.obtained ?? 'ABSENT'}/${m.max}`)
                          .join(' · ')}
                      </p>
                    ) : null}
                  </div>
                );
              })}
            </div>
          ) : null}

          {tab === 'focus' ? (
            <div>
              <h2>Focus Analysis</h2>
              <p className="card-sub">
                Built from your current marks — weakest and strongest subjects,
                and where the marks were actually lost.
              </p>
              <div className="grid-2">
                <div className="card glass">
                  <h3>Weakest subjects</h3>
                  {focus.weakest.map((a, i) => (
                    <div key={a.code} className="list-row">
                      <div className="row-main">
                        <strong>
                          {i + 1}. {a.subject}
                        </strong>
                        <span>
                          {fmt1(a.pct)}% · grade {a.grade.letter} ·{' '}
                          {a.examCount} exams
                        </span>
                      </div>
                      <span
                        className={`grade-pill grade-${gradeTone(a.grade.letter)}`}
                      >
                        {a.grade.letter}
                      </span>
                    </div>
                  ))}
                </div>
                <div className="card glass">
                  <h3>Strongest subjects</h3>
                  {focus.strongest.map((a, i) => (
                    <div key={a.code} className="list-row">
                      <div className="row-main">
                        <strong>
                          {i + 1}. {a.subject}
                        </strong>
                        <span>
                          {fmt1(a.pct)}% · grade {a.grade.letter} ·{' '}
                          {a.examCount} exams
                        </span>
                      </div>
                      <span
                        className={`grade-pill grade-${gradeTone(a.grade.letter)}`}
                      >
                        {a.grade.letter}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="card glass" style={{ marginTop: 16 }}>
                <h3>What to focus on</h3>
                <ul className="focus-list">
                  {focusBullets.map((b, i) => (
                    <li key={i}>{b}</li>
                  ))}
                </ul>
              </div>
              <div className="card glass" style={{ marginTop: 16 }}>
                <h3>Weakest components (below 70%)</h3>
                <p className="card-sub">
                  Every component where you scored under 70% of its maximum —
                  these are the cheapest marks to win back.
                </p>
                <div className="table-scroll">
                  <table className="analytics-table">
                    <thead>
                      <tr>
                        <th>Subject</th>
                        <th>Component</th>
                        <th className="num">Marks</th>
                        <th className="num">%</th>
                      </tr>
                    </thead>
                    <tbody>
                      {focus.weakComponents.slice(0, 8).map((c) => (
                        <tr key={`${c.code}-${c.exam}`}>
                          <td>{c.subject}</td>
                          <td>{c.exam}</td>
                          <td className="num">
                            {c.obtained} / {c.max}
                          </td>
                          <td className="num">{fmt1(c.pct)}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          ) : null}

          {tab === 'marks' ? (
            <div>
              <h2>Latest marks</h2>
              <p className="card-sub">
                {marks?.session} · Semester 3 · {marks?.note ?? ''}
              </p>
              {subjects.map((subject) => (
                <div key={subject.code} className="marks-subject">
                  <div className="marks-subject-head">
                    <strong>{subject.subject}</strong>
                    <span className="src-sub">{subject.code}</span>
                  </div>
                  <table className="marks-table">
                    <thead>
                      <tr>
                        <th>Component</th>
                        <th className="num">Marks</th>
                      </tr>
                    </thead>
                    <tbody>
                      {subject.marks.map((m) => (
                        <tr key={m.exam}>
                          <td>{m.exam}</td>
                          <td className="num">
                            {m.obtained ?? 'ABSENT'} / {m.max}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
