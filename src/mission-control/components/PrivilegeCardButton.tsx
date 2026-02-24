// ============================================================
// Mission Control — Privilege Card + Suspension Popup
// Parent taps a privilege card → picks suspend duration.
// ⚠️  Internal to src/mission-control/ only.
// ============================================================

import { useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useMCDispatch } from '../store/useMCStore.tsx';
import type { PrivilegeCard } from '../types';

// ── Icon map ──────────────────────────────────────────────────────────────────
const PRIV_ICON: Record<string, string> = {
    Utensils: '🔪',
    Scissors: '✂️',
    Flame:    '🔥',
    Sprout:   '🌱',
};

// ── Countdown display ─────────────────────────────────────────────────────────
function suspendedCountdown(suspendedUntil: string | null): string | null {
    if (!suspendedUntil) return null;
    const diff = new Date(suspendedUntil).getTime() - Date.now();
    if (diff <= 0) return null;
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const days  = Math.floor(hours / 24);
    if (days >= 1) return `${days}d left`;
    if (hours >= 1) return `${hours}h left`;
    const mins = Math.floor(diff / (1000 * 60));
    return `${mins}m left`;
}

// ── Suspension duration options ───────────────────────────────────────────────
const DURATIONS: { label: string; hours: number }[] = [
    { label: '1 Day',  hours: 24 },
    { label: '3 Days', hours: 72 },
    { label: '1 Week', hours: 168 },
];

// ── Single privilege card + popup ─────────────────────────────────────────────
interface PrivCardProps {
    p: PrivilegeCard;
}

