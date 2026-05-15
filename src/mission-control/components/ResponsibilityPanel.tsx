// ============================================================
// Mission Control — ResponsibilityPanel
// Tracks ongoing chore responsibilities (e.g. Recycling).
// Each task has a point goal; when reached it stays "complete"
// until the parent presses "Claim & Reset".
// ⚠️  Internal to src/mission-control/ only.
// ============================================================

import { motion, AnimatePresence } from 'framer-motion';
import { useMCState, useMCDispatch } from '../store/useMCStore.tsx';
import type { ResponsibilityTask } from '../types';

// ── Single task card ──────────────────────────────────────────────────────────

function PointDot({ filled, index, icon = '⭐' }: { filled: boolean; index: number; icon?: string }) {
    return (
        <motion.div
            key={index}
            initial={false}
            animate={filled
                ? { scale: [1.4, 1], opacity: 1 }
                : { scale: 0.85, opacity: 1 }
            }
            transition={{ type: 'spring', stiffness: 400, damping: 18 }}
            style={{
                width: 36,
                height: 36,
                borderRadius: '50%',
                background: filled
                    ? 'radial-gradient(circle at 35% 32%, #ffe880, #f7c948 38%, #c99b10 82%)'
                    : 'transparent',
                border: filled
                    ? '2px solid rgba(200,154,16,0.5)'
                    : '2.5px dashed rgba(160,150,230,0.35)',
                boxShadow: filled
                    ? '0 2px 0 #c99b10 inset, 0 3px 8px rgba(200,155,16,0.3)'
                    : 'none',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 16,
            }}
        >
            {filled ? icon : null}
        </motion.div>
    );
}

interface TaskCardProps {
    task: ResponsibilityTask;
}

