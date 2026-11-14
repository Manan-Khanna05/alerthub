import type { SubjectAnalysis } from '../lib/analytics';
import { fmt1, shortLabel } from '../lib/analytics';

interface RadarChartProps {
  analyses: SubjectAnalysis[];
  average: number;
  selectedCode: string | null;
  onSelect: (code: string) => void;
}

/**
 * Performance radar: one axis per subject, showing that subject's overall %
 * (obtained / total across its components). Rings at 25 / 50 / 75 / 100%.
 * Tap or click a point to see that subject's detail below the chart.
 * Colours come from CSS variables so it works in light and dark themes.
 */
export function RadarChart({
  analyses,
  average,
  selectedCode,
  onSelect,
}: RadarChartProps) {
  const size = 400;
  const cx = 200;
  const cy = 208;
  const R = 122;
  const n = analyses.length;
  if (n === 0) return null;

  const angleFor = (i: number) => (Math.PI * 2 * i) / n - Math.PI / 2;
  const pointFor = (i: number, pct: number) => {
    const r = (R * Math.min(100, Math.max(0, pct))) / 100;
    const a = angleFor(i);
    return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
  };
  const labelFor = (i: number) => {
    const a = angleFor(i);
    const r = R + 26;
    return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
  };
  const ringPoints = (pct: number) =>
    analyses
      .map((_, i) => {
        const p = pointFor(i, pct);
        return `${p.x.toFixed(1)},${p.y.toFixed(1)}`;
      })
      .join(' ');
  const polygon = analyses
    .map((a, i) => {
      const p = pointFor(i, a.pct);
      return `${p.x.toFixed(1)},${p.y.toFixed(1)}`;
    })
    .join(' ');

  return (
    <svg
      viewBox={`0 0 ${size} 400`}
      width="100%"
      role="img"
      aria-label={`Performance radar. Overall average ${fmt1(average)} percent across ${n} subjects.`}
      style={{ display: 'block', maxWidth: 480, margin: '0 auto' }}
    >
      {/* Grid rings */}
      {[25, 50, 75, 100].map((pct) => (
        <polygon
          key={pct}
          points={ringPoints(pct)}
          fill="none"
          stroke="var(--border-strong)"
          strokeWidth={pct === 100 ? 1.4 : 1}
          opacity={pct === 100 ? 0.9 : 0.55}
        />
      ))}
      {/* Axes */}
      {analyses.map((a, i) => {
        const p = pointFor(i, 100);
        return (
          <line
            key={a.code}
            x1={cx}
            y1={cy}
            x2={p.x}
            y2={p.y}
            stroke="var(--border-strong)"
            strokeWidth={1}
            opacity={0.55}
          />
        );
      })}
      {/* Subject polygon */}
      <polygon
        points={polygon}
        fill="var(--accent)"
        fillOpacity={0.16}
        stroke="var(--accent)"
        strokeWidth={2.2}
        strokeLinejoin="round"
      />
      {/* Axis labels: short name + % */}
      {analyses.map((a, i) => {
        const lp = labelFor(i);
        const selected = a.code === selectedCode;
        return (
          <g key={a.code}>
            <text
              x={lp.x}
              y={lp.y - 2}
              textAnchor="middle"
              fontSize={12.5}
              fontWeight={selected ? 700 : 600}
              fill={selected ? 'var(--accent-text)' : 'var(--text-2)'}
            >
              {shortLabel(a.code, a.subject)}
            </text>
            <text
              x={lp.x}
              y={lp.y + 13}
              textAnchor="middle"
              fontSize={12}
              fontWeight={selected ? 700 : 500}
              fill={selected ? 'var(--accent-text)' : 'var(--muted)'}
            >
              {fmt1(a.pct)}%
            </text>
          </g>
        );
      })}
      {/* Average in the centre */}
      <text
        x={cx}
        y={cy - 4}
        textAnchor="middle"
        fontSize={24}
        fontWeight={800}
        fill="var(--text)"
      >
        {fmt1(average)}%
      </text>
      <text
        x={cx}
        y={cy + 15}
        textAnchor="middle"
        fontSize={11.5}
        fill="var(--muted)"
      >
        avg
      </text>
      {/* Points (tap / click for details) */}
      {analyses.map((a, i) => {
        const p = pointFor(i, a.pct);
        const selected = a.code === selectedCode;
        return (
          <g
            key={a.code}
            role="button"
            tabIndex={0}
            aria-label={`${a.subject}: ${fmt1(a.pct)} percent, grade ${a.grade.letter}. Activate for details.`}
            onClick={() => onSelect(a.code)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onSelect(a.code);
              }
            }}
            style={{ cursor: 'pointer', outline: 'none' }}
          >
            <circle cx={p.x} cy={p.y} r={16} fill="transparent" />
            {selected ? (
              <circle
                cx={p.x}
                cy={p.y}
                r={10}
                fill="none"
                stroke="var(--accent)"
                strokeWidth={1.6}
                opacity={0.7}
              />
            ) : null}
            <circle
              cx={p.x}
              cy={p.y}
              r={selected ? 6.5 : 5}
              fill="var(--accent)"
              stroke="var(--card)"
              strokeWidth={1.6}
            />
          </g>
        );
      })}
    </svg>
  );
}
