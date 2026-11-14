import type {
  MarkComponent,
  MarksSnapshot,
  SubjectCredits,
  SubjectMarks,
} from './types';

/**
 * CUIMS analytics — every number here is computed from the marks snapshot
 * read from the CUIMS portal. Nothing is hardcoded from a screenshot.
 *
 * Grade scale (CU 10-point, as used by the CU grade calculator):
 *   A+ ≥90% (10) · A 80–89% (9) · B+ 70–79% (8) · B 60–69% (7) ·
 *   C+ 50–59% (6) · C 40–49% (5) · D+ 35–39% (4) · D 30–34% (3) ·
 *   E+ 25–29% (2) · E 20–24% (1) · F+ <20% (0)
 * SGPA = Σ(credits × grade points) / Σ(credits).
 */

export interface GradeBand {
  min: number;
  /** Display range, e.g. "80–89%" or "90% and above". */
  range: string;
  letter: string;
  points: number;
}

export const GRADE_BANDS: GradeBand[] = [
  { min: 90, range: '90% and above', letter: 'A+', points: 10 },
  { min: 80, range: '80–89%', letter: 'A', points: 9 },
  { min: 70, range: '70–79%', letter: 'B+', points: 8 },
  { min: 60, range: '60–69%', letter: 'B', points: 7 },
  { min: 50, range: '50–59%', letter: 'C+', points: 6 },
  { min: 40, range: '40–49%', letter: 'C', points: 5 },
  { min: 35, range: '35–39%', letter: 'D+', points: 4 },
  { min: 30, range: '30–34%', letter: 'D', points: 3 },
  { min: 25, range: '25–29%', letter: 'E+', points: 2 },
  { min: 20, range: '20–24%', letter: 'E', points: 1 },
  { min: 0, range: 'below 20%', letter: 'F+', points: 0 },
];

export function gradeForPct(pct: number): GradeBand {
  for (const band of GRADE_BANDS) {
    if (pct >= band.min) return band;
  }
  return GRADE_BANDS[GRADE_BANDS.length - 1];
}

/** Colour tone for a grade: a = green, b = blue, c = amber, low = red. */
export function gradeTone(letter: string): 'a' | 'b' | 'c' | 'low' {
  if (letter === 'A+' || letter === 'A') return 'a';
  if (letter === 'B+' || letter === 'B') return 'b';
  if (letter === 'C+' || letter === 'C') return 'c';
  return 'low';
}

export const SGPA_BANDS: { min: number; label: string }[] = [
  { min: 9, label: 'Outstanding' },
  { min: 8, label: 'Excellent' },
  { min: 7, label: 'Very Good' },
  { min: 6, label: 'Good' },
  { min: 0, label: 'Average' },
];

export function sgpaBand(sgpa: number): string {
  for (const band of SGPA_BANDS) {
    if (sgpa >= band.min) return band.label;
  }
  return 'Average';
}

/** Short radar labels (same style as the reference screenshot). */
export const SHORT_LABELS: Record<string, string> = {
  '25SMT-236': 'Probab..',
  '25CST-238': 'Comput..',
  '25TDT-212': 'APTITU..',
  '25CSH-232': 'ADVANC..',
  '25CSH-236': 'Databa..',
  '25CSH-235': 'Object..',
  '25CSH-247': 'Agile ..',
  '25UCT-296': 'Univer..',
  '25INT-221': 'Entrep..',
  '25RST-231': 'Critic..',
};

export function shortLabel(code: string, subject: string): string {
  return SHORT_LABELS[code] ?? `${subject.slice(0, 6)}..`;
}

/**
 * Fallback credits (identical to the seed's marks.credits). Used only if a
 * subject has no credit entry in the seed — the seed is the source of truth.
 * Verified values come from the official CU BE CSE (Full Stack) Semester 3
 * curriculum (cuchd.in); the remaining values are confirmed from the user's
 * attendance app screenshots (13 Nov 2026). All 10 are verified.
 */
