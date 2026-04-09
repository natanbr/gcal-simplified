import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { format } from 'date-fns';
import { parseSafe } from '../utils/dateUtils';
import type { DiveWindow, MarineConditionsSnapshot, ActivityProfile } from '../types';
import { getQLevel } from '../hooks/useSpearfishingWindows';

interface Props {
    window: DiveWindow | null;
    snapshot: MarineConditionsSnapshot;
    onClose: () => void;
    locationName: string;
    activity?: ActivityProfile;
}

// ── helpers ───────────────────────────────────────────────────────────────────

function windBeaufort(kn: number): string {
    if (kn < 1)  return 'Calm';
    if (kn < 7)  return 'Light breeze';
    if (kn < 14) return 'Gentle–moderate';
    if (kn < 22) return 'Fresh–strong';
    return 'Gale / Storm';
}
function currentRating(kn: number): { label: string; color: string } {
    if (kn < 0.2) return { label: 'Minimal — ideal entry', color: 'var(--mc-good)' };
    if (kn < 0.5) return { label: 'Low — comfortable',    color: 'var(--mc-good)' };
    if (kn < 1.0) return { label: 'Moderate — manageable',color: 'var(--mc-caution)' };
    return         { label: 'Strong — challenging',        color: 'var(--mc-danger)' };
}
function visibilityLabel(m?: number): string {
    if (!m) return '—';
    if (m >= 8000) return `${(m / 1000).toFixed(0)} km — Excellent`;
    if (m >= 5000) return `${(m / 1000).toFixed(1)} km — Good`;
    if (m >= 3000) return `${(m / 1000).toFixed(1)} km — Fair`;
    return `${(m / 1000).toFixed(1)} km — Poor`;
}
function visibilityColor(q?: 'GOOD' | 'FAIR' | 'POOR'): string {
    if (q === 'GOOD') return 'var(--mc-good)';
    if (q === 'FAIR') return 'var(--mc-caution)';
    return 'var(--mc-danger)';
}
function qLevelColor(level: string): string {
    switch (level) {
        case 'excellent':   return '#ffd700';
        case 'good':        return 'var(--mc-good)';
        case 'fair':        return 'var(--mc-caution)';
        case 'poor':        return '#ff7043';
        default:            return 'var(--mc-danger)';
    }
}

// ── Spearfishing insight cards derived from Q breakdown ─────────────────────

interface Insight {
    emoji: string;
    title: string;
    body: string;
    color: string;
}

function buildSpearfishingInsights(w: DiveWindow, snapshot: MarineConditionsSnapshot, endDate: Date): Insight[] {
    const bd = w.spearfishingBreakdown;
    const insights: Insight[] = [];

    // Moon phase
    if (bd?.fReasons.some(r => r.includes('Moon'))) {
        const label = bd.fReasons.find(r => r.includes('Moon')) ?? '';
        insights.push({
            emoji: label.includes('Full') ? '🌕' : '🌑',
            title: label.includes('Full') ? 'Full Moon — Fish Are More Active' : 'New Moon — Fish Are More Active',
            body: 'Tidal forces are strongest during new and full moons, stirring up bait fish and activating predator feeding cycles. Expect more movement and better hunting.',
            color: '#ffd700',
        });
    }

    // Swell — sickness warning
    if (snapshot.swellPeriod != null && snapshot.swellPeriod < 8) {
        const washy = snapshot.swellPeriod < 6;
        insights.push({
            emoji: '🌊',
            title: washy
                ? `Swell ${snapshot.swellPeriod.toFixed(0)}s — Rough Surface Conditions`
                : `Swell ${snapshot.swellPeriod.toFixed(0)}s — Acceptable but Choppy`,
            body: washy
                ? 'Short-period swell creates a "washing machine" surface. Expect elevated fatigue, seasickness risk, and reduced visibility near the seabed. Enter only if you are confident.'
                : 'Moderate swell period. Surface may be choppy. Monitor shore conditions before entry and conserve energy during surface swims.',
            color: washy ? 'var(--mc-danger)' : 'var(--mc-caution)',
        });
    }

    // Visibility insight from tide direction
    if (bd) {
        const floodPct = Math.round(bd.floodFraction * 100);
        const isFlood = bd.floodFraction > 0.55;
        const isEbb   = bd.floodFraction < 0.45;
        insights.push({
            emoji: '👁',
            title: isFlood
                ? `Visibility: Flood Tide (${floodPct}% rising) — Cleaner Water`
                : isEbb
                ? `Visibility: Ebb Tide (${100 - floodPct}% falling) — Reduced Clarity`
                : 'Visibility: Mixed Tide Direction',
            body: isFlood
                ? 'Incoming flood tide pushes cleaner, saltier water from offshore. Expect better underwater visibility and reduced sediment turbidity.'
                : isEbb
                ? 'Outgoing ebb tide can carry sediment and runoff from shore, reducing clarity. Expect lower visibility, especially near river mouths and estuaries.'
                : 'Tide is near slack throughout the window. Visibility should be stable but may vary by site.',
            color: isFlood ? 'var(--mc-good)' : isEbb ? 'var(--mc-caution)' : 'var(--mc-text-muted)',
        });
    }

    // Golden hour
    if (bd?.fReasons.some(r => r.includes('Golden'))) {
        insights.push({
            emoji: '🌅',
            title: 'Golden Hour — Peak Feeding Time',
            body: 'Within 1 hour of sunrise or sunset. Low angle light activates ambush predators. Ideal time for pelagic species like snapper, kahawai, and kingfish.',
            color: '#ffb95f',
        });
    }

    // Exit warning — compute how long they have
    const minutesLeft = Math.round((endDate.getTime() - Date.now()) / 60_000);
    if (minutesLeft > 0 && minutesLeft < 90) {
        insights.push({
            emoji: '⏰',
            title: `Exit by ${format(endDate, 'HH:mm')} — ${minutesLeft} min remaining`,
            body: `Current speed will increase after ${format(endDate, 'HH:mm')}. You must be out of the water before this time. Surface tow floats and plan your exit route now.`,
            color: minutesLeft < 30 ? 'var(--mc-danger)' : 'var(--mc-caution)',
        });
    }

    return insights;
}

