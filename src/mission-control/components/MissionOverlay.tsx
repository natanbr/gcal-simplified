// ============================================================
// Mission Control — MissionOverlay
// Fullscreen animated panel for morning / evening mission checklists.
// Slides up when activeMission !== 'none', minimizable.
// ⚠️  Internal to src/mission-control/ only.
// ============================================================

import { useState, useEffect, useCallback } from 'react';

import { motion, AnimatePresence } from 'framer-motion';
import { useMCState, useMCDispatch, useMission } from '../store/useMCStore.tsx';
import { MissionTimerDisplay, MissionDepletingBar } from './MissionTimerDisplay';
import type { MissionPhase, MissionTask } from '../types';

// ── Icons ─────────────────────────────────────────────────────────────────────
// Map lucide icon names to emoji fallbacks (no external dep needed here)
const ICON_MAP: Record<string, string> = {
    Shirt:         '👕',
    Smile:         '🦷',
    Toothbrush:    '🪥',
    Droplets:      '🚿',
    Droplet:       '💧',
    Moon:          '🌙',
    Layers:        '👘',   // PJs / clothes
    ToyBrick:      '🧸',   // cleanup / blocks
    Sparkles:      '✨',
    BookOpen:      '📖',
    MessageCircle: '💬',
    BedDouble:     '🛏️',
    MoonStar:      '🌙',
    Dog:           '🐕',
    Pill:          '💊',
};
const iconEmoji = (name: string) => ICON_MAP[name] ?? '⭐';


// ── Phase meta ────────────────────────────────────────────────────────────────
const PHASE_META: Record<Exclude<MissionPhase, 'none'>, { label: string; emoji: string; bg: string; accent: string }> = {
    morning: {
        label: 'Morning Mission',
        emoji: '☀️',
        bg: 'linear-gradient(160deg, #fffbea 0%, #fff3c4 100%)',
        accent: '#f7c948',
    },
    evening: {
        label: 'Evening Mission',
        emoji: '🌙',
        bg: 'linear-gradient(160deg, #f0f0ff 0%, #e8e0ff 100%)',
        accent: '#c5a8ff',
    },
};

// ── Task Card ─────────────────────────────────────────────────────────────────
interface TaskCardProps {
    task: MissionTask;
    phase: MissionPhase;
    accent: string;
}

function taskBackground(isCompleted: boolean, isLocked: boolean): string {
    if (isCompleted) return 'linear-gradient(135deg, #eaffed 0%, #c8fcd8 100%)';
    if (isLocked)    return 'rgba(230,228,250,0.6)';
    return 'rgba(255,255,255,0.92)';
}

function taskBorder(isCompleted: boolean, isLocked: boolean, accent: string): string {
    if (isCompleted) return '2px solid #6de89e';
    if (isLocked)    return '2px solid rgba(160,150,230,0.3)';
    return `2px solid ${accent}`;
}

function taskBoxShadow(isCompleted: boolean, isLocked: boolean): string {
    if (isCompleted) return '0 4px 16px rgba(109,232,158,0.25)';
    if (isLocked)    return 'none';
    return '0 4px 14px rgba(130,120,200,0.14)';
}

function taskIconEmoji(isLocked: boolean, isCompleted: boolean, icon: string): string {
    if (isLocked)    return '🔒';
    if (isCompleted) return '✅';
    return iconEmoji(icon);
}

function taskLabelColor(isLocked: boolean, isCompleted: boolean): string {
    if (isLocked)    return '#b8b5d8';
    if (isCompleted) return '#2a8a4a';
    return '#3a3560';
}

