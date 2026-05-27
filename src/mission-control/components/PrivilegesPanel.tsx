// ============================================================
// Mission Control — Privileges Panel
// Displays current privileges and active suspensions.
// ⚠️  Internal to src/mission-control/ only.
// ============================================================

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useMCState } from '../store/useMCStore.tsx';
import { PrivilegeCardButton } from './PrivilegeCardButton';
import { formatSuspendedRemainingTime } from '../../utils/timeUtils';

export function PrivilegesPanel({ interactive = false }: { interactive?: boolean }) {
    const state = useMCState();
    const { privileges } = state;

    const suspendedList = privileges.filter(p => p.status === 'suspended');
    const allActive = suspendedList.length === 0;

    // Force periodic re-render to update the countdowns
    const [, setTick] = useState(0);
    useEffect(() => {
        const interval = setInterval(() => setTick(t => t + 1), 30_000);
        return () => clearInterval(interval);
    }, []);

    return (
        <motion.div
            layout
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            style={{
                background: 'rgba(255,255,255,0.85)',
                border: '1.5px solid rgba(160,150,230,0.3)',
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
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 13, fontWeight: 900, color: 'var(--mc-text)', lineHeight: 1.1 }}>
                        Privileges
                    </span>
                    <div
                        title="Click cards to manage privilege suspensions"
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

                {/* All Active / Suspended Pill */}
                {interactive && (
                    <AnimatePresence mode="wait">
                        {allActive ? (
                            <motion.span
                                key="all-active"
                                initial={{ scale: 0.8, opacity: 0 }}
                                animate={{ scale: 1, opacity: 1 }}
                                exit={{ scale: 0.8, opacity: 0 }}
                                style={{
                                    fontSize: 10,
                                    fontWeight: 900,
                                    color: '#1a6a35',
                                    background: '#c8fcd8',
                                    border: '1px solid #6de89e',
                                    borderRadius: 99,
                                    padding: '2px 8px',
                                    letterSpacing: '0.02em',
                                    lineHeight: 1.1,
                                }}
                            >
                                🛡️ All Active
                            </motion.span>
                        ) : (
                            <motion.span
                                key="suspended-pill"
                                initial={{ scale: 0.8, opacity: 0 }}
                                animate={{ scale: 1, opacity: 1 }}
                                exit={{ scale: 0.8, opacity: 0 }}
                                style={{
                                    fontSize: 10,
                                    fontWeight: 900,
                                    color: '#c0392b',
                                    background: '#ffd6d6',
                                    border: '1px solid #ffaaaa',
                                    borderRadius: 99,
                                    padding: '2px 8px',
                                    letterSpacing: '0.02em',
                                    lineHeight: 1.1,
                                }}
                            >
                                ⚠️ Suspended
                            </motion.span>
                        )}
                    </AnimatePresence>
                )}
            </div>

            {/* Privilege Buttons Row */}
            <div style={{ display: 'flex', gap: 6, justifyContent: 'center', flexWrap: 'wrap' }}>
                {privileges.map(p => (
                    <PrivilegeCardButton key={p.id} p={p} interactive={interactive} />
                ))}
            </div>

            {/* Active Suspensions List */}
            <AnimatePresence>
                {interactive && !allActive && (
                    <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        style={{
                            overflow: 'hidden',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 4,
                            marginTop: 2,
                            borderTop: '1px solid rgba(160,150,230,0.15)',
                            paddingTop: 8,
                        }}
                    >
                        <span style={{ fontSize: 9, fontWeight: 900, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--mc-text-dim)' }}>
                            Active Suspensions:
                        </span>
                        {suspendedList.map(p => {
                            const timeText = formatSuspendedRemainingTime(p.suspendedUntil) ?? 'expired';
                            return (
                                <div
                                    key={p.id}
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'space-between',
                                        fontSize: 10,
                                        fontWeight: 800,
                                        color: '#c0392b',
                                        background: 'linear-gradient(135deg, #fff2f2, #ffe3e3)',
                                        padding: '4px 8px',
                                        borderRadius: 8,
                                        border: '1.5px solid #ffbbbb',
                                    }}
                                >
                                    <span>🚫 {p.label}</span>
                                    <span style={{ fontSize: 9, fontVariantNumeric: 'tabular-nums', fontWeight: 900, background: '#ffd2d2', padding: '1px 5px', borderRadius: 99 }}>
                                        {timeText}
                                    </span>
                                </div>
                            );
                        })}
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.div>
    );
}