export const DEFAULT_CREDITS: Record<string, SubjectCredits> = {
  '25SMT-236': {
    credits: 4,
    verified: true,
    note: 'Official CU Semester 3 curriculum: Probability and Statistics, 3-1-0, 4 credits.',
  },
  '25CST-238': {
    credits: 3,
    verified: true,
    note: 'Course verified in the official curriculum as 25CST-231 Computer Organization and Architecture (3-0-0, 3 credits); code 25CST-238 is as shown in CUIMS.',
  },
  '25TDT-212': {
    credits: 1,
    verified: true,
    note: 'Confirmed 1 credit from the user\'s attendance app screenshot (13 Nov 2026). Corrects the earlier curriculum-based value of 2.',
  },
  '25CSH-232': {
    credits: 4,
    verified: true,
    note: 'Official CU Semester 3 curriculum: Advanced Data Structures and Algorithms, 3-0-2, 4 credits.',
  },
  '25CSH-236': {
    credits: 4,
    verified: true,
    note: 'Confirmed 4 credits from the user\'s attendance app screenshot (13 Nov 2026). Was previously assumed; now verified.',
  },
  '25CSH-235': {
    credits: 2,
    verified: true,
    note: 'Official CU Semester 3 curriculum: Object Oriented Programming using JAVA, 1-0-2, 2 credits.',
  },
  '25CSH-247': {
    credits: 4,
    verified: true,
    note: 'Course verified in the official curriculum as 25CSH-233 Agile Development Methodologies (3-0-2, 4 credits); code 25CSH-247 is as shown in CUIMS.',
  },
  '25UCT-296': {
    credits: 2,
    verified: true,
    note: 'Official CU Semester 3 curriculum: Universal Human Values, Ethics and Life Skills-2, 0-1-0-4, 2 credits.',
  },
  '25INT-221': {
    credits: 1,
    verified: true,
    note: 'Confirmed 1 credit from the user\'s attendance app screenshot (13 Nov 2026). Corrects the earlier assumed value of 2.',
  },
  '25RST-231': {
    credits: 1,
    verified: true,
    note: 'Confirmed 1 credit from the user\'s attendance app screenshot (13 Nov 2026). Corrects the earlier assumed value of 2.',
  },
};

export function creditsFor(
  marks: MarksSnapshot | undefined,
  code: string,
): SubjectCredits {
  return (
    marks?.credits?.[code] ??
    DEFAULT_CREDITS[code] ?? {
      credits: 3,
      verified: false,
      note: 'Default 3 credits — no credit info available for this subject; edit in the app if wrong.',
    }
  );
}

/* ---------------- Per-subject analysis ---------------- */

export interface SubjectAnalysis {
  code: string;
  subject: string;
  obtained: number;
  total: number;
  pct: number;
  examCount: number;
  grade: GradeBand;
  credits: number;
  creditVerified: boolean;
  creditNote?: string;
  weighted: number;
}

export function analyzeSubjects(
  marks: MarksSnapshot,
  creditOverrides: Record<string, number> = {},
): SubjectAnalysis[] {
  return marks.subjects.map((s) => {
    // ABSENT components (obtained null) are excluded from totals and
    // percentages — they count as neither earned nor lost marks.
    const counted = s.marks.filter((m) => m.obtained != null);
    const obtained = counted.reduce((n, m) => n + (m.obtained ?? 0), 0);
    const total = counted.reduce((n, m) => n + m.max, 0);
    const pct = total > 0 ? (100 * obtained) / total : 0;
    const grade = gradeForPct(pct);
    const base = creditsFor(marks, s.code);
    const credits = creditOverrides[s.code] ?? base.credits;
    return {
      code: s.code,
      subject: s.subject,
      obtained,
      total,
      pct,
      examCount: s.marks.length,
      grade,
      credits,
      creditVerified: base.verified,
      creditNote: base.note,
      weighted: grade.points * credits,
    };
  });
}

