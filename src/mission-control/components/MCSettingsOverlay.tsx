// ============================================================
// Mission Control — MCSettingsOverlay
// Parent-only settings panel: mission schedule times & durations.
// Opened via the ⚙️ button in the MissionControl top bar.
// ⚠️  Internal to src/mission-control/ only.
// ============================================================

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useMCState, useMCDispatch } from '../store/useMCStore.tsx';
import type { MCSettings } from '../types';

// ── Helpers ───────────────────────────────────────────────────────────────────

function TimeInput({
    label,
    value,
    onChange,
}: {
    label: string;
    value: string;
    onChange: (v: string) => void;
}) {
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 10, fontWeight: 900, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--mc-text-muted)' }}>
                {label}
            </span>
            <input
                type="time"
                value={value}
                onChange={e => onChange(e.target.value)}
                style={{
                    fontFamily: "'Nunito', sans-serif",
                    fontSize: 18,
                    fontWeight: 800,
                    background: 'rgba(255,255,255,0.8)',
                    border: '1.5px solid rgba(130,120,200,0.25)',
                    borderRadius: 10,
                    padding: '6px 10px',
                    color: 'var(--mc-text)',
                    outline: 'none',
                    width: '100%',
                }}
            />
        </div>
    );
}

function DurationStepper({
    label,
    value,
    onChange,
}: {
    label: string;
    value: number;
    onChange: (v: number) => void;
}) {
    const steps = [5, 10, 15, 20, 30, 45, 60, 90, 120];
    const pct = (value / 120) * 100;
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <span style={{ fontSize: 10, fontWeight: 900, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--mc-text-muted)' }}>
                    {label}
                </span>
                <span style={{ fontSize: 18, fontWeight: 900, color: 'var(--mc-text)', fontVariantNumeric: 'tabular-nums' }}>
                    {value >= 60 ? `${Math.floor(value / 60)}h${value % 60 > 0 ? ` ${value % 60}m` : ''}` : `${value}m`}
                </span>
            </div>
            {/* Quick-pick chips */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {steps.map(step => (
                    <motion.button
                        key={step}
                        whileTap={{ scale: 0.9 }}
                        onClick={() => onChange(step)}
                        style={{
                            background: value === step
                                ? 'linear-gradient(180deg,#c5a8ff,#a57dff)'
                                : 'rgba(255,255,255,0.7)',
                            border: value === step ? '1.5px solid #a57dff' : '1.5px solid rgba(130,120,200,0.2)',
                            borderRadius: 8,
                            padding: '4px 10px',
                            fontSize: 11,
                            fontWeight: 800,
                            color: value === step ? '#fff' : 'var(--mc-text-muted)',
                            cursor: 'pointer',
                            fontFamily: "'Nunito', sans-serif",
                            boxShadow: value === step ? '0 2px 0 #8a5dff44' : 'none',
                        }}
                    >
                        {step >= 60 ? `${step / 60}h` : `${step}m`}
                    </motion.button>
                ))}
            </div>
            {/* Slider */}
            <input
                type="range"
                min={5}
                max={120}
                step={5}
                value={value}
                onChange={e => onChange(Number(e.target.value))}
                style={{ width: '100%', accentColor: '#a57dff' }}
            />
            <div style={{ width: `${pct}%`, height: 3, background: 'linear-gradient(90deg,#c5a8ff,#a57dff)', borderRadius: 99, transition: 'width 0.2s' }} />
        </div>
    );
}

// ── Main Component ────────────────────────────────────────────────────────────

interface MCSettingsOverlayProps {
    open: boolean;
    onClose: () => void;
}

export function MCSettingsOverlay({ open, onClose }: MCSettingsOverlayProps) {
    const state   = useMCState();
    const dispatch = useMCDispatch();

    // Local draft — only committed on "Save"
    const [draft, setDraft] = useState<MCSettings>(() => state.settings);

    // Reset draft whenever the panel opens
    const handleOpen = () => setDraft(state.settings);

    const set = <K extends keyof MCSettings>(key: K, value: MCSettings[K]) =>
        setDraft(prev => ({ ...prev, [key]: value }));

    const save = () => {
        dispatch({ type: 'SET_SETTINGS', settings: draft });
        onClose();
    };

    return (
        <AnimatePresence onExitComplete={() => {}}>
            {open && (
                /* Backdrop — also acts as the centering flex container */
                <motion.div
                    key="settings-backdrop"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    onClick={onClose}
                    style={{
                        position: 'fixed', inset: 0,
                        zIndex: 300,
                        background: 'rgba(30,20,60,0.35)',
                        backdropFilter: 'blur(4px)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                    }}
                >
                    {/* Panel — centered by parent flex, stops propagation so panel clicks don't close */}
                    <motion.div
                        key="settings-panel"
                        initial={{ opacity: 0, scale: 0.94, y: -24 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.94, y: -16 }}
                        transition={{ type: 'spring', stiffness: 340, damping: 30 }}
                        onAnimationStart={() => { if (open) handleOpen(); }}
                        onClick={e => e.stopPropagation()}
                        style={{
                            width: 'min(480px, 90vw)',
                            maxHeight: '85vh',
                            overflowY: 'auto',
                            background: 'linear-gradient(160deg,#f8f6ff,#f0ecff)',
                            border: '1.5px solid rgba(160,150,230,0.35)',
                            borderRadius: 24,
                            padding: '24px 28px',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 24,
                            boxShadow: '0 24px 64px rgba(100,80,200,0.2)',
                            fontFamily: "'Nunito', sans-serif",
                        }}
                    >
                        {/* Header */}
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <span style={{ fontSize: 22 }}>⚙️</span>
                                <span style={{ fontSize: 18, fontWeight: 900, color: 'var(--mc-text)' }}>Settings</span>
                            </div>
                            <motion.button
                                whileTap={{ scale: 0.9 }}
                                onClick={onClose}
                                style={{
                                    background: 'rgba(160,150,230,0.15)',
                                    border: '1.5px solid rgba(160,150,230,0.3)',
                                    borderRadius: 10, padding: '4px 12px',
                                    fontSize: 12, fontWeight: 800,
                                    color: 'var(--mc-text-muted)', cursor: 'pointer',
                                    fontFamily: "'Nunito', sans-serif",
                                }}
                            >
                                Cancel ✕
                            </motion.button>
                        </div>

                        {/* Morning Mission */}
                        <section style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, borderBottom: '1px solid rgba(160,150,230,0.2)', paddingBottom: 8 }}>
                                <span style={{ fontSize: 18 }}>☀️</span>
                                <span style={{ fontSize: 13, fontWeight: 900, color: 'var(--mc-text)' }}>Morning Mission</span>
                            </div>
                            <TimeInput label="Auto-trigger at" value={draft.morningStartsAt} onChange={v => set('morningStartsAt', v)} />
                            <DurationStepper label="Duration" value={draft.morningDurationMins} onChange={v => set('morningDurationMins', v)} />
                        </section>

                        {/* Evening Mission */}
                        <section style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, borderBottom: '1px solid rgba(160,150,230,0.2)', paddingBottom: 8 }}>
                                <span style={{ fontSize: 18 }}>🌙</span>
                                <span style={{ fontSize: 13, fontWeight: 900, color: 'var(--mc-text)' }}>Evening Mission</span>
                            </div>
                            <TimeInput label="Auto-trigger at" value={draft.eveningStartsAt} onChange={v => set('eveningStartsAt', v)} />
                            <DurationStepper label="Duration" value={draft.eveningDurationMins} onChange={v => set('eveningDurationMins', v)} />
                        </section>

                        {/* Save */}
                        <motion.button
                            data-testid="mc-settings-save"
                            whileTap={{ scale: 0.95, y: 2 }}
                            whileHover={{ scale: 1.02 }}
                            onClick={save}
                            style={{
                                background: 'linear-gradient(180deg,#b8a0ff,#9370ff)',
                                border: '1.5px solid rgba(160,100,255,0.5)',
                                borderRadius: 16,
                                padding: '14px 0',
                                fontSize: 15,
                                fontWeight: 900,
                                color: '#fff',
                                cursor: 'pointer',
                                boxShadow: '0 4px 0 #7040cc, 0 6px 20px rgba(120,80,255,0.3)',
                                fontFamily: "'Nunito', sans-serif",
                            }}
                        >
                            ✅ Save Settings
                        </motion.button>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}

