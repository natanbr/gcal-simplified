// ============================================================
// Mission Control — Mood Gauge Card
// A child-friendly half-circle gauge with 5 hard sections.
// Center = neutral, left = negative, right = positive.
// READ-ONLY: mood can only be changed from the remote app.
// ⚠️  Internal to src/mission-control/ only.
// ============================================================

import { motion } from 'framer-motion';
import { useMCState } from '../store/useMCStore.tsx';
import { MOOD_TOKEN } from '../moodTokenConfig';

const MAX_MOOD_TOKENS = 5;

const MOOD_LEVELS = [
    { level: -2, emoji: '😡', label: 'Angry', color: '#DC2626' },
    { level: -1, emoji: '🙁', label: 'Sad', color: '#F97316' },
    { level: 0,  emoji: '😐', label: 'Neutral', color: '#EAB308' },
    { level: 1,  emoji: '🙂', label: 'Happy', color: '#22C55E' },
    { level: 2,  emoji: '😃', label: 'Great', color: '#15803D' },
] as const;

function getMoodData(level: number) {
    const clamped = Math.max(-2, Math.min(2, level));
    return MOOD_LEVELS.find(m => m.level === clamped) ?? MOOD_LEVELS[2];
}

function HalfCircleGauge({ level }: { level: number }) {
    const mood = getMoodData(level);
    const size = 170;
    const cx = size / 2;
    const cy = size / 2 + 4;
    const outerR = 72;
    const innerR = 44;
    const needleLen = outerR - 6;

    const sectionDeg = 180 / 5;
    const needleAngle = -180 + (level + 2) * sectionDeg + sectionDeg / 2;
    const needleRad = (needleAngle * Math.PI) / 180;
    const needleX = cx + needleLen * Math.cos(needleRad);
    const needleY = cy + needleLen * Math.sin(needleRad);

    function sectionPath(index: number): string {
        const startDeg = -180 + index * sectionDeg;
        const endDeg = startDeg + sectionDeg;
        const sRad = (startDeg * Math.PI) / 180;
        const eRad = (endDeg * Math.PI) / 180;

        const ox1 = cx + outerR * Math.cos(sRad);
        const oy1 = cy + outerR * Math.sin(sRad);
        const ox2 = cx + outerR * Math.cos(eRad);
        const oy2 = cy + outerR * Math.sin(eRad);
        const ix1 = cx + innerR * Math.cos(eRad);
        const iy1 = cy + innerR * Math.sin(eRad);
        const ix2 = cx + innerR * Math.cos(sRad);
        const iy2 = cy + innerR * Math.sin(sRad);

        return `M ${ox1} ${oy1} A ${outerR} ${outerR} 0 0 1 ${ox2} ${oy2} L ${ix1} ${iy1} A ${innerR} ${innerR} 0 0 0 ${ix2} ${iy2} Z`;
    }

    return (
        <div style={{ display: 'flex', justifyContent: 'center', position: 'relative' }}>
            <svg width={size} height={size / 2 + 14} viewBox={`0 0 ${size} ${size / 2 + 14}`}>
                {/* 5 hard sections */}
                {MOOD_LEVELS.map((m, i) => {
                    const isActive = m.level === level;
                    const isPast = (level >= 0 && m.level >= 0 && m.level <= level)
                        || (level < 0 && m.level <= 0 && m.level >= level)
                        || m.level === 0;
                    return (
                        <path
                            key={m.level}
                            d={sectionPath(i)}
                            fill={isPast || isActive ? m.color : `${m.color}15`}
                            stroke="rgba(255,255,255,0.9)"
                            strokeWidth={2}
                            opacity={isPast || isActive ? 1 : 0.5}
                        />
                    );
                })}

                {/* Needle (black) */}
                <motion.line
                    initial={false}
                    animate={{ x2: needleX, y2: needleY }}
                    transition={{ type: 'spring', stiffness: 150, damping: 18 }}
                    x1={cx}
                    y1={cy}
                    x2={needleX}
                    y2={needleY}
                    stroke="#1f2937"
                    strokeWidth={2.5}
                    strokeLinecap="round"
                />

                {/* Needle hub */}
                <circle cx={cx} cy={cy} r={4} fill="#1f2937" stroke="white" strokeWidth={1.5} />
            </svg>

            {/* Emoji centered on the needle hub */}
            <motion.div
                key={level}
                initial={{ scale: 0.6, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                style={{
                    position: 'absolute',
                    top: cy - 22,
                    left: '50%',
                    marginLeft: -22,
                    width: 44,
                    height: 44,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 42,
                    lineHeight: 1,
                    filter: `drop-shadow(0 1px 3px ${mood.color}44)`,
                    pointerEvents: 'none',
                }}
            >
                {mood.emoji}
            </motion.div>
        </div>
    );
}

function ProgressBar({ progress, level, delta }: { progress: number; level: number; delta: number }) {
    const mood = getMoodData(level);
    const clampedProgress = Math.max(0, Math.min(100, progress));

    // The per-minute accrual drip is tiny (< 1%); only surface deltas big
    // enough to read, so the label doesn't sit at a permanent "+0.0%".
    const deltaLabel = Math.abs(delta) >= 1
        ? `${delta > 0 ? '+' : ''}${delta.toFixed(1)}%`
        : null;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{
                    fontSize: 12,
                    fontWeight: 900,
                    color: 'var(--mc-text)',
                    fontFamily: 'monospace',
                }}>
                    {Math.round(clampedProgress)}%
                </div>
                {deltaLabel && (
                    <motion.div
                        key={delta}
                        initial={{ opacity: 0, y: 4 }}
                        animate={{ opacity: 1, y: 0 }}
                        style={{
                            fontSize: 10,
                            fontWeight: 900,
                            color: delta > 0 ? '#10B981' : '#EF4444',
                        }}
                    >
                        {deltaLabel}
                    </motion.div>
                )}
            </div>

            <div style={{
                height: 14,
                borderRadius: 7,
                background: 'rgba(167,139,250,0.08)',
                overflow: 'hidden',
                border: '1px solid rgba(167,139,250,0.12)',
            }}>
                <div
                    style={{
                        width: `${clampedProgress}%`,
                        height: '100%',
                        borderRadius: 6,
                        background: mood.color,
                        transition: 'width 0.6s ease, background 0.3s ease',
                    }}
                />
            </div>
        </div>
    );
}