// ── component ─────────────────────────────────────────────────────────────────

export const DiveWindowDetailPanel: React.FC<Props> = ({ window: w, snapshot, onClose, locationName, activity = 'diving' }) => {
    const slackDate = parseSafe(w?.slackTime);
    const startDate = parseSafe(w?.windowStart);
    const endDate   = parseSafe(w?.windowEnd);
    const cr        = currentRating(w?.currentSpeed ?? 0);

    const isSpearfishing = activity === 'spearfishing';

    // Q level for spearfishing
    const qData = isSpearfishing && w?.spearfishingBreakdown
        ? getQLevel(w.spearfishingBreakdown.qRaw)
        : null;

    const insights = w && isSpearfishing ? buildSpearfishingInsights(w, snapshot, endDate) : [];

    return (
        <AnimatePresence>
            {w && (
                <>
                    {/* Backdrop */}
                    <motion.div
                        key="detail-backdrop"
                        className="marine-guide-overlay"
                        data-testid="detail-overlay"
                        onClick={onClose}
                        style={{ zIndex: 210 }}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.2 }}
                    />

                    {/* Panel — slides from LEFT */}
                    <motion.div
                        key="detail-panel"
                        className="marine-detail-modal"
                        data-testid="dive-detail-panel"
                        initial={{ opacity: 0, x: -60 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -60 }}
                        transition={{ type: 'spring', damping: 32, stiffness: 380, mass: 0.7 }}
                    >
                        {/* ── Header ───────────────────────────────────────── */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
                            <div>
                                <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--mc-cyan)', marginBottom: 6 }}>
                                    {isSpearfishing ? '🎯 Spearfishing Window' : '🤿 Dive Window Details'}
                                </div>
                                <div style={{ fontSize: 26, fontWeight: 800, color: 'var(--mc-text)', fontFamily: 'Space Grotesk, monospace', lineHeight: 1, marginBottom: 4 }}>
                                    {format(startDate, 'HH:mm')} – {format(endDate, 'HH:mm')}
                                </div>
                                <div style={{ fontSize: 13, color: 'var(--mc-text-muted)' }}>
                                    {format(slackDate, 'EEEE, MMM d')} · {locationName}
                                </div>
                            </div>
                            <button
                                data-testid="detail-close-btn"
                                onClick={onClose}
                                style={{
                                    width: 36, height: 36, borderRadius: '50%',
                                    border: '1px solid var(--mc-border-bright)',
                                    background: 'rgba(68,216,241,0.06)',
                                    color: 'var(--mc-text-muted)',
                                    cursor: 'pointer', fontSize: 18,
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    flexShrink: 0, marginTop: 2,
                                    transition: 'background 150ms ease',
                                }}
                            >✕</button>
                        </div>

                        {/* ── At a glance chips ────────────────────────────── */}
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 20 }}>
                            <Chip icon="⏱" label={`${w.duration} min window`} />
                            <Chip icon="⚡" label={`${w.currentSpeed.toFixed(2)} kn at slack`} color={cr.color} />
                            <Chip icon="🌊" label={`${w.tideHeight.toFixed(1)} m ${w.isHighTide ? '↑ High' : '↓ Low'} Tide`} color={w.isHighTide ? 'var(--mc-blue)' : 'var(--mc-teal)'} />
                            {w.isDaylight
                                ? <Chip icon="☀️" label="Daylight" color="var(--mc-good)" />
                                : <Chip icon="🌙" label="Night" color="var(--mc-text-dim)" />}
                        </div>

                        {/* ── Shot / Dive quality ──────────────────────────── */}
                        {isSpearfishing && qData ? (
                            <div className="marine-card p-4" style={{ marginBottom: 20, padding: '14px 16px', borderColor: `${qLevelColor(qData.level)}33` }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                                    <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--mc-text-dim)' }}>
                                        Shot Quality
                                    </span>
                                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                                        <span style={{ fontSize: 11, color: 'var(--mc-text-dim)', fontFamily: 'Space Grotesk, monospace' }}>
                                            Q={w.spearfishingBreakdown!.qRaw >= 0 ? '+' : ''}{w.spearfishingBreakdown!.qRaw.toFixed(1)}
                                        </span>
                                        <span style={{ fontSize: 18, fontWeight: 800, color: qLevelColor(qData.level), letterSpacing: '0.04em' }}>
                                            {qData.level.toUpperCase()}
                                        </span>
                                    </div>
                                </div>
                                <div style={{ height: 5, background: 'rgba(255,255,255,0.07)', borderRadius: 99, overflow: 'hidden', marginBottom: 10 }}>
                                    <div style={{ height: '100%', width: `${w.activityScore.spearfishing}%`, background: qLevelColor(qData.level), borderRadius: 99, transition: 'width 0.5s ease' }} />
                                </div>
                                <div style={{ fontSize: 12, color: 'var(--mc-text-dim)', lineHeight: 1.6, fontStyle: 'italic' }}>
                                    {qData.description}
                                </div>
                            </div>
                        ) : (
                            <DiveQualityCard score={w.activityScore.diving} />
                        )}

                        {/* ── Spearfishing insights ────────────────────────── */}
                        {insights.length > 0 && (
                            <div style={{ marginBottom: 20 }}>
                                <SectionLabel>🔍 Conditions at a Glance</SectionLabel>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                    {insights.map((ins, i) => (
                                        <InsightCard key={i} {...ins} />
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* ── Data grid ────────────────────────────────────── */}
                        <SectionLabel>📊 Conditions Detail</SectionLabel>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
                            {/* Timing */}
                            <DataCard title="⏱ Timing" fullWidth>
                                <DataRow label="Window" value={`${format(startDate, 'HH:mm')} – ${format(endDate, 'HH:mm')}`} mono />
                                <DataRow label="Slack at" value={format(slackDate, 'HH:mm')} mono />
                                <DataRow label="Duration" value={`${w.duration} min`} mono />
                            </DataCard>

                            {/* Current */}
                            <DataCard title="⚡ Tidal Current">
                                <DataRow label="Speed" value={`${w.currentSpeed.toFixed(2)} kn`} mono />
                                <DataRow label="Rating" value={cr.label} color={cr.color} />
                            </DataCard>

                            {/* Tide */}
                            <DataCard title="🌊 Tide">
                                <DataRow label="Height" value={`${w.tideHeight.toFixed(2)} m`} mono />
                                <DataRow label="Type" value={w.isHighTide ? 'High Tide' : 'Low Tide'} color={w.isHighTide ? 'var(--mc-blue)' : 'var(--mc-teal)'} />
                            </DataCard>

                            {/* Swell */}
                            {snapshot.swellHeight != null && (
                                <DataCard title="〰️ Swell">
                                    <DataRow label="Height" value={`${snapshot.swellHeight.toFixed(1)} m`} mono />
                                    {snapshot.swellPeriod && <DataRow label="Period" value={`${snapshot.swellPeriod.toFixed(0)} s`} mono color={snapshot.swellPeriod < 6 ? 'var(--mc-danger)' : snapshot.swellPeriod < 8 ? 'var(--mc-caution)' : 'var(--mc-good)'} />}
                                    {snapshot.swellDirection && <DataRow label="Direction" value={snapshot.swellDirection} />}
                                </DataCard>
                            )}

                            {/* Wind */}
                            {snapshot.windSpeed != null && (
                                <DataCard title="💨 Wind">
                                    <DataRow label="Speed" value={`${snapshot.windSpeed.toFixed(1)} kn`} mono />
                                    {snapshot.windGust && <DataRow label="Gusts" value={`${snapshot.windGust.toFixed(1)} kn`} mono />}
                                    <DataRow label="Feel" value={windBeaufort(snapshot.windSpeed)} color={snapshot.windSpeed < 14 ? 'var(--mc-good)' : 'var(--mc-caution)'} />
                                </DataCard>
                            )}

                            {/* Visibility */}
                            <DataCard title="👁 Visibility">
                                <DataRow
                                    label="Est."
                                    value={visibilityLabel(snapshot.visibilityEst)}
                                    color={visibilityColor(snapshot.visibilityQuality)}
                                />
                                {snapshot.waterTemp != null && <DataRow label="Water Temp" value={`${snapshot.waterTemp.toFixed(1)} °C`} mono />}
                                {snapshot.airTempC != null && <DataRow label="Air Temp" value={`${snapshot.airTempC.toFixed(1)} °C`} mono />}
                            </DataCard>
                        </div>

                        {/* Visibility explanation */}
                        <div style={{ marginBottom: 20, padding: '10px 12px', background: 'rgba(255,255,255,0.03)', borderRadius: 8, fontSize: 11, color: 'var(--mc-text-dim)', lineHeight: 1.6 }}>
                            Underwater visibility estimated from wind speed and swell height — not surface visibility.
                            Actual clarity depends on recent rain, plankton blooms, and site conditions.
                            {!w.isDaylight && (
                                <span style={{ color: 'var(--mc-danger)', display: 'block', marginTop: 4, fontWeight: 600 }}>
                                    🌙 Night conditions — visibility effectively zero without a dive light.
                                </span>
                            )}
                        </div>

                        {/* Safety footer */}
                        <div style={{ padding: '12px 14px', background: 'rgba(255,180,171,0.06)', border: '1px solid rgba(255,180,171,0.15)', borderRadius: 8, fontSize: 11, color: 'var(--mc-text-dim)', lineHeight: 1.6 }}>
                            ⚠️ Conditions are model forecasts. Always verify on-site. Dive within your training and experience.
                        </div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
};

// ── Sub-components ─────────────────────────────────────────────────────────────

const SectionLabel: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--mc-text-dim)', marginBottom: 10 }}>
        {children}
    </div>
);

const Chip: React.FC<{ icon: string; label: string; color?: string }> = ({ icon, label, color }) => (
    <div style={{
        display: 'inline-flex', alignItems: 'center', gap: 5,
        padding: '5px 10px', borderRadius: 99,
        background: 'rgba(255,255,255,0.05)',
        border: '1px solid rgba(255,255,255,0.1)',
        fontSize: 12, fontWeight: 600,
        color: color ?? 'var(--mc-text)',
    }}>
        <span style={{ fontSize: 13 }}>{icon}</span>
        {label}
    </div>
);

const InsightCard: React.FC<Insight> = ({ emoji, title, body, color }) => (
    <div style={{
        padding: '12px 14px',
        background: 'rgba(255,255,255,0.03)',
        borderRadius: 10,
        borderLeft: `3px solid ${color}`,
    }}>
        <div style={{ fontSize: 13, fontWeight: 700, color, marginBottom: 4 }}>
            {emoji} {title}
        </div>
        <div style={{ fontSize: 12, color: 'var(--mc-text-muted)', lineHeight: 1.6 }}>
            {body}
        </div>
    </div>
);

const DataCard: React.FC<{ title: string; children: React.ReactNode; fullWidth?: boolean }> = ({ title, children, fullWidth }) => (
    <div
        className="marine-card"
        style={{
            padding: '12px 14px',
            gridColumn: fullWidth ? '1 / -1' : undefined,
        }}
    >
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--mc-text-dim)', marginBottom: 8 }}>
            {title}
        </div>
        {children}
    </div>
);