export function PrivilegeCardButton({ p }: PrivCardProps) {
    const dispatch   = useMCDispatch();
    const [popupOpen, setPopupOpen] = useState(false);
    // Store card's viewport position so the fixed popup can appear below it
    const [popupPos, setPopupPos]   = useState({ top: 80, left: 0 });
    const cardRef = useRef<HTMLButtonElement>(null);

    const isSuspended = p.status === 'suspended';
    const countdown   = suspendedCountdown(p.suspendedUntil);

    const handleClick = () => {
        if (cardRef.current) {
            const rect = cardRef.current.getBoundingClientRect();
            setPopupPos({ top: rect.bottom + 8, left: rect.left });
        }
        setPopupOpen(o => !o);
    };

    const suspend = (hours: number) => {
        const until = new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
        dispatch({ type: 'SET_PRIVILEGE_STATUS', cardId: p.id, status: 'suspended', suspendedUntil: until });
        setPopupOpen(false);
    };

    const reinstate = () => {
        dispatch({ type: 'SET_PRIVILEGE_STATUS', cardId: p.id, status: 'active', suspendedUntil: null });
        setPopupOpen(false);
    };

    return (
        <div style={{ position: 'relative' }}>
            {/* The card */}
            <motion.button
                ref={cardRef}
                whileTap={{ scale: 0.9 }}
                whileHover={{ scale: 1.08, y: -2 }}
                onClick={handleClick}
                title={p.label}
                style={{
                    width: 56, height: 52,
                    display: 'flex', flexDirection: 'column',
                    alignItems: 'center', justifyContent: 'center',
                    gap: 2,
                    fontSize: 22, borderRadius: 14,
                    border: isSuspended ? '2px solid #ff8888' : '2px solid rgba(160,150,230,0.25)',
                    background: isSuspended ? 'linear-gradient(160deg,#ffe8e8,#ffcece)' : '#fff',
                    cursor: 'pointer',
                    position: 'relative', overflow: 'hidden',
                    boxShadow: isSuspended
                        ? '0 4px 12px rgba(255,100,100,0.2)'
                        : '0 4px 12px rgba(130,120,200,0.12)',
                    fontFamily: "'Nunito', sans-serif",
                    padding: 0,
                }}
            >
                {isSuspended && (
                    <div
                        className="mc-hazard"
                        style={{ position: 'absolute', inset: 0, opacity: 0.4, pointerEvents: 'none' }}
                    />
                )}
                <span style={{ lineHeight: 1, position: 'relative' }}>
                    {PRIV_ICON[p.icon] ?? '⭐'}
                </span>
                {countdown && (
                    <span style={{
                        fontSize: 8, fontWeight: 900,
                        color: '#c0392b',
                        background: '#ffd6d6',
                        borderRadius: 99,
                        padding: '1px 4px',
                        lineHeight: 1.2,
                        position: 'relative',
                        zIndex: 1,
                    }}>
                        {countdown}
                    </span>
                )}
            </motion.button>

            {/* Popup — portalled to document.body to escape backdrop-filter stacking context */}
            {createPortal(
                <AnimatePresence>
                    {popupOpen && (
                        <>
                            {/* Full-screen backdrop */}
                            <motion.div
                                key="priv-backdrop"
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                onClick={() => setPopupOpen(false)}
                                style={{
                                    position: 'fixed', inset: 0,
                                    zIndex: 9000,
                                    background: 'rgba(0,0,0,0.18)',
                                }}
                            />
                            {/* Panel */}
                            <motion.div
                                key="priv-popup"
                                initial={{ opacity: 0, scale: 0.88, y: -8 }}
                                animate={{ opacity: 1, scale: 1, y: 0 }}
                                exit={{ opacity: 0, scale: 0.88, y: -4 }}
                                transition={{ type: 'spring', stiffness: 400, damping: 28 }}
                                style={{
                                    position: 'fixed',
                                    top: popupPos.top,
                                    left: popupPos.left,
                                    zIndex: 9001,
                                    background: 'linear-gradient(160deg,#fff9f9,#fff0f0)',
                                    border: '1.5px solid rgba(255,130,130,0.35)',
                                    borderRadius: 14,
                                    padding: '12px 14px',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: 8,
                                    minWidth: 160,
                                    boxShadow: '0 8px 32px rgba(200,80,80,0.2)',
                                    fontFamily: "'Nunito', sans-serif",
                                }}
                            >
                                <span style={{ fontSize: 11, fontWeight: 900, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#c0392b' }}>
                                    {PRIV_ICON[p.icon]}  {p.label}
                                </span>
                                {isSuspended && (
                                    <motion.button
                                        whileTap={{ scale: 0.93 }}
                                        onClick={reinstate}
                                        style={{
                                            background: 'linear-gradient(180deg,#c8fcd8,#a0f0b8)',
                                            border: '1.5px solid #6de89e',
                                            borderRadius: 10, padding: '7px 12px',
                                            fontSize: 12, fontWeight: 900, color: '#1a6a35',
                                            cursor: 'pointer', fontFamily: "'Nunito', sans-serif",
                                        }}
                                    >
                                        ✅ Reinstate
                                    </motion.button>
                                )}
                                <span style={{ fontSize: 9, fontWeight: 900, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#b08080', marginTop: 2 }}>
                                    Suspend for:
                                </span>
                                {DURATIONS.map(({ label, hours }) => (
                                    <motion.button
                                        key={label}
                                        whileTap={{ scale: 0.93, y: 1 }}
                                        onClick={() => suspend(hours)}
                                        style={{
                                            background: 'linear-gradient(180deg,#ffe8e8,#ffcece)',
                                            border: '1.5px solid #ffaaaa',
                                            borderRadius: 10, padding: '7px 12px',
                                            fontSize: 12, fontWeight: 900, color: '#c0392b',
                                            cursor: 'pointer', fontFamily: "'Nunito', sans-serif",
                                            boxShadow: '0 2px 0 #ffaaaa88',
                                        }}
                                    >
                                        🚫 {label}
                                    </motion.button>
                                ))}
                            </motion.div>
                        </>
                    )}
                </AnimatePresence>,
                document.body,
            )}
        </div>
    );
}