function MoodTokenBank({ count }: { count: number }) {
    return (
        <div style={{
            display: 'flex',
            gap: 8,
            justifyContent: 'center',
            paddingTop: 8,
            borderTop: '1px solid rgba(167,139,250,0.1)',
        }}>
            {Array.from({ length: MAX_MOOD_TOKENS }).map((_, i) => (
                <motion.div
                    key={i}
                    initial={false}
                    animate={i < count ? { scale: 1, opacity: 1 } : { scale: 0.8, opacity: 0.3 }}
                    style={{
                        width: 28,
                        height: 28,
                        borderRadius: '50%',
                        background: i < count ? MOOD_TOKEN.filledGradient : MOOD_TOKEN.emptyBg,
                        border: i < count ? MOOD_TOKEN.filledBorder : MOOD_TOKEN.emptyBorder,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 14,
                        boxShadow: i < count ? MOOD_TOKEN.filledShadow : 'none',
                    }}
                >
                    {i < count ? MOOD_TOKEN.emoji : null}
                </motion.div>
            ))}
        </div>
    );
}

export function GameTokenPanel() {
    const { gameTokens, behaviorProgress, moodWind, behaviorDelta } = useMCState();

    return (
        <motion.div
            layout
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            style={{
                background: 'rgba(255,255,255,0.85)',
                border: '1.5px solid rgba(167,139,250,0.3)',
                borderRadius: 24,
                padding: '12px 16px',
                display: 'flex',
                flexDirection: 'column',
                gap: 6,
                boxShadow: 'var(--mc-depth-shadow)',
                position: 'relative',
                minWidth: 220,
                userSelect: 'none',
            }}
        >
            {/* Label */}
            <div style={{
                fontSize: 10,
                fontWeight: 900,
                color: 'var(--mc-text-dim)',
                textTransform: 'uppercase',
                letterSpacing: '0.1em',
                textAlign: 'center',
            }}>
                Mood Gauge
            </div>

            {/* Half-Circle Gauge (read-only) */}
            <HalfCircleGauge level={moodWind} />

            {/* Progress Bar */}
            <ProgressBar progress={behaviorProgress} level={moodWind} delta={behaviorDelta} />

            {/* Mood Token Bank */}
            <MoodTokenBank count={gameTokens} />
        </motion.div>
    );
}
