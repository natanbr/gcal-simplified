import { useEffect, useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useMCState } from '../store/useMCStore.tsx';

const MOOD_DATA: Record<number, { emoji: string; label: string; color: string }> = {
    [-2]: { emoji: '😡', label: 'Angry', color: '#DC2626' },
    [-1]: { emoji: '🙁', label: 'Sad', color: '#F97316' },
    [0]:  { emoji: '😐', label: 'Neutral', color: '#a78bfa' },
    [1]:  { emoji: '🙂', label: 'Happy', color: '#34D399' },
    [2]:  { emoji: '😃', label: 'Great', color: '#10B981' },
};

function getMood(level: number) {
    const clamped = Math.max(-2, Math.min(2, level));
    return MOOD_DATA[clamped] ?? MOOD_DATA[0];
}

export function MoodWindNotification() {
    const { moodWind, behaviorDelta } = useMCState();
    const [visible, setVisible] = useState(false);
    const lastWind = useRef(moodWind);
    const timerRef = useRef<NodeJS.Timeout | null>(null);

    useEffect(() => {
        const windChanged = lastWind.current !== moodWind;
        const significantDelta = Math.abs(behaviorDelta) > 0.5;

        if (windChanged || significantDelta) {
            setVisible(true);
            if (timerRef.current) clearTimeout(timerRef.current);
            timerRef.current = setTimeout(() => setVisible(false), 3000);
            lastWind.current = moodWind;
        }
    }, [moodWind, behaviorDelta]);

    const mood = getMood(moodWind);

    return (
        <AnimatePresence>
            {visible && (
                <motion.div
                    initial={{ opacity: 0, y: -100, x: '-50%' }}
                    animate={{ opacity: 1, y: 40, x: '-50%' }}
                    exit={{ opacity: 0, y: -20 }}
                    style={{
                        position: 'fixed',
                        top: 0,
                        left: '50%',
                        zIndex: 2000,
                        background: 'rgba(255, 255, 255, 0.95)',
                        border: `2px solid ${mood.color}`,
                        borderRadius: 24,
                        padding: '12px 24px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 16,
                        boxShadow: `0 10px 40px ${mood.color}33`,
                        backdropFilter: 'blur(10px)',
                        minWidth: 280,
                    }}
                >
                    <div style={{ fontSize: 32 }}>{mood.emoji}</div>
                    <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 10, fontWeight: 900, color: 'var(--mc-text-dim)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                            Mood Update
                        </div>
                        <div style={{ fontSize: 18, fontWeight: 900, color: 'var(--mc-text)', lineHeight: 1.1 }}>
                            {mood.label} <span style={{ color: mood.color }}>{moodWind !== 0 && `(Lvl ${Math.abs(moodWind)})`}</span>
                        </div>
                    </div>
                    {behaviorDelta !== 0 && (
                        <div style={{
                            fontSize: 16,
                            fontWeight: 900,
                            color: behaviorDelta > 0 ? '#10B981' : '#EF4444',
                            background: `${behaviorDelta > 0 ? '#10B981' : '#EF4444'}11`,
                            padding: '4px 10px',
                            borderRadius: 12,
                        }}>
                            {behaviorDelta > 0 ? '+' : ''}{behaviorDelta.toFixed(1)}%
                        </div>
                    )}
                </motion.div>
            )}
        </AnimatePresence>
    );
}
