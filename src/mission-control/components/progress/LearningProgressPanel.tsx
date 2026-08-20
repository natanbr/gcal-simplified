// ============================================================
// Learning Progress — parent-facing tab in the settings overlay
// Answers "is the practice helping, and what is hard?" from the
// skillProgress slice. Charts/callouts read AT-LEVEL numbers
// only, so stretch questions doing their job never read as a
// reading crisis. Mounts only while the tab is open — zero idle
// cost, no timers.
// ⚠️  Internal to src/mission-control/ only.
// ============================================================

import type { ReactNode } from 'react';
import { useMCState } from '../../store/useMCStore';
import { getLocalDateString } from '../../store/behaviorSync';
import {
    dailyVolume,
    hardestWords,
    levelUpRows,
    momentumSeries,
    needsWork,
    perGameTotals,
    shiftDate,
    weeklyAccuracy,
} from '../../skills/progressSelectors';
import { READING_SKILL_IDS, type ReadingSkillId } from '../../skills/types';
import { AccuracyChart, MomentumChart, SERIES_COLORS, VolumeChart } from './ProgressCharts';

const SKILL_LABELS: Record<ReadingSkillId, string> = {
    'read-word-pic': 'word → picture',
    'read-pic-word': 'picture → word',
    'read-missing-letter': 'missing letter',
};

function Panel({ title, sub, children }: { title: string; sub: string; children: ReactNode }) {
    return (
        <div className="mc-panel" style={{ padding: '14px 16px 12px', minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 900, color: 'var(--mc-text)' }}>{title}</div>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--mc-text-muted)', marginBottom: 8 }}>{sub}</div>
            {children}
        </div>
    );
}

function SparseNote({ children }: { children: ReactNode }) {
    return (
        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--mc-text-muted)', padding: '18px 4px' }}>
            {children}
        </div>
    );
}