const DataRow: React.FC<{ label: string; value: string; color?: string; mono?: boolean }> = ({ label, value, color, mono }) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
        <span style={{ fontSize: 12, color: 'var(--mc-text-dim)' }}>{label}</span>
        <span style={{
            fontSize: 14,
            fontWeight: 700,
            color: color ?? 'var(--mc-text)',
            fontFamily: mono ? 'Space Grotesk, monospace' : 'Inter, system-ui',
        }}>{value}</span>
    </div>
);

function DiveQualityCard({ score }: { score: number }) {
    const color = score >= 70 ? 'var(--mc-good)' : score >= 40 ? 'var(--mc-caution)' : 'var(--mc-danger)';
    const label = score >= 70 ? 'GOOD' : score >= 40 ? 'FAIR' : 'POOR';
    return (
        <div className="marine-card p-4" style={{ marginBottom: 20, padding: '14px 16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--mc-text-dim)' }}>
                    Dive Quality
                </span>
                <span style={{ fontSize: 18, fontWeight: 800, color, letterSpacing: '0.04em' }}>{label}</span>
            </div>
            <div style={{ height: 5, background: 'rgba(255,255,255,0.07)', borderRadius: 99, overflow: 'hidden', marginBottom: 10 }}>
                <div style={{ height: '100%', width: `${score}%`, background: color, borderRadius: 99, transition: 'width 0.5s ease' }} />
            </div>
            <div style={{ fontSize: 12, color: 'var(--mc-text-dim)', lineHeight: 1.6 }}>
                Based on current speed and tide position at peak slack. Higher high tide + lower current = better visibility and marine life activity.
            </div>
        </div>
    );
}