function TaskCard({ task, phase, accent }: TaskCardProps) {
    const dispatch = useMCDispatch();
    const [justDone, setJustDone] = useState(false);

    const handleTap = () => {
        if (task.locked || task.completed) return;
        setJustDone(true);
        dispatch({ type: 'COMPLETE_TASK', missionPhase: phase, taskId: task.id });
    };

    useEffect(() => {
        if (!justDone) return;
        const t = setTimeout(() => setJustDone(false), 800);
        return () => clearTimeout(t);
    }, [justDone]);

    const { locked: isLocked, completed: isCompleted } = task;
    const isInteractive = !isLocked && !isCompleted;
    const isBlocked     = isLocked || isCompleted;

    return (
        <motion.button
            data-testid={`mc-task-card-${task.id}`}
            className="mc-task-card"
            onClick={handleTap}
            disabled={isBlocked}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            whileTap={isInteractive ? { scale: 0.93 } : {}}
            whileHover={isInteractive ? { scale: 1.03, y: -2 } : {}}
            style={{
                background: taskBackground(isCompleted, isLocked),
                border: taskBorder(isCompleted, isLocked, accent),
                borderRadius: 20,
                padding: '18px 12px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 10,
                cursor: isInteractive ? 'pointer' : 'default',
                opacity: isLocked ? 0.55 : 1,
                boxShadow: taskBoxShadow(isCompleted, isLocked),
                width: '100%',
                minHeight: 120,
                textAlign: 'center',
                fontFamily: "'Nunito', sans-serif",
                position: 'relative',
                overflow: 'hidden',
            }}
        >
            {/* Burst flash on complete */}
            <AnimatePresence>
                {justDone && (
                    <motion.div
                        key="burst"
                        initial={{ opacity: 0.7, scale: 0.5 }}
                        animate={{ opacity: 0, scale: 2.5 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.5 }}
                        style={{
                            position: 'absolute',
                            inset: 0,
                            background: 'radial-gradient(circle, rgba(109,232,158,0.5) 0%, transparent 70%)',
                            pointerEvents: 'none',
                        }}
                    />
                )}
            </AnimatePresence>

            {/* Icon */}
            <motion.span
                animate={justDone ? { scale: [1, 1.5, 1], rotate: [0, -15, 15, 0] } : { scale: 1 }}
                transition={{ duration: 0.4 }}
                style={{ fontSize: 28, lineHeight: 1, flexShrink: 0 }}
            >
                {taskIconEmoji(isLocked, isCompleted, task.icon)}
            </motion.span>

            {/* Label */}
            <span style={{
                fontSize: 14,
                fontWeight: 800,
                color: taskLabelColor(isLocked, isCompleted),
                textDecoration: isCompleted ? 'line-through' : 'none',
                textAlign: 'center',
                lineHeight: 1.2,
            }}>
                {task.label}
            </span>

            {/* Checkmark badge */}
            {isCompleted && (
                <motion.span
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: 'spring', stiffness: 400, damping: 15 }}
                    style={{ fontSize: 18, flexShrink: 0 }}
                >
                </motion.span>
            )}
        </motion.button>
    );
}