function ResponsibilityCard({ task }: TaskCardProps) {
    const dispatch = useMCDispatch();
    const isComplete = task.completedAt !== null;

    return (
        <motion.div
            layout
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            style={{
                background: isComplete
                    ? 'linear-gradient(135deg, #fffbea 0%, #fff3c4 100%)'
                    : 'rgba(255,255,255,0.85)',
                border: isComplete
                    ? '2px solid rgba(247,201,72,0.6)'
                    : '1.5px solid rgba(160,150,230,0.25)',
                borderRadius: 18,
                padding: '14px 14px 12px',
                display: 'grid',
                gridTemplateColumns: '1fr auto',
                gridTemplateRows: 'auto auto',
                gap: '10px 14px',
                alignItems: 'center',
                boxShadow: isComplete
                    ? '0 4px 16px rgba(247,201,72,0.2), var(--mc-depth-shadow)'
                    : 'var(--mc-depth-shadow)',
                position: 'relative',
                overflow: 'hidden',
            }}
        >
            {/* Shimmer on complete */}
            {isComplete && (
                <div
                    className="mc-anim-shimmer"
                    style={{
                        position: 'absolute',
                        inset: 0,
                        background: 'linear-gradient(105deg, transparent 40%, rgba(255,255,200,0.35) 50%, transparent 60%)',
                        pointerEvents: 'none',
                    }}
                />
            )}

            {/* Left side: Header (Row 1) */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, gridColumn: 1, gridRow: 1 }}>
                <span
                    className={isComplete ? "mc-anim-icon-complete" : "mc-anim-icon-pulse"}
                    style={{ fontSize: 28, lineHeight: 1, flexShrink: 0, display: 'inline-block' }}
                >
                    {task.icon}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <div style={{
                            fontSize: 13,
                            fontWeight: 900,
                            color: 'var(--mc-text)',
                            lineHeight: 1.1,
                        }}>
                            {task.label}
                        </div>
                        <div
                            title={task.description}
                            style={{
                                background: 'rgba(160,150,230,0.15)',
                                color: 'var(--mc-text-dim)',
                                borderRadius: '50%',
                                width: 16,
                                height: 16,
                                fontSize: 10,
                                fontWeight: 900,
                                cursor: 'help',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                flexShrink: 0
                            }}
                        >
                            ?
                        </div>
                    </div>
                </div>
                {isComplete && (
                    <motion.span
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        transition={{ type: 'spring', stiffness: 400, damping: 14 }}
                        style={{
                            background: 'linear-gradient(135deg, #f7c948, #f0b820)',
                            color: '#5a3e00',
                            fontSize: 9,
                            fontWeight: 900,
                            borderRadius: 99,
                            padding: '3px 8px',
                            letterSpacing: '0.06em',
                            flexShrink: 0,
                        }}
                    >
                        DONE ✓
                    </motion.span>
                )}
            </div>

            {/* Left side: Progress (Row 2) */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, gridColumn: 1, gridRow: 2 }}>
                {/* Progress dots */}
                <div style={{ display: 'flex', gap: 8 }}>
                    {Array.from({ length: task.pointsRequired }, (_, i) => (
                        <PointDot key={i} filled={i < task.pointsEarned} index={i} icon={task.pointIcon} />
                    ))}
                </div>

                {/* Progress label */}
                {isComplete && (
                    <div style={{
                        fontSize: 10,
                        fontWeight: 800,
                        color: '#a87c00',
                    }}>
                        {task.rewardLabel}
                    </div>
                )}
            </div>

            {/* Right side: Action Buttons (Spans Rows 1-2) */}
            <div style={{ gridColumn: 2, gridRow: '1 / span 2', display: 'flex', alignItems: 'stretch' }}>
                <AnimatePresence mode="wait">
                    {isComplete ? (
                        /* Parent-only: claim reward and restart */
                        <motion.div
                            key="claim"
                            initial={{ opacity: 0, scale: 0.9 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0 }}
                            style={{ display: 'flex', height: '100%' }}
                        >
                            <motion.button
                                data-testid={`mc-responsibility-claim-${task.id}`}
                                whileTap={{ scale: 0.93 }}
                                whileHover={{ scale: 1.03 }}
                                onClick={() => {
                                    dispatch({ type: 'RESET_RESPONSIBILITY', taskId: task.id, claimTokens: task.tokenReward });
                                }}
                                style={{
                                    background: 'linear-gradient(180deg, #6de89e 0%, #3dce76 100%)',
                                    border: '1.5px solid rgba(61,206,118,0.5)',
                                    borderRadius: 12,
                                    padding: '0 16px',
                                    fontSize: 13,
                                    fontWeight: 900,
                                    color: '#0b4a20',
                                    cursor: 'pointer',
                                    fontFamily: "'Nunito', sans-serif",
                                    boxShadow: '0 3px 0 #2da85a',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: 4,
                                    height: '100%'
                                }}
                            >
                                <span style={{ fontSize: 20 }}>🎁</span>
                                <span>Claim</span>
                            </motion.button>
                        </motion.div>
                    ) : (
                        /* +1 point button (Combined for all tasks) */
                        <motion.button
                            key="add"
                            data-testid={`mc-responsibility-add-${task.id}`}
                            initial={{ opacity: 0, scale: 0.9 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0 }}
                            whileTap={{ scale: 0.93 }}
                            whileHover={{ scale: 1.03 }}
                            onClick={() => dispatch({ type: 'ADD_RESPONSIBILITY_POINT', taskId: task.id })}
                            style={{
                                background: 'linear-gradient(180deg, #ffe880 0%, #f7c948 100%)',
                                border: '1.5px solid rgba(247,201,72,0.6)',
                                borderRadius: 12,
                                padding: '8px 24px',
                                fontSize: 13,
                                fontWeight: 900,
                                color: '#5a3e00',
                                cursor: 'pointer',
                                fontFamily: "'Nunito', sans-serif",
                                boxShadow: '0 3px 0 #c99b10',
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: 6,
                                height: '100%',
                                minWidth: 100,
                                position: 'relative'
                            }}
                        >
                            <span style={{ 
                                position: 'absolute', 
                                top: 4, 
                                right: 6, 
                                fontSize: 13, 
                                fontWeight: 900, 
                                color: '#7a5a00' 
                            }}>
                                +1
                            </span>
                            {(() => {
                                // Force 4 icons for Activity task to handle stale localStorage state
                                const activities = task.id === 'activity' 
                                    ? [
                                        { emoji: '🛼', label: 'Rollerblading' },
                                        { emoji: '⛸️', label: 'Ice Skating' },
                                        { emoji: '🏊', label: 'Swimming' },
                                        { emoji: '🥋', label: 'Karate' }
                                      ]
                                    : task.activities;

                                if (activities && activities.length > 0) {
                                    return (
                                        <div style={{ 
                                            display: 'grid', 
                                            gridTemplateColumns: 'repeat(2, 1fr)', 
                                            gap: '4px',
                                            fontSize: 20,
                                            lineHeight: 1.1,
                                            marginTop: 2
                                        }}>
                                            {activities.map((act, i) => (
                                                <span key={i} title={act.label}>{act.emoji}</span>
                                            ))}
                                        </div>
                                    );
                                }
                                return <span style={{ fontSize: 28 }}>{task.icon || '⭐'}</span>;
                            })()}
                        </motion.button>
                    )}
                </AnimatePresence>
            </div>
        </motion.div>
    );
}

// ── Panel ─────────────────────────────────────────────────────────────────────

export function ResponsibilityPanel() {
    const state = useMCState();

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {state.responsibilities.map(task => (
                <ResponsibilityCard key={task.id} task={task} />
            ))}
        </div>
    );
}