export function computeSgpa(analyses: SubjectAnalysis[]): {
  sgpa: number;
  totalCredits: number;
  totalPoints: number;
  band: string;
} {
  const totalCredits = analyses.reduce((n, a) => n + a.credits, 0);
  const totalPoints = analyses.reduce((n, a) => n + a.weighted, 0);
  const sgpa = totalCredits > 0 ? totalPoints / totalCredits : 0;
  return { sgpa, totalCredits, totalPoints, band: sgpaBand(sgpa) };
}

export function overallAverage(analyses: SubjectAnalysis[]): number {
  if (analyses.length === 0) return 0;
  return analyses.reduce((n, a) => n + a.pct, 0) / analyses.length;
}

/* ---------------- Theory internal marks (out of 40) ----------------
 * Formula (CU theory calculator):
 *   internal = MST-1/2 + MST-2/2 + Assignment + Quiz + SurpriseTest/3 + Attendance
 *   Maxes: MST-1 20 · MST-2 20 · Assignment 10 · Quiz 4 · Surprise Test 12 · Attendance 2
 * Mapping from CUIMS components (shown in the UI):
 *   MST-1 / MST-2 (out of 20) → halved
 *   Assignment / Assignment Mark (out of 12) → scaled to 10
 *   Surprise Test / Quiz (out of 12) → scaled to 4 (Quiz slot)
 *   Case Study / Course Project (out of 20) → scaled to 12, then ÷ 3 (Surprise Test slot)
 *   Attendance is NOT in CUIMS → 0/2, shown as missing.
 * Practical components are kept separate: the theory formula covers the
 * theory part of hybrid subjects only.
 */

export interface TheoryRow {
  label: string;
  detail: string;
  obtained: number;
  max: number;
  posted: boolean;
}

export interface TheoryInternal {
  /** False when the subject has no theory-pattern components at all. */
  applicable: boolean;
  rows: TheoryRow[];
  total: number;
  postedSlots: number;
  practical: {
    obtained: number;
    total: number;
    pct: number;
    items: MarkComponent[];
  } | null;
  unmapped: MarkComponent[];
}

const lower = (s: string) => s.toLowerCase();

function findComponent(
  subject: SubjectMarks,
  pred: (name: string) => boolean,
): MarkComponent | undefined {
  // ABSENT components (obtained null) never map into the theory formula —
  // they fall through to `unmapped` and render as ABSENT.
  for (const m of subject.marks) {
    if (m.obtained != null && pred(lower(m.exam))) return m;
  }
  return undefined;
}