// ── Main Overlay ──────────────────────────────────────────────────────────────
export function MissionOverlay() {
    const state    = useMCState();
    const dispatch = useMCDispatch();
    const [minimized,       setMinimized]      = useState(false);
    const [whiningDetected, setWhiningDetected] = useState(false);

    const BONUS_BASE = 2;

    const phase   = state.activeMission;
    const mission = useMission(phase !== 'none' ? phase : 'morning');

    // ── Timer adjustment callback for the progress bar long-press ───────────────
    const handleBarAdjust = useCallback((deltaMinutes: number) => {
        if (phase !== 'none')
            dispatch({ type: 'ADJUST_MISSION_END', missionPhase: phase as Exclude<MissionPhase,'none'>, deltaMinutes });
    }, [dispatch, phase]);

    // Auto-restore and reset penalty when a new mission starts
    useEffect(() => {
        if (phase !== 'none') {
            setMinimized(false);
            setWhiningDetected(false);
        }
    }, [phase]);

    const hasMission = phase !== 'none';
    const isVisible  = hasMission && !minimized;
    const meta       = hasMission ? PHASE_META[phase] : null;

    const doneCount    = mission?.tasks.filter(t => t.completed).length ?? 0;
    const totalCount   = mission?.tasks.length ?? 0;
    const allDone      = totalCount > 0 && doneCount === totalCount;
    const effectiveBonus = whiningDetected ? Math.max(0, BONUS_BASE - 1) : BONUS_BASE;

    const handleBonusCoin = useCallback(() => {
        for (let i = 0; i < effectiveBonus; i++) dispatch({ type: 'ADD_TOKEN' });
        // Hard-stop the mission: full reset + cancelledAt guard so it won't re-appear
        if (phase !== 'none') {
            dispatch({ type: 'CANCEL_MISSION', missionPhase: phase as Exclude<MissionPhase, 'none'> });
        }
    }, [dispatch, effectiveBonus, phase]);

    // Auto-collect when timer expires with all tasks done
    // even when the mission overlay is hidden (timer component unmounted).
    useEffect(() => {
        if (!allDone || !mission || !mission.startedAt || mission.durationMins == null) return;

        const endMs = new Date(mission.startedAt).getTime() + mission.durationMins * 60 * 1000;
        const nowMs = Date.now();

        if (nowMs >= endMs) {
            handleBonusCoin();
            return;
        }

        const timer = setTimeout(handleBonusCoin, endMs - nowMs);
        return () => clearTimeout(timer);
    }, [allDone, mission, handleBonusCoin]);

    return (
        <>
            {/* ── Minimized pill (tab peeking from bottom) ── */}
            <AnimatePresence>
                {hasMission && minimized && meta && (
                    <motion.button
                        key="pill"
                        data-testid="mc-mission-pill"
                        initial={{ y: 60, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        exit={{ y: 60, opacity: 0 }}
                        whileHover={{ y: -4 }}
                        onClick={() => setMinimized(false)}
                        style={{
                            position: 'fixed',
                            bottom: 0,
                            left: '50%',
                            transform: 'translateX(-50%)',
                            background: meta.bg,
                            border: `2px solid ${meta.accent}`,
                            borderBottom: 'none',
                            borderRadius: '16px 16px 0 0',
                            padding: '8px 24px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 8,
                            cursor: 'pointer',
                            fontFamily: "'Nunito', sans-serif",
                            fontWeight: 800,
                            fontSize: 13,
                            color: '#3a3560',
                            boxShadow: '0 -4px 16px rgba(130,120,200,0.2)',
                            zIndex: 200,
                        }}
                    >
                        <span>{meta.emoji}</span>
                        <span>{meta.label}</span>
                        <span style={{
                            background: meta.accent,
                            borderRadius: 99,
                            padding: '2px 8px',
                            fontSize: 11,
                            fontWeight: 900,
                            color: '#3a3560',
                        }}>
                            {doneCount}/{totalCount}
                        </span>
                    </motion.button>
                )}
            </AnimatePresence>

            {/* ── Full overlay — horizontal top banner ── */}
            <AnimatePresence>
                {isVisible && meta && mission && (
                    <motion.div
                        key="overlay"
                        data-testid="mc-mission-overlay"
                        initial={{ y: '-100%', opacity: 0.6 }}
                        animate={{ y: 0, opacity: 1 }}
                        exit={{ y: '-100%', opacity: 0 }}
                        transition={{ type: 'spring', stiffness: 280, damping: 32 }}
                        className="mc-overlay"
                        style={{
                            position: 'fixed',
                            top: 0,
                            left: 0,
                            right: 0,
                            background: meta.bg,
                            zIndex: 100,
                            display: 'flex',
                            flexDirection: 'column',
                            overflow: 'hidden',
                            boxShadow: '0 4px 24px rgba(130,120,200,0.18)',
                        }}
                    >
                        {/* ── Header row: 3 zones ── */}
                        <div style={{
                            display: 'grid',
                            gridTemplateColumns: '1fr auto 1fr',
                            alignItems: 'center',
                            padding: '50px 50px 20px',
                            gap: 12,
                        }}>
                            {/* LEFT — emoji + title */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                <motion.span
                                    animate={{
                                        rotate: [0, 12, -12, 0],
                                        scale: [1, 1.2, 1],
                                        // ⚡ Bolt Performance: Place infinite transitions inside the animate object
                                        // to prevent Framer Motion from running a constant 60fps loop at the root level.
                                        transition: { repeat: Infinity, duration: 4, ease: 'easeInOut' }
                                    }}
                                    style={{ fontSize: 28, flexShrink: 0 }}
                                >
                                    {meta.emoji}
                                </motion.span>
                                <div>
                                    <div style={{ fontSize: 9, fontWeight: 900, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--mc-text-muted)' }}>
                                        It's time for your
                                    </div>
                                    <div data-testid="mc-mission-title" style={{ fontSize: 18, fontWeight: 900, color: 'var(--mc-text)', lineHeight: 1.1 }}>
                                        {meta.label}
                                    </div>
                                </div>
                            </div>

                            {/* CENTER — timer (hero element) */}
                            <MissionTimerDisplay
                                mission={mission}
                                allDone={allDone}
                                onTimerExpiredWithAllDone={handleBonusCoin}
                            />

                            {/* RIGHT — Hide + Reset Tasks + Stop */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'flex-end' }}>
                                <motion.button
                                    data-testid="mc-minimize-btn"
                                    whileTap={{ scale: 0.88 }}
                                    whileHover={{ scale: 1.06 }}
                                    onClick={() => setMinimized(true)}
                                    style={{
                                        background: 'rgba(255,255,255,0.6)',
                                        border: `1.5px solid ${meta.accent}`,
                                        borderRadius: 10,
                                        padding: '5px 12px',
                                        cursor: 'pointer',
                                        fontSize: 11,
                                        fontWeight: 800,
                                        color: 'var(--mc-text-muted)',
                                        fontFamily: "'Nunito', sans-serif",
                                    }}
                                >
                                    — Hide
                                </motion.button>
                                <motion.button
                                    data-testid="mc-reset-btn"
                                    whileTap={{ scale: 0.88 }}
                                    whileHover={{ scale: 1.06 }}
                                    onClick={() => dispatch({ type: 'RESET_MISSION', missionPhase: phase as Exclude<MissionPhase, 'none'> })}
                                    title="Reset task progress (mission stays open)"
                                    style={{
                                        background: 'rgba(255,255,255,0.6)',
                                        border: '1.5px solid rgba(160,150,230,0.3)',
                                        borderRadius: 10,
                                        padding: '5px 12px',
                                        cursor: 'pointer',
                                        fontSize: 11,
                                        fontWeight: 800,
                                        color: 'var(--mc-text-muted)',
                                        fontFamily: "'Nunito', sans-serif",
                                    }}
                                >
                                    ↺ Tasks
                                </motion.button>
                                <motion.button
                                    data-testid="mc-cancel-btn"
                                    whileTap={{ scale: 0.88 }}
                                    whileHover={{ scale: 1.06 }}
                                    onClick={() => dispatch({ type: 'CANCEL_MISSION', missionPhase: phase as Exclude<MissionPhase, 'none'> })}
                                    title="Stop mission — fully resets tasks and timer; scheduler may re-trigger"
                                    style={{
                                        background: 'rgba(255,220,220,0.7)',
                                        border: '1.5px solid rgba(220,100,100,0.35)',
                                        borderRadius: 10,
                                        padding: '5px 12px',
                                        cursor: 'pointer',
                                        fontSize: 11,
                                        fontWeight: 800,
                                        color: '#a03030',
                                        fontFamily: "'Nunito', sans-serif",
                                    }}
                                >
                                    ✕ Stop
                                </motion.button>
                            </div>
                        </div>

                        {/* ── Full-width depleting bar (long-press to adjust time) ── */}
                        <MissionDepletingBar
                            mission={mission}
                            allDone={allDone}
                            accent={meta.accent}
                            onAdjust={handleBarAdjust}
                        />

                        {/* ── Tasks — horizontal scroll row ── */}
                        <div style={{
                            display: 'flex',
                            flexDirection: 'row',
                            overflowX: 'auto',
                            gap: 12,
                            padding: '40px 50px 50px',
                            scrollbarWidth: 'none',
                        }}>
                            {mission.tasks.map((task, i) => (
                                <motion.div
                                    key={task.id}
                                    initial={{ opacity: 0, y: 16 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: i * 0.06 }}
                                    style={{ flex: '0 0 auto', width: 180,  maxWidth: '20%' }}
                                >
                                    <TaskCard task={task} phase={mission.phase} accent={meta.accent} />
                                </motion.div>
                            ))}

                            {/* Whining toggle — matches task card portrait style */}
                            <motion.div
                                initial={{ opacity: 0, y: 16 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: mission.tasks.length * 0.06 }}
                                style={{ marginLeft: 'auto', flex: '0 0 auto', width: 180, maxWidth: '20%' }}
                            >
                                <motion.button
                                    data-testid="mc-whining-btn"
                                    onClick={() => setWhiningDetected(prev => !prev)}
                                    whileTap={{ scale: 0.93 }}
                                    whileHover={{ scale: 1.03, y: -2 }}
                                    style={{
                                        background: whiningDetected
                                            ? 'linear-gradient(135deg,#fff0f0 0%,#ffd6d6 100%)'
                                            : 'rgba(255,255,255,0.92)',
                                        border: whiningDetected
                                            ? '2px solid #ffaaaa'
                                            : `2px solid ${meta.accent}`,
                                        borderRadius: 20,
                                        padding: '18px 12px',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        gap: 10,
                                        cursor: 'pointer',
                                        width: '100%',
                                        minHeight: 120,
                                        fontFamily: "'Nunito', sans-serif",
                                        boxShadow: whiningDetected
                                            ? '0 4px 16px rgba(255,100,100,0.2)'
                                            : '0 4px 14px rgba(130,120,200,0.14)',
                                        position: 'relative',
                                    }}
                                >
                                    <span style={{ fontSize: 28, lineHeight: 1 }}>
                                        {whiningDetected ? '😠' : '😤'}
                                    </span>
                                    <span style={{
                                        fontSize: 14,
                                        fontWeight: 800,
                                        color: whiningDetected ? '#c0392b' : '#3a3560',
                                        textAlign: 'center',
                                        lineHeight: 1.2,
                                    }}>
                                        {whiningDetected ? 'Whining!' : 'Whining?'}
                                    </span>
                                    {whiningDetected && (
                                        <motion.span
                                            initial={{ scale: 0 }}
                                            animate={{ scale: 1 }}
                                            transition={{ type: 'spring', stiffness: 400, damping: 15 }}
                                            style={{
                                                position: 'absolute',
                                                top: 6, right: 8,
                                                fontSize: 10,
                                                fontWeight: 900,
                                                color: '#c0392b',
                                                background: '#ffd6d6',
                                                borderRadius: 99,
                                                padding: '2px 5px',
                                                lineHeight: 1,
                                            }}
                                        >
                                            −1
                                        </motion.span>
                                    )}
                                </motion.button>
                            </motion.div>
                        </div>


                        {/* All-done celebration */}
                        <AnimatePresence>
                            {allDone && (
                                <motion.div
                                    key="alldone"
                                    data-testid="mc-all-done"
                                    initial={{ opacity: 0, y: 30 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0 }}
                                    style={{
                                        padding: '16px 22px 24px',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        alignItems: 'center',
                                        gap: 10,
                                        background: 'rgba(255,255,255,0.5)',
                                        borderTop: `2px solid ${meta.accent}44`,
                                        flexShrink: 0,
                                    }}
                                >
                                    <motion.span
                                        animate={{ rotate: [0, -10, 10, 0], scale: [1, 1.2, 1] }}
                                        transition={{ repeat: 3, duration: 0.6 }}
                                        style={{ fontSize: 36 }}
                                    >
                                        🎉
                                    </motion.span>
                                    <span style={{ fontSize: 17, fontWeight: 900, color: 'var(--mc-text)' }}>
                                        Mission Complete!
                                    </span>

                                    {/* Bonus counter — already reflects whining toggle from header */}
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                        {Array.from({ length: effectiveBonus }).map((_, i) => (
                                            <motion.span
                                                key={i}
                                                initial={{ scale: 0 }}
                                                animate={{ scale: [1, 1.2, 1], opacity: 1 }}
                                                transition={{ duration: 0.3, delay: i * 0.1 }}
                                                style={{ fontSize: 28 }}
                                            >
                                                ⭐
                                            </motion.span>
                                        ))}
                                        <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--mc-text-muted)', marginLeft: 4 }}>
                                            {effectiveBonus === 0 ? 'No bonus 😔' : `×${effectiveBonus} bonus`}
                                        </span>
                                    </div>

                                    {/* Collect button */}
                                    <motion.button
                                        data-testid="mc-bonus-coin-btn"
                                        whileTap={{ scale: 0.9, y: 2 }}
                                        whileHover={{ scale: 1.05, y: -2 }}
                                        onClick={handleBonusCoin}
                                        style={{
                                            background: effectiveBonus > 0
                                                ? 'linear-gradient(180deg, #f7c948 0%, #f0b820 100%)'
                                                : 'linear-gradient(180deg, #e0e0e0 0%, #cccccc 100%)',
                                            border: effectiveBonus > 0
                                                ? '1.5px solid rgba(247,201,72,0.6)'
                                                : '1.5px solid #bbb',
                                            borderRadius: 16,
                                            padding: '12px 28px',
                                            fontSize: 15,
                                            fontWeight: 900,
                                            color: effectiveBonus > 0 ? '#5a3e00' : '#888',
                                            cursor: 'pointer',
                                            boxShadow: effectiveBonus > 0
                                                ? '0 4px 0 #c99b10, 0 6px 16px rgba(200,155,16,0.35)'
                                                : '0 2px 0 #bbb',
                                            fontFamily: "'Nunito', sans-serif",
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: 8,
                                        }}
                                    >
                                        <span>{effectiveBonus > 0 ? '⭐' : '✅'}</span>
                                        <span>{effectiveBonus > 0 ? `Collect ${effectiveBonus} Bonus Star${effectiveBonus > 1 ? 's' : ''}!` : 'Done (no bonus)'}</span>
                                    </motion.button>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </motion.div>
                )}
            </AnimatePresence>
        </>
    );
}
