// ============================================================
// Mission Control — Mission Streak Shield card
// A Column 3 sibling of the Mood Gauge. Six segments, one per
// mission the child can still miss before the bank freezes.
//
// Colour carries the entire state: there is deliberately NO
// status caption ("shield is strong", "one left"), and
// ShieldPanel.test.tsx pins its absence with an exact-text
// assertion so it cannot creep back in.
//
// COMPACT ON PURPOSE. Column 3 carries four cards and `.mc-root`
// is `overflow: hidden`, so anything that does not fit is gone
// with no scrollbar to recover it — at 1366x768, the commonest
// laptop height, a 91px version of this card pushed the whole
// privilege row off-screen. The header is one row, not two, for
// that reason; keep it that way.
// ⚠️  Internal to src/mission-control/ only.
// ============================================================

import { motion } from 'framer-motion';
import { useMCState } from '../store/useMCStore.tsx';
import { SHIELD_SEGMENTS, shieldSegmentsLeft, shieldTier } from '../store/missionStreak';
import type { ShieldTier } from '../store/missionStreak';

/**
 * Segment fill per tier.
 *
 * These pastels are 1.4-2.5:1 against the card and against an empty segment —
 * BELOW the 3:1 non-text minimum, so hue alone does not reliably separate
 * filled from empty (a deuteranopic reader loses the green tier almost
 * entirely). The border on a filled segment is what actually carries the
 * boundary; colour is the tier signal on top of it.
 *
 * `broken` never paints (zero segments filled at six misses), but the map is
 * total so the lookup needs no fallback branch.
 */
const TIER_FILL: Record<ShieldTier, string> = {
    green: 'var(--mc-green)',
    amber: 'var(--mc-amber)',
    red: 'var(--mc-red)',
    broken: 'var(--mc-red)',
};

/** A shield that has lost every segment reads as a broken heart, not a shield. */
const INTACT_EMOJI = '🛡️';
const BROKEN_EMOJI = '💔';

export function ShieldPanel() {
    const { missedMissionStreak } = useMCState();

    const tier = shieldTier(missedMissionStreak);
    const left = shieldSegmentsLeft(missedMissionStreak);
    const broken = tier === 'broken';

    return (
        <motion.div
            // `layout="position"`, not `layout`: plain `layout` animates size by
            // scaling and only inverse-corrects motion children, so the segment
            // track and the text visibly squash while the lock row mounts.
            layout="position"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            style={{
                background: 'rgba(255,255,255,0.85)',
                border: '1.5px solid rgba(167,139,250,0.3)',
                borderRadius: 24,
                padding: '8px 16px',
                display: 'flex',
                flexDirection: 'column',
                gap: 5,
                boxShadow: 'var(--mc-depth-shadow)',
                position: 'relative',
                minWidth: 220,
                userSelect: 'none',
            }}
        >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 18, lineHeight: 1 }}>
                        {broken ? BROKEN_EMOJI : INTACT_EMOJI}
                    </span>
                    <span style={{
                        fontSize: 10,
                        fontWeight: 900,
                        color: 'var(--mc-text-dim)',
                        textTransform: 'uppercase',
                        letterSpacing: '0.1em',
                    }}>
                        Shield
                    </span>
                </span>
                {/* The only non-colour channel on the card, so full-strength text at
                    a size that reads from across a room — --mc-text-muted at 13px
                    measured 3.3:1 and vanished at distance. */}
                <span style={{
                    fontSize: 16,
                    fontWeight: 900,
                    color: 'var(--mc-text)',
                    fontVariantNumeric: 'tabular-nums',
                }}>
                    {left} / {SHIELD_SEGMENTS}
                </span>
            </div>

            <div
                role="meter"
                aria-label="Shield"
                aria-valuenow={left}
                aria-valuemin={0}
                aria-valuemax={SHIELD_SEGMENTS}
                aria-valuetext={`${left} of ${SHIELD_SEGMENTS} shields left`}
                style={{
                    display: 'grid',
                    gridTemplateColumns: `repeat(${SHIELD_SEGMENTS}, 1fr)`,
                    gap: 4,
                }}
            >
                {Array.from({ length: SHIELD_SEGMENTS }).map((_, i) => {
                    const filled = i < left;
                    return (
                        <div
                            key={i}
                            style={{
                                height: 15,
                                borderRadius: 6,
                                background: filled ? TIER_FILL[tier] : 'color-mix(in srgb, var(--mc-purple) 10%, transparent)',
                                border: filled ? '1px solid var(--mc-border-bright)' : '1px solid transparent',
                                boxShadow: filled ? undefined : 'var(--mc-inset-shadow)',
                                // All three, or a just-emptied segment sits in an
                                // inset well while still tinted for ~300ms.
                                transition: 'background 0.3s ease, box-shadow 0.3s ease, border-color 0.3s ease',
                            }}
                        />
                    );
                })}
            </div>

            {/* "your next mission", not "one mission": the lock engages ON a
                timeout, and that same timeout marks the phase done for today — so
                at the moment this appears there is nothing left to finish until
                tomorrow. Promising otherwise reads as broken to a child. */}
            {broken && (
                <div
                    role="status"
                    style={{
                        background: 'color-mix(in srgb, var(--mc-red) 14%, transparent)',
                        border: '1.5px solid color-mix(in srgb, var(--mc-red) 40%, transparent)',
                        borderRadius: 12,
                        padding: '5px 8px',
                        fontSize: 11,
                        fontWeight: 900,
                        color: 'var(--mc-shield-danger-text)',
                        textAlign: 'center',
                    }}
                >
                    🔒 Bank locked — finish your next mission
                </div>
            )}
        </motion.div>
    );
}