export function LearningProgressPanel() {
    const { skillProgress } = useMCState();
    const today = getLocalDateString();
    const since60 = shiftDate(today, -59);

    const momentum = momentumSeries(skillProgress, since60);
    const levelUps = levelUpRows(skillProgress.levelHistory);
    // Markers outside the 60-day window would pin to the first visible point
    // and draw on the wrong day — filter them out.
    const momentumMarkers = levelUps
        .filter(row => row.date >= since60)
        .map(row => ({ date: row.date, level: row.level, up: row.level > row.fromLevel }));
    const accuracy = READING_SKILL_IDS.map(skill =>
        weeklyAccuracy(skillProgress.days[skill] ?? [], today));
    const anyAccuracy = accuracy.some(series => series.some(p => p.accuracy !== null));
    const volume = dailyVolume(skillProgress, today);
    const recentVolume = volume.some(d => d.reading + d.math > 0);
    const games = perGameTotals(skillProgress);
    const words = hardestWords(skillProgress.missedWords);
    const callout = needsWork(skillProgress, shiftDate(today, -6));
    const hasAnyPractice = Object.values(skillProgress.days).some(buckets => buckets.length > 0);

    if (!hasAnyPractice) {
        return (
            <div style={{ padding: 24, textAlign: 'center' }}>
                <div style={{ fontSize: 40 }}>📖</div>
                <div style={{ fontSize: 15, fontWeight: 900, color: 'var(--mc-text)', marginTop: 6 }}>
                    No practice yet
                </div>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--mc-text-muted)', marginTop: 4, lineHeight: 1.5 }}>
                    Reading and math questions live inside the Quick Games.<br />
                    Charts appear here after the first game session.
                </div>
            </div>
        );
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 }}>
                <span style={{ fontSize: 15, fontWeight: 900, color: 'var(--mc-text)' }}>📈 Learning Progress</span>
                <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--mc-text-muted)' }}>
                    reading level L{skillProgress.readingLevel} · last 60 days · parent view (hold the 📈 tab to open)
                </span>
            </div>

            {callout && (
                <div style={{
                    background: 'rgba(255,179,71,0.14)',
                    border: '1.5px solid rgba(255,179,71,0.45)',
                    borderRadius: 14,
                    padding: '10px 14px',
                    display: 'flex',
                    gap: 10,
                    alignItems: 'center',
                    flexWrap: 'wrap',
                }}>
                    <span style={{
                        background: 'var(--mc-amber)', color: 'var(--mc-text)', fontWeight: 900,
                        borderRadius: 999, padding: '2px 10px', fontSize: 10, letterSpacing: '0.06em',
                    }}>
                        NEEDS WORK
                    </span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--mc-text)' }}>
                        <b>{SKILL_LABELS[callout.skill]}</b> is the weakest skill this week
                        ({Math.round(callout.accuracy * 100)}% first-try) — the quiz already serves it more often.
                    </span>
                </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(270px, 1fr))', gap: 12 }}>
                <Panel title="Reading momentum" sub="daily ups & downs — enough ups trigger a level-up ▲">
                    {momentum.length >= 1 ? (
                        <>
                            <MomentumChart points={momentum} markers={momentumMarkers} />
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginTop: 4 }}>
                                {levelUps.length === 0 && (
                                    <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--mc-text-muted)' }}>
                                        no level changes yet
                                    </span>
                                )}
                                {levelUps.slice(0, 3).map(row => (
                                    <span key={`${row.date}-${row.level}`} style={{ fontSize: 10, fontWeight: 700, color: 'var(--mc-text-muted)' }}>
                                        {row.level > row.fromLevel ? '▲' : '▼'} L{row.level} · {row.date}
                                        {row.daysAtPrev !== null && <> · <b style={{ color: 'var(--mc-text)' }}>{row.daysAtPrev} days at L{row.fromLevel}</b></>}
                                        {' '}· {row.correct}/{row.attempts} first-try
                                    </span>
                                ))}
                            </div>
                        </>
                    ) : (
                        <SparseNote>Not enough reading answers yet — the line starts after a day of practice.</SparseNote>
                    )}
                </Panel>

                <Panel title="First-try accuracy" sub="weekly, per reading skill · at-level questions only">
                    {anyAccuracy ? (
                        <>
                            <AccuracyChart series={accuracy} />
                            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 4 }}>
                                {READING_SKILL_IDS.map((skill, i) => (
                                    <span key={skill} style={{ fontSize: 10, fontWeight: 800, color: 'var(--mc-text-muted)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                        <span style={{ width: 9, height: 9, borderRadius: 3, background: SERIES_COLORS[i], display: 'inline-block' }} />
                                        {SKILL_LABELS[skill]}
                                    </span>
                                ))}
                            </div>
                        </>
                    ) : (
                        <SparseNote>Accuracy lines appear after the first week of reading practice.</SparseNote>
                    )}
                </Panel>

                <Panel title="Practice volume" sub="questions per day, last 14 days">
                    {!recentVolume && (
                        <SparseNote>No questions in the last two weeks.</SparseNote>
                    )}
                    <VolumeChart days={volume} />
                    <div style={{ display: 'flex', gap: 12, marginTop: 4 }}>
                        <span style={{ fontSize: 10, fontWeight: 800, color: 'var(--mc-text-muted)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                            <span style={{ width: 9, height: 9, borderRadius: 3, background: 'var(--mc-chart-violet)', display: 'inline-block' }} />
                            reading
                        </span>
                        <span style={{ fontSize: 10, fontWeight: 800, color: 'var(--mc-text-muted)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                            <span style={{ width: 9, height: 9, borderRadius: 3, background: 'var(--mc-purple)', display: 'inline-block' }} />
                            math
                        </span>
                    </div>
                </Panel>

                <Panel title="Hardest words" sub="most first-try misses — worth practicing together">
                    {words.length > 0 ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                            {words.map(({ word, misses }) => (
                                <div key={word} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, fontWeight: 800 }}>
                                    <span style={{ color: 'var(--mc-text)', letterSpacing: '0.05em' }}>{word}</span>
                                    <span style={{ color: 'var(--mc-text-muted)', fontVariantNumeric: 'tabular-nums' }}>{misses} ✗</span>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <SparseNote>No missed words recorded yet.</SparseNote>
                    )}
                </Panel>

                <Panel title="Where practice happens" sub="questions per game, all time">
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {(['snake', 'blocks', 'fruits'] as const).map(game => {
                            const max = Math.max(1, ...Object.values(games));
                            const labels = { snake: '🐍 snake', blocks: '🧱 blocks', fruits: '🍉 fruits' };
                            return (
                                <div key={game} style={{ display: 'grid', gridTemplateColumns: '76px 1fr 40px', alignItems: 'center', gap: 8 }}>
                                    <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--mc-text-muted)' }}>{labels[game]}</span>
                                    <div style={{ height: 12, borderRadius: 5, background: 'rgba(130,120,200,0.12)', overflow: 'hidden' }}>
                                        <div style={{ width: `${(games[game] / max) * 100}%`, height: '100%', borderRadius: 5, background: 'var(--mc-chart-violet)' }} />
                                    </div>
                                    <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--mc-text-muted)', fontVariantNumeric: 'tabular-nums', textAlign: 'right' }}>{games[game]}</span>
                                </div>
                            );
                        })}
                    </div>
                </Panel>
            </div>
        </div>
    );
}