export function theoryInternal(subject: SubjectMarks): TheoryInternal {
  const mst1 = findComponent(subject, (n) =>
    n.startsWith('mid-semester test-1'),
  );
  const mst2 = findComponent(subject, (n) =>
    n.startsWith('mid-semester test-2'),
  );
  const asg = findComponent(
    subject,
    (n) =>
      n === 'assignment' ||
      n === 'assignment mark' ||
      n === 'assignment marks',
  );
  const quiz = findComponent(subject, (n) => n.includes('surprise test'));
  const cs = findComponent(
    subject,
    (n) => n.includes('case study') || n.includes('course project'),
  );
  const practicalItems = subject.marks.filter(
    (m) => m.obtained != null && lower(m.exam).includes('practical'),
  );
  const used = new Set(
    [mst1, mst2, asg, quiz, cs, ...practicalItems].filter(
      (m): m is MarkComponent => Boolean(m),
    ),
  );
  const unmapped = subject.marks.filter((m) => !used.has(m));
  const applicable = Boolean(mst1 || mst2 || asg || quiz || cs);

  const rows: TheoryRow[] = [
    {
      label: 'MST-1 (halved)',
      detail:
        mst1?.obtained != null
          ? `${mst1.exam}: ${mst1.obtained}/${mst1.max} ÷ 2`
          : 'Not posted in CUIMS yet',
      obtained: (mst1?.obtained ?? 0) / 2,
      max: 10,
      posted: mst1?.obtained != null,
    },
    {
      label: 'MST-2 (halved)',
      detail:
        mst2?.obtained != null
          ? `${mst2.exam}: ${mst2.obtained}/${mst2.max} ÷ 2`
          : 'Not posted in CUIMS yet',
      obtained: (mst2?.obtained ?? 0) / 2,
      max: 10,
      posted: mst2?.obtained != null,
    },
    {
      label: 'Assignment (scaled to 10)',
      detail:
        asg?.obtained != null
          ? `${asg.exam}: ${asg.obtained}/${asg.max} × 10/${asg.max}`
          : 'Not posted in CUIMS yet',
      obtained: asg ? ((asg.obtained ?? 0) * 10) / asg.max : 0,
      max: 10,
      posted: asg?.obtained != null,
    },
    {
      label: 'Quiz (scaled to 4)',
      detail:
        quiz?.obtained != null
          ? `${quiz.exam}: ${quiz.obtained}/${quiz.max} × 4/${quiz.max}`
          : 'Not posted in CUIMS yet',
      obtained: quiz ? ((quiz.obtained ?? 0) * 4) / quiz.max : 0,
      max: 4,
      posted: quiz?.obtained != null,
    },
    {
      label: 'Surprise Test (scaled to 4)',
      detail:
        cs?.obtained != null
          ? `${cs.exam}: ${cs.obtained}/${cs.max} → out of 12 → ÷ 3`
          : 'Not posted in CUIMS yet',
      obtained: cs ? (((cs.obtained ?? 0) * 12) / cs.max / 3) : 0,
      max: 4,
      posted: cs?.obtained != null,
    },
    {
      label: 'Attendance',
      detail: 'Not in CUIMS — shown as 0/2 (missing, not zero marks earned)',
      obtained: 0,
      max: 2,
      posted: false,
    },
  ];

  const total = rows.reduce((n, r) => n + r.obtained, 0);
  const postedSlots = rows.filter((r) => r.posted).length;
  const practical =
    practicalItems.length > 0
      ? {
          obtained: practicalItems.reduce((n, m) => n + (m.obtained ?? 0), 0),
          total: practicalItems.reduce((n, m) => n + m.max, 0),
          pct:
            practicalItems.reduce((n, m) => n + m.max, 0) > 0
              ? (100 *
                  practicalItems.reduce((n, m) => n + (m.obtained ?? 0), 0)) /
                practicalItems.reduce((n, m) => n + m.max, 0)
              : 0,
          items: practicalItems,
        }
      : null;

  return { applicable, rows, total, postedSlots, practical, unmapped };
}

/* ---------------- Focus analysis ---------------- */

export interface WeakComponent {
  code: string;
  subject: string;
  exam: string;
  obtained: number;
  max: number;
  pct: number;
}

export function focusAnalysis(
  analyses: SubjectAnalysis[],
  subjects: SubjectMarks[],
): {
  weakest: SubjectAnalysis[];
  strongest: SubjectAnalysis[];
  weakComponents: WeakComponent[];
} {
  const weakest = [...analyses].sort((a, b) => a.pct - b.pct).slice(0, 3);
  const strongest = [...analyses].sort((a, b) => b.pct - a.pct).slice(0, 3);
  const weakComponents: WeakComponent[] = [];
  for (const s of subjects) {
    for (const m of s.marks) {
      // ABSENT components are not scored components — skip, never NaN.
      if (m.obtained == null) continue;
      const pct = m.max > 0 ? (100 * m.obtained) / m.max : 0;
      if (pct < 70) {
        weakComponents.push({
          code: s.code,
          subject: s.subject,
          exam: m.exam,
          obtained: m.obtained,
          max: m.max,
          pct,
        });
      }
    }
  }
  weakComponents.sort((a, b) => a.pct - b.pct);
  return { weakest, strongest, weakComponents };
}

/** One-decimal formatting used across the analytics UI. */
export function fmt1(n: number): string {
  return n.toFixed(1);
}

export function fmt2(n: number): string {
  return n.toFixed(2);
}
