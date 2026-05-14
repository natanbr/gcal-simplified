// ============================================================
// Mission Control — Game Token Panel
// Shows the "Interest on Savings" game token accumulator.
// Grants 1 game token per day when bankCount >= 10, up to 5.
// Long-press the X/5 badge to open the admin popup (cheat/test).
// ⚠️  Internal to src/mission-control/ only.
// ============================================================

import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useMCDispatch, useMCState, useMCTotalWealth, MIN_WEALTH_FOR_GAMES } from '../store/useMCStore.tsx';

const MAX_GAME_TOKENS = 5;

function msUntilMidnight(): number {
    const now = new Date();
    const midnight = new Date(now);
    midnight.setHours(24, 0, 0, 0);
    return midnight.getTime() - now.getTime();
}



function ProgressBar({ fraction, paused }: { fraction: number; paused: boolean }) {
    return (
        <div style={{
            height: 6,
            borderRadius: 99,
            background: 'rgba(160,150,230,0.15)',
            overflow: 'hidden',
            position: 'relative',
        }}>
            <motion.div
                animate={{ width: `${Math.min(100, fraction * 100)}%` }}
                transition={{ duration: 0.8, ease: 'easeOut' }}
                style={{
                    height: '100%',
                    borderRadius: 99,
                    background: paused
                        ? 'rgba(160,150,230,0.25)'
                        : 'linear-gradient(90deg, #a78bfa, #7c3aed)',
                }}
            />
        </div>
    );
}

function TokenDot({ filled, index }: { filled: boolean; index: number }) {
    return (
        <motion.div
            initial={false}
            animate={filled ? { scale: [1.3, 1], opacity: 1 } : { scale: 0.85, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 420, damping: 18, delay: index * 0.04 }}
            style={{
                width: 32,
                height: 32,
                borderRadius: '50%',
                background: filled
                    ? 'radial-gradient(circle at 35% 32%, #c4b5fd, #7c3aed 60%, #4c1d95)'
                    : 'transparent',
                border: filled
                    ? '2px solid rgba(124,58,237,0.5)'
                    : '2.5px dashed rgba(160,150,230,0.35)',
                boxShadow: filled
                    ? '0 2px 0 #4c1d95 inset, 0 3px 8px rgba(124,58,237,0.3)'
                    : 'none',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 14,
            }}
        >
            {filled ? '🐍' : null}
        </motion.div>
    );
}

