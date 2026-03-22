import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useMCDispatch } from '../../store/useMCStore';
import type { MissionPhase, MissionTask } from '../../types';

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

export function TaskCard({ task, phase, accent }: TaskCardProps) {
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
