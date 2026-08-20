// ============================================================
// Learning Progress — hand-rolled SVG charts
// Small, static, token-colored (--mc-chart-*). No chart library:
// four tiny charts don't justify one, and the repo precedent is
// the GameTokenPanel gauge. SVG presentation attributes don't
// resolve var(), so colors are applied via the style prop.
// ⚠️  Internal to src/mission-control/ only.
// ============================================================

import type { MomentumPoint, VolumeDay, WeeklyAccuracyPoint } from '../../skills/progressSelectors';
import type { LevelHistoryEntry } from '../../skills/types';

const GRID = 'rgba(130,120,200,0.22)';
const W = 320;
const H = 140;
const PAD = { top: 14, right: 12, bottom: 16, left: 12 };

function x(index: number, count: number): number {
    if (count <= 1) return W / 2;
    return PAD.left + (index / (count - 1)) * (W - PAD.left - PAD.right);
}

function y(value: number, min: number, max: number): number {
    const span = max - min || 1;
    return H - PAD.bottom - ((value - min) / span) * (H - PAD.top - PAD.bottom);
}

/** The stock-style cumulative line with a ▲ marker per level-up. */
export function MomentumChart({ points, levelUps }: {
    points: MomentumPoint[];
    levelUps: readonly LevelHistoryEntry[];
}) {
    const min = Math.min(0, ...points.map(p => p.cum));
    const max = Math.max(1, ...points.map(p => p.cum));
    const coords = points.map((p, i) => `${x(i, points.length)},${y(p.cum, min, max)}`);

    const markers = levelUps
        .map(entry => {
            const index = points.findIndex(p => p.date >= entry.date);
            return index === -1 ? null : { index, level: entry.level };
        })
        .filter((m): m is { index: number; level: number } => m !== null);

    return (
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Reading momentum: cumulative daily net of first-try successes minus misses, with level-up markers">
            <line x1={PAD.left} y1={H - PAD.bottom} x2={W - PAD.right} y2={H - PAD.bottom} style={{ stroke: GRID }} strokeWidth={1} />
            {points.length >= 2 ? (
                <polyline
                    points={coords.join(' ')}
                    fill="none"
                    style={{ stroke: 'var(--mc-chart-violet)' }}
                    strokeWidth={2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                />
            ) : (
                points.map((p, i) => (
                    <circle key={p.date} cx={x(i, points.length)} cy={y(p.cum, min, max)} r={3.5} style={{ fill: 'var(--mc-chart-violet)' }} />
                ))
            )}
            {markers.map(marker => {
                const px = x(marker.index, points.length);
                const py = y(points[marker.index].cum, min, max);
                return (
                    <g key={`${marker.index}-${marker.level}`}>
                        <circle cx={px} cy={py} r={3.5} style={{ fill: 'var(--mc-chart-teal)' }} />
                        <text x={px} y={py - 8} textAnchor="middle" fontSize={9} fontWeight={800} style={{ fill: 'var(--mc-chart-teal)' }}>
                            ▲L{marker.level}
                        </text>
                    </g>
                );
            })}
        </svg>
    );
}

const SERIES_COLORS = ['var(--mc-chart-violet)', 'var(--mc-chart-teal)', 'var(--mc-chart-rust)'];

/** Weekly at-level first-try accuracy, one line per reading skill. */
export function AccuracyChart({ series }: { series: WeeklyAccuracyPoint[][] }) {
    const count = series[0]?.length ?? 0;
    return (
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Weekly first-try accuracy per reading skill">
            <line x1={PAD.left} y1={y(1, 0, 1)} x2={W - PAD.right} y2={y(1, 0, 1)} style={{ stroke: GRID }} strokeWidth={1} strokeDasharray="3 4" />
            <line x1={PAD.left} y1={H - PAD.bottom} x2={W - PAD.right} y2={H - PAD.bottom} style={{ stroke: GRID }} strokeWidth={1} />
            <text x={PAD.left} y={y(1, 0, 1) - 3} fontSize={8} style={{ fill: 'var(--mc-text-muted)' }}>100%</text>
            {series.map((points, s) => {
                const visible = points
                    .map((p, i) => ({ ...p, i }))
                    .filter(p => p.accuracy !== null);
                if (visible.length === 0) return null;
                const coords = visible.map(p => `${x(p.i, count)},${y(p.accuracy as number, 0, 1)}`);
                const last = visible[visible.length - 1];
                return (
                    <g key={s}>
                        {visible.length >= 2 ? (
                            <polyline points={coords.join(' ')} fill="none" style={{ stroke: SERIES_COLORS[s] }} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
                        ) : null}
                        <circle cx={x(last.i, count)} cy={y(last.accuracy as number, 0, 1)} r={3} style={{ fill: SERIES_COLORS[s] }} />
                    </g>
                );
            })}
        </svg>
    );
}

/** Daily stacked bars: reading (solid) + math (soft). */
export function VolumeChart({ days }: { days: VolumeDay[] }) {
    const max = Math.max(1, ...days.map(d => d.reading + d.math));
    const innerW = W - PAD.left - PAD.right;
    const barW = Math.max(4, Math.floor(innerW / days.length) - 4);
    const floor = H - PAD.bottom;
    const scale = (H - PAD.top - PAD.bottom) / max;
    return (
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Questions answered per day, reading versus math">
            <line x1={PAD.left} y1={floor} x2={W - PAD.right} y2={floor} style={{ stroke: GRID }} strokeWidth={1} />
            {days.map((day, i) => {
                const bx = PAD.left + (i / days.length) * innerW + 2;
                const readingH = day.reading * scale;
                const mathH = day.math * scale;
                return (
                    <g key={day.date}>
                        {readingH > 0 && (
                            <rect x={bx} y={floor - readingH} width={barW} height={readingH} rx={2} style={{ fill: 'var(--mc-chart-violet)' }} />
                        )}
                        {mathH > 0 && (
                            <rect x={bx} y={floor - readingH - mathH - (readingH > 0 ? 2 : 0)} width={barW} height={mathH} rx={2} style={{ fill: 'var(--mc-purple)' }} />
                        )}
                    </g>
                );
            })}
        </svg>
    );
}