export function GameTokenPanel() {
    const state = useMCState();
    const dispatch = useMCDispatch();
    const totalWealth = useMCTotalWealth();
    const { gameTokens } = state;

    const isPaused = totalWealth < MIN_WEALTH_FOR_GAMES;
    const atCap = gameTokens >= MAX_GAME_TOKENS;

    // ── Long-press admin popup ──────────────────────────────
    const [popupOpen, setPopupOpen] = useState(false);
    const ptrDownTimeRef = useRef<number>(0);

    const handlePointerDown = () => {
        ptrDownTimeRef.current = Date.now();
    };

    const handlePointerUp = () => {
        const duration = Date.now() - ptrDownTimeRef.current;
        if (popupOpen) { setPopupOpen(false); return; }
        if (duration >= 600) setPopupOpen(true);
    };

    // ── Daily bar ──────────────────────────────────────────
    const [barFraction, setBarFraction] = useState(() => {
        const msLeft = msUntilMidnight();
        return 1 - msLeft / (24 * 60 * 60 * 1000);
    });

    useEffect(() => {
        const tick = () => {
            const msLeft = msUntilMidnight();
            setBarFraction(1 - msLeft / (24 * 60 * 60 * 1000));
        };
        const interval = setInterval(tick, 60_000);
        return () => clearInterval(interval);
    }, []);

    let statusLabel: string;
    let statusColor: string;
    if (isPaused) {
        statusLabel = `🔒 Paused — need ${MIN_WEALTH_FOR_GAMES}+ tokens to earn`;
        statusColor = 'var(--mc-text-dim)';
    } else if (atCap) {
        statusLabel = '⭐ Full! Use a game token to earn more';
        statusColor = '#a87c00';
    } else {
        // Even if earned today, we show "Earning..." to satisfy user request for constant loader
        statusLabel = 'Earning...';
        statusColor = '#6d28d9';
    }

    return (
        <motion.div
            layout
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            style={{
                background: 'rgba(255,255,255,0.85)',
                border: '1.5px solid rgba(167,139,250,0.3)',
                borderRadius: 18,
                padding: '14px 14px 12px',
                display: 'flex',
                flexDirection: 'column',
                gap: 10,
                boxShadow: 'var(--mc-depth-shadow)',
                position: 'relative',
            }}
        >
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span
                    style={{ fontSize: 26, lineHeight: 1, flexShrink: 0, display: 'inline-block' }}
                    className={isPaused ? '' : 'mc-anim-icon-pulse'}
                >
                    🐍
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <div style={{ fontSize: 13, fontWeight: 900, color: 'var(--mc-text)', lineHeight: 1.1 }}>
                            Game Tokens
                        </div>
                        <div
                            title="Earn 1/day with 10+ tokens in bank"
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

                {/* Long-pressable X/5 badge */}
                <button
                    onPointerDown={handlePointerDown}
                    onPointerUp={handlePointerUp}
                    onContextMenu={(e) => e.preventDefault()}
                    style={{
                        background: gameTokens > 0
                            ? 'linear-gradient(135deg, #c4b5fd, #7c3aed)'
                            : 'rgba(160,150,230,0.15)',
                        color: gameTokens > 0 ? '#fff' : 'var(--mc-text-dim)',
                        fontSize: 11,
                        fontWeight: 900,
                        borderRadius: 99,
                        padding: '3px 10px',
                        letterSpacing: '0.04em',
                        flexShrink: 0,
                        border: 'none',
                        cursor: 'pointer',
                        touchAction: 'none',
                        userSelect: 'none',
                    }}
                    aria-label="Game token admin (long press)"
                >
                    {gameTokens} / {MAX_GAME_TOKENS}
                </button>
            </div>

            {/* Admin Popup */}
            <AnimatePresence>
                {popupOpen && (
                    <>
                        <motion.div
                            key="backdrop"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={() => setPopupOpen(false)}
                            style={{ position: 'fixed', inset: 0, zIndex: 150, background: 'rgba(0,0,0,0.15)' }}
                        />
                        <motion.div
                            key="panel"
                            initial={{ opacity: 0, scale: 0.96 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.96 }}
                            transition={{ type: 'spring', stiffness: 380, damping: 28 }}
                            style={{
                                position: 'absolute', top: 0, left: 0, right: 0, zIndex: 160,
                                background: 'linear-gradient(160deg, #f5f3ff, #ede9fe)',
                                border: '1.5px solid rgba(167,139,250,0.5)',
                                borderRadius: 16,
                                padding: '14px 16px',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: 10,
                                boxShadow: '0 8px 24px rgba(124,58,237,0.18)',
                            }}
                        >
                            <span style={{ fontSize: 10, fontWeight: 900, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#6d28d9' }}>
                                ⚙️ Game Token Admin
                            </span>
                            <div style={{ display: 'flex', gap: 8 }}>
                                {[
                                    { label: '+1', bg: 'linear-gradient(180deg,#c4b5fd,#a78bfa)', border: '#7c3aed', color: '#3b0764' },
                                    { label: '−1', bg: 'linear-gradient(180deg,#ffd6d6,#ffaaaa)', border: '#ff8888', color: '#c0392b' },
                                    { label: 'Reset', bg: 'linear-gradient(180deg,#e5e7eb,#d1d5db)', border: '#9ca3af', color: '#374151' },
                                ].map(({ label, bg, border, color }) => (
                                    <motion.button
                                        key={label}
                                        whileTap={{ scale: 0.9, y: 2 }}
                                        whileHover={{ scale: 1.06 }}
                                        onClick={() => {
                                            if (label === '+1') dispatch({ type: 'GRANT_GAME_TOKEN', force: true });
                                            else if (label === '−1') dispatch({ type: 'CONSUME_GAME_TOKEN' });
                                            else dispatch({ type: 'RESET_GAME_TOKENS' });
                                        }}
                                        disabled={label === '−1' && gameTokens === 0}
                                        style={{
                                            flex: 1,
                                            background: bg,
                                            border: `1.5px solid ${border}`,
                                            borderRadius: 12,
                                            padding: '10px 4px',
                                            fontSize: label === 'Reset' ? 12 : 16,
                                            fontWeight: 900,
                                            color,
                                            cursor: label === '−1' && gameTokens === 0 ? 'not-allowed' : 'pointer',
                                            opacity: label === '−1' && gameTokens === 0 ? 0.4 : 1,
                                            fontFamily: "'Nunito', sans-serif",
                                            boxShadow: `0 3px 0 ${border}88`,
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                        }}
                                    >
                                        {label}
                                    </motion.button>
                                ))}
                            </div>
                            <button
                                onClick={() => setPopupOpen(false)}
                                style={{
                                    background: 'none', border: 'none', cursor: 'pointer',
                                    fontSize: 10, fontWeight: 800, color: '#6d28d9',
                                    textAlign: 'center', padding: '2px 0', fontFamily: "'Nunito', sans-serif",
                                }}
                            >
                                close ✕
                            </button>
                        </motion.div>
                    </>
                )}
            </AnimatePresence>

            {/* Token dots */}
            <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
                {Array.from({ length: MAX_GAME_TOKENS }, (_, i) => (
                    <TokenDot key={i} filled={i < gameTokens} index={i} />
                ))}
            </div>

            {/* Progress bar */}
            <ProgressBar fraction={isPaused || atCap ? 0 : barFraction} paused={isPaused} />

            {/* Status label */}
            <div style={{
                textAlign: 'center',
                fontSize: 10,
                fontWeight: 800,
                color: statusColor,
            }}>
                {statusLabel}
            </div>
        </motion.div>
    );
}
