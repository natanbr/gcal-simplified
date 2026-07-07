// ============================================================
// Mission Control — MCSettingsOverlay
// Parent-only settings panel: mission schedule times & durations.
// Opened via the ⚙️ button in the MissionControl top bar.
// ⚠️  Internal to src/mission-control/ only.
// ============================================================

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useMCState, useMCDispatch } from '../store/useMCStore';
import type { MCSettings } from '../types';
import { REWARDS } from '../rewardCatalogue';
import { QRCodeCanvas } from 'qrcode.react';
import { useRemoteStatus } from '../contexts/RemoteStatusContext';
import { PrivilegeCardButton } from './PrivilegeCardButton';

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
    const TEST_SECS = 10 / 60; // 10 seconds expressed as fractional minutes
    const steps = [5, 10, 15, 20, 30, 45, 60, 90, 120];
    const pct = (Math.min(value, 120) / 120) * 100;
    const displayLabel = value === TEST_SECS
        ? '10s'
        : value >= 60 ? `${Math.floor(value / 60)}h${value % 60 > 0 ? ` ${value % 60}m` : ''}` : `${Math.round(value)}m`;
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <span style={{ fontSize: 10, fontWeight: 900, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--mc-text-muted)' }}>
                    {label}
                </span>
                <span style={{ fontSize: 18, fontWeight: 900, color: 'var(--mc-text)', fontVariantNumeric: 'tabular-nums' }}>
                    {displayLabel}
                </span>
            </div>
            {/* Quick-pick chips */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {/* Dev test chip */}
                <motion.button
                    key="10s"
                    whileTap={{ scale: 0.9 }}
                    onClick={() => onChange(TEST_SECS)}
                    title="10-second test timer"
                    style={{
                        background: value === TEST_SECS
                            ? 'linear-gradient(180deg,#ff9a3c,#e67e22)'
                            : 'rgba(255,200,100,0.2)',
                        border: value === TEST_SECS ? '1.5px solid #e67e22' : '1.5px solid rgba(230,130,0,0.25)',
                        borderRadius: 8,
                        padding: '4px 10px',
                        fontSize: 11,
                        fontWeight: 800,
                        color: value === TEST_SECS ? '#fff' : '#b86000',
                        cursor: 'pointer',
                        fontFamily: "'Nunito', sans-serif",
                    }}
                >
                    🔧 10s
                </motion.button>
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
                min={0}
                max={120}
                step={5}
                value={Math.round(value)}
                onChange={e => onChange(Number(e.target.value))}
                style={{ width: '100%', accentColor: '#a57dff' }}
            />
            <div style={{ width: `${pct}%`, height: 3, background: 'linear-gradient(90deg,#c5a8ff,#a57dff)', borderRadius: 99, transition: 'width 0.2s' }} />
        </div>
    );
}

function AutoReturnStepper({
    value,
    onChange,
}: {
    value: number;
    onChange: (v: number) => void;
}) {
    const chips: { label: string; value: number }[] = [
        { label: 'Off', value: 0 },
        { label: '1m',  value: 1 },
        { label: '2m',  value: 2 },
        { label: '5m',  value: 5 },
        { label: '10m', value: 10 },
        { label: '15m', value: 15 },
        { label: '30m', value: 30 },
    ];
    const displayLabel = value === 0 ? 'Disabled' : `${value} min`;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <span style={{ fontSize: 10, fontWeight: 900, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--mc-text-muted)' }}>
                    Timeout
                </span>
                <span style={{ fontSize: 18, fontWeight: 900, color: value === 0 ? 'var(--mc-text-muted)' : 'var(--mc-text)', fontVariantNumeric: 'tabular-nums' }}>
                    {displayLabel}
                </span>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {chips.map(chip => (
                    <motion.button
                        key={chip.value}
                        whileTap={{ scale: 0.9 }}
                        onClick={() => onChange(chip.value)}
                        style={{
                            background: value === chip.value
                                ? chip.value === 0
                                    ? 'linear-gradient(180deg,#ff9a9a,#e74c3c)'
                                    : 'linear-gradient(180deg,#c5a8ff,#a57dff)'
                                : 'rgba(255,255,255,0.7)',
                            border: value === chip.value
                                ? chip.value === 0 ? '1.5px solid #e74c3c' : '1.5px solid #a57dff'
                                : '1.5px solid rgba(130,120,200,0.2)',
                            borderRadius: 8,
                            padding: '4px 10px',
                            fontSize: 11,
                            fontWeight: 800,
                            color: value === chip.value ? '#fff' : 'var(--mc-text-muted)',
                            cursor: 'pointer',
                            fontFamily: "'Nunito', sans-serif",
                            boxShadow: value === chip.value ? '0 2px 0 rgba(0,0,0,0.15)' : 'none',
                        }}
                    >
                        {chip.label}
                    </motion.button>
                ))}
            </div>
            <p style={{ fontSize: 11, color: 'var(--mc-text-muted)', margin: 0, lineHeight: 1.4 }}>
                {value === 0
                    ? 'Auto-return is disabled. The screen stays on Mission Control indefinitely.'
                    : `Automatically switches back to Calendar after ${value} min of inactivity. Paused during active missions.`}
            </p>
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
    const remoteStatus = useRemoteStatus();

    // Local draft — only committed on "Save"
    const [draft, setDraft] = useState<MCSettings>(() => state.settings);
    const [activeTab, setActiveTab] = useState<'time' | 'tasks' | 'rewards' | 'remote' | 'privileges'>('time');

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
                /* Backdrop */
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
                        padding: 24,
                    }}
                >
                    {/* Main Panel — Use grid to divide Sidebar and Content */}
                    <motion.div
                        key="settings-panel"
                        data-testid="mc-settings-panel"
                        initial={{ opacity: 0, scale: 0.94, y: -24 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.94, y: -16 }}
                        transition={{ type: 'spring', stiffness: 340, damping: 30 }}
                        onAnimationStart={() => { if (open) handleOpen(); }}
                        onClick={e => e.stopPropagation()}
                        style={{
                            width: 'min(760px, 95vw)',
                            height: 'min(640px, 85vh)',
                            background: 'linear-gradient(160deg,#f8f6ff,#f0ecff)',
                            border: '1.5px solid rgba(160,150,230,0.35)',
                            borderRadius: 24,
                            display: 'flex',
                            flexDirection: 'column',
                            boxShadow: '0 24px 64px rgba(100,80,200,0.2)',
                            fontFamily: "'Nunito', sans-serif",
                            overflow: 'hidden',
                        }}
                    >
                        {/* Header */}
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 24px', borderBottom: '1px solid rgba(160,150,230,0.2)', background: 'rgba(255,255,255,0.4)' }}>
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

                        {/* Layout: Sidebar + Content */}
                        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
                            {/* Sidebar */}
                            <div style={{ width: 180, borderRight: '1px solid rgba(160,150,230,0.2)', display: 'flex', flexDirection: 'column', padding: 12, gap: 4, background: 'rgba(255,255,255,0.2)' }}>
                                <button
                                    onClick={() => setActiveTab('time')}
                                    style={{
                                        textAlign: 'left', padding: '10px 14px', borderRadius: 12, fontSize: 14, fontWeight: 800, border: 'none', cursor: 'pointer',
                                        background: activeTab === 'time' ? 'rgba(165,125,255,0.15)' : 'transparent',
                                        color: activeTab === 'time' ? '#8050e0' : 'var(--mc-text-muted)',
                                    }}
                                >
                                    🕒 Missions Time
                                </button>
                                <button
                                    onClick={() => setActiveTab('tasks')}
                                    style={{
                                        textAlign: 'left', padding: '10px 14px', borderRadius: 12, fontSize: 14, fontWeight: 800, border: 'none', cursor: 'pointer',
                                        background: activeTab === 'tasks' ? 'rgba(165,125,255,0.15)' : 'transparent',
                                        color: activeTab === 'tasks' ? '#8050e0' : 'var(--mc-text-muted)',
                                    }}
                                >
                                    🧴 Missions Tasks
                                </button>
                                <button
                                    onClick={() => setActiveTab('rewards')}
                                    style={{
                                        textAlign: 'left', padding: '10px 14px', borderRadius: 12, fontSize: 14, fontWeight: 800, border: 'none', cursor: 'pointer',
                                        background: activeTab === 'rewards' ? 'rgba(165,125,255,0.15)' : 'transparent',
                                        color: activeTab === 'rewards' ? '#8050e0' : 'var(--mc-text-muted)',
                                    }}
                                >
                                    🎁 Rewards
                                </button>
                                <button
                                    onClick={() => setActiveTab('remote')}
                                    style={{
                                        textAlign: 'left', padding: '10px 14px', borderRadius: 12, fontSize: 14, fontWeight: 800, border: 'none', cursor: 'pointer',
                                        background: activeTab === 'remote' ? 'rgba(165,125,255,0.15)' : 'transparent',
                                        color: activeTab === 'remote' ? '#8050e0' : 'var(--mc-text-muted)',
                                    }}
                                >
                                    📱 Remote
                                </button>
                                <button
                                    onClick={() => setActiveTab('privileges')}
                                    style={{
                                        textAlign: 'left', padding: '10px 14px', borderRadius: 12, fontSize: 14, fontWeight: 800, border: 'none', cursor: 'pointer',
                                        background: activeTab === 'privileges' ? 'rgba(165,125,255,0.15)' : 'transparent',
                                        color: activeTab === 'privileges' ? '#8050e0' : 'var(--mc-text-muted)',
                                    }}
                                >
                                    🛡️ Privileges
                                </button>
                            </div>

                            {/* Content Area */}
                            <div style={{ flex: 1, overflowY: 'auto', padding: '24px 28px', display: 'flex', flexDirection: 'column', gap: 24 }}>
                                {activeTab === 'time' && (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
                                        {/* Morning Mission */}
                                        <section style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid rgba(160,150,230,0.2)', paddingBottom: 8 }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                                    <span style={{ fontSize: 18 }}>☀️</span>
                                                    <span style={{ fontSize: 13, fontWeight: 900, color: 'var(--mc-text)' }}>Morning Mission</span>
                                                </div>
                                                <motion.button
                                                    data-testid="mc-settings-start-morning"
                                                    whileTap={{ scale: 0.9 }}
                                                    onClick={() => {
                                                        dispatch({ type: 'SET_ACTIVE_MISSION', phase: 'morning' });
                                                        onClose();
                                                    }}
                                                    style={{
                                                        background: 'linear-gradient(135deg,#fff7d6,#ffe085)',
                                                        border: '1.5px solid #f7c948',
                                                        borderRadius: 10,
                                                        padding: '5px 14px',
                                                        fontSize: 12,
                                                        fontWeight: 900,
                                                        color: '#7a5800',
                                                        cursor: 'pointer',
                                                        fontFamily: "'Nunito', sans-serif",
                                                        boxShadow: '0 2px 0 #d4a800',
                                                    }}
                                                >
                                                    ▶ Start
                                                </motion.button>
                                            </div>
                                            <TimeInput label="Auto-trigger at" value={draft.morningStartsAt} onChange={v => set('morningStartsAt', v)} />
                                            <DurationStepper label="Duration" value={draft.morningDurationMins} onChange={v => set('morningDurationMins', v)} />
                                        </section>

                                        {/* Evening Mission */}
                                        <section style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid rgba(160,150,230,0.2)', paddingBottom: 8 }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                                    <span style={{ fontSize: 18 }}>🌙</span>
                                                    <span style={{ fontSize: 13, fontWeight: 900, color: 'var(--mc-text)' }}>Evening Mission</span>
                                                </div>
                                                <motion.button
                                                    data-testid="mc-settings-start-evening"
                                                    whileTap={{ scale: 0.9 }}
                                                    onClick={() => {
                                                        dispatch({ type: 'SET_ACTIVE_MISSION', phase: 'evening' });
                                                        onClose();
                                                    }}
                                                    style={{
                                                        background: 'linear-gradient(135deg,#ece8ff,#c8b8ff)',
                                                        border: '1.5px solid #a98dff',
                                                        borderRadius: 10,
                                                        padding: '5px 14px',
                                                        fontSize: 12,
                                                        fontWeight: 900,
                                                        color: '#3d2a80',
                                                        cursor: 'pointer',
                                                        fontFamily: "'Nunito', sans-serif",
                                                        boxShadow: '0 2px 0 #8060cc',
                                                    }}
                                                >
                                                    ▶ Start
                                                </motion.button>
                                            </div>
                                            <TimeInput label="Auto-trigger at" value={draft.eveningStartsAt} onChange={v => set('eveningStartsAt', v)} />
                                            <DurationStepper label="Duration" value={draft.eveningDurationMins} onChange={v => set('eveningDurationMins', v)} />
                                        </section>

                                        {/* Auto-Return to Calendar */}
                                        <section style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, borderBottom: '1px solid rgba(160,150,230,0.2)', paddingBottom: 8 }}>
                                                <span style={{ fontSize: 18 }}>⏱️</span>
                                                <span style={{ fontSize: 13, fontWeight: 900, color: 'var(--mc-text)' }}>Auto-Return to Calendar</span>
                                            </div>
                                            <AutoReturnStepper
                                                value={draft.autoReturnMins ?? 5}
                                                onChange={v => set('autoReturnMins', v)}
                                            />
                                        </section>
                                    </div>
                                )}

                                {activeTab === 'tasks' && (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
                                        {/* Routine Add-ons */}
                                        <section style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, borderBottom: '1px solid rgba(160,150,230,0.2)', paddingBottom: 8 }}>
                                                <span style={{ fontSize: 18 }}>🧴</span>
                                                <span style={{ fontSize: 13, fontWeight: 900, color: 'var(--mc-text)' }}>Routine Add-ons</span>
                                            </div>
                                            
                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                                <span style={{ fontSize: 14, fontWeight: 800, color: 'var(--mc-text)' }}>"Put on Cream"</span>
                                                <motion.button
                                                    whileTap={{ scale: 0.9 }}
                                                    onClick={() => set('creamTaskEnabled', !draft.creamTaskEnabled)}
                                                    style={{
                                                        width: 48, height: 26,
                                                        borderRadius: 99,
                                                        background: draft.creamTaskEnabled ? '#6de89e' : 'rgba(160,150,230,0.2)',
                                                        border: 'none',
                                                        position: 'relative',
                                                        cursor: 'pointer',
                                                    }}
                                                >
                                                    <motion.div
                                                        animate={{ x: draft.creamTaskEnabled ? 22 : 2 }}
                                                        transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                                                        style={{
                                                            width: 22, height: 22,
                                                            borderRadius: '50%',
                                                            background: '#fff',
                                                            boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
                                                            position: 'absolute', top: 2, left: 0,
                                                        }}
                                                    />
                                                </motion.button>
                                            </div>

                                            <AnimatePresence>
                                                {draft.creamTaskEnabled && (
                                                    <motion.div
                                                        initial={{ opacity: 0, height: 0 }}
                                                        animate={{ opacity: 1, height: 'auto' }}
                                                        exit={{ opacity: 0, height: 0 }}
                                                        style={{ overflow: 'hidden' }}
                                                    >
                                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginTop: 4 }}>
                                                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                                                <span style={{ fontSize: 10, fontWeight: 900, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--mc-text-muted)' }}>
                                                                    Schedule
                                                                </span>
                                                                <select 
                                                                    value={draft.creamTaskSchedule ?? 'evening'}
                                                                    onChange={e => set('creamTaskSchedule', e.target.value as 'morning' | 'evening' | 'both')}
                                                                    style={{
                                                                        fontFamily: "'Nunito', sans-serif",
                                                                        fontSize: 16, fontWeight: 700,
                                                                        padding: '8px 12px',
                                                                        borderRadius: 10,
                                                                        border: '1.5px solid rgba(130,120,200,0.25)',
                                                                        background: 'rgba(255,255,255,0.8)',
                                                                        color: 'var(--mc-text)',
                                                                        outline: 'none',
                                                                    }}
                                                                >
                                                                    <option value="morning">Morning Only</option>
                                                                    <option value="evening">Evening Only</option>
                                                                    <option value="both">Twice a Day</option>
                                                                </select>
                                                            </div>
                                                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                                                                    <span style={{ fontSize: 10, fontWeight: 900, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--mc-text-muted)' }}>
                                                                        Days Required
                                                                    </span>
                                                                    <span style={{ fontSize: 18, fontWeight: 900, color: 'var(--mc-text)', fontVariantNumeric: 'tabular-nums' }}>
                                                                        {draft.creamTaskDaysTarget}
                                                                    </span>
                                                                </div>
                                                                <input
                                                                    type="range"
                                                                    min={1}
                                                                    max={30}
                                                                    step={1}
                                                                    value={draft.creamTaskDaysTarget}
                                                                    onChange={e => set('creamTaskDaysTarget', Number(e.target.value))}
                                                                    style={{ width: '100%', accentColor: '#6de89e' }}
                                                                />
                                                            </div>
                                                        </div>
                                                    </motion.div>
                                                )}
                                            </AnimatePresence>
                                        </section>
                                    </div>
                                )}

                                {activeTab === 'rewards' && (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                                         <div style={{ display: 'flex', alignItems: 'center', gap: 6, borderBottom: '1px solid rgba(160,150,230,0.2)', paddingBottom: 8 }}>
                                            <span style={{ fontSize: 18 }}>🎁</span>
                                            <span style={{ fontSize: 13, fontWeight: 900, color: 'var(--mc-text)' }}>Reward Settings</span>
                                        </div>
                                        <p style={{ fontSize: 12, color: 'var(--mc-text-muted)'}}>Enable/disable rewards and set custom token targets.</p>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                                            {REWARDS.map(r => {
                                                const config = draft.rewardConfigs?.[r.id] ?? { enabled: true, targetCount: r.targetCount };
                                                return (
                                                    <div key={r.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(255,255,255,0.6)', padding: '10px 14px', borderRadius: 12, border: '1px solid rgba(160,150,230,0.2)' }}>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, width: 140 }}>
                                                            <span style={{ fontSize: 20 }}>{r.emoji}</span>
                                                            <span style={{ fontSize: 14, fontWeight: 800, color: 'var(--mc-text)' }}>{r.label}</span>
                                                        </div>
                                                        
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                                                <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--mc-text-muted)' }}>Tokens:</span>
                                                                <input 
                                                                    type="number"
                                                                    min={1}
                                                                    max={100}
                                                                    value={config.targetCount}
                                                                    onChange={e => {
                                                                        const val = Math.max(1, Number(e.target.value));
                                                                        set('rewardConfigs', { ...draft.rewardConfigs, [r.id]: { ...config, targetCount: val } });
                                                                    }}
                                                                    style={{
                                                                        width: 50, padding: '4px 8px', borderRadius: 8, border: '1.5px solid rgba(160,150,230,0.3)',
                                                                        fontFamily: "'Nunito', sans-serif", fontSize: 14, fontWeight: 800, color: 'var(--mc-text)',
                                                                        textAlign: 'center', outline: 'none', background: 'white'
                                                                    }}
                                                                />
                                                            </div>

                                                            <motion.button
                                                                whileTap={{ scale: 0.9 }}
                                                                onClick={() => {
                                                                    set('rewardConfigs', { ...draft.rewardConfigs, [r.id]: { ...config, enabled: !config.enabled } });
                                                                }}
                                                                style={{
                                                                    width: 44, height: 24,
                                                                    borderRadius: 99,
                                                                    background: config.enabled ? '#a57dff' : 'rgba(160,150,230,0.2)',
                                                                    border: 'none',
                                                                    position: 'relative',
                                                                    cursor: 'pointer',
                                                                }}
                                                            >
                                                                <motion.div
                                                                    animate={{ x: config.enabled ? 20 : 2 }}
                                                                    transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                                                                    style={{
                                                                        width: 20, height: 20,
                                                                        borderRadius: '50%',
                                                                        background: '#fff',
                                                                        boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
                                                                        position: 'absolute', top: 2, left: 0,
                                                                    }}
                                                                />
                                                            </motion.button>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}

                                {activeTab === 'remote' && (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                                         <div style={{ display: 'flex', alignItems: 'center', gap: 6, borderBottom: '1px solid rgba(160,150,230,0.2)', paddingBottom: 8 }}>
                                            <span style={{ fontSize: 18 }}>📱</span>
                                            <span style={{ fontSize: 13, fontWeight: 900, color: 'var(--mc-text)' }}>Remote Control Pairing</span>
                                        </div>
                                        
                                        <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start' }}>
                                            <div style={{ 
                                                background: 'white', 
                                                padding: 16, 
                                                borderRadius: 16, 
                                                boxShadow: '0 8px 24px rgba(130,110,200,0.15)',
                                                border: '1.5px solid rgba(130,110,200,0.1)'
                                            }}>
                                                {draft.remoteRoomId && draft.remoteKey ? (
                                                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
                                                        <QRCodeCanvas 
                                                            value={`https://mc-remote.vercel.app/?room=${draft.remoteRoomId}&key=${draft.remoteKey}`}
                                                            size={180}
                                                            level="H"
                                                            includeMargin={false}
                                                        />
                                                        <input 
                                                            type="text" 
                                                            readOnly 
                                                            value={`https://mc-remote.vercel.app/?room=${draft.remoteRoomId}&key=${draft.remoteKey}`}
                                                            onClick={(e) => {
                                                                (e.target as HTMLInputElement).select();
                                                                navigator.clipboard.writeText((e.target as HTMLInputElement).value);
                                                            }}
                                                            style={{
                                                                width: '100%',
                                                                fontSize: 10,
                                                                padding: '6px 8px',
                                                                borderRadius: 6,
                                                                border: '1px solid rgba(130,110,200,0.3)',
                                                                background: 'rgba(130,110,200,0.05)',
                                                                color: 'var(--mc-text-muted)',
                                                                fontFamily: 'monospace',
                                                                cursor: 'copy',
                                                                textAlign: 'center'
                                                            }}
                                                            title="Click to copy URL"
                                                        />
                                                    </div>
                                                ) : (
                                                    <div style={{ width: 180, height: 180, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--mc-text-muted)', fontSize: 12, textAlign: 'center' }}>
                                                        Keys not generated.<br/>Try restarting the app.
                                                    </div>
                                                )}
                                            </div>

                                            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 12 }}>
                                                <p style={{ fontSize: 14, lineHeight: 1.5, color: 'var(--mc-text)', fontWeight: 600 }}>
                                                    Scan this code with your phone's camera to open the remote control.
                                                </p>
                                                <ul style={{ fontSize: 12, color: 'var(--mc-text-muted)', paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 6 }}>
                                                    <li>Control tokens and missions from anywhere.</li>
                                                    <li>Trigger special animations (Fireworks!).</li>
                                                    <li>Secure pairing (keys are stored only on this device).</li>
                                                </ul>

                                                <div style={{ marginTop: 4, fontSize: 10, color: 'var(--mc-text-muted)', opacity: 0.7 }}>
                                                    Target: <span style={{ fontFamily: 'monospace' }}>mc-remote.vercel.app</span>
                                                </div>

                                                <motion.button
                                                    whileTap={{ scale: 0.95 }}
                                                    onClick={async () => {
                                                        if (window.ipcRenderer) {
                                                            const newKeys = await window.ipcRenderer.invoke('remote:regenerate') as { roomId: string; remoteKey: string };
                                                            setDraft(prev => ({ 
                                                                ...prev, 
                                                                remoteRoomId: newKeys.roomId, 
                                                                remoteKey: newKeys.remoteKey 
                                                            }));
                                                        }
                                                    }}
                                                    style={{
                                                        marginTop: 8,
                                                        background: 'rgba(255,100,100,0.1)',
                                                        border: '1.5px solid rgba(255,100,100,0.2)',
                                                        borderRadius: 10,
                                                        padding: '8px 16px',
                                                        fontSize: 12,
                                                        fontWeight: 800,
                                                        color: '#e74c3c',
                                                        cursor: 'pointer',
                                                        width: 'fit-content'
                                                    }}
                                                >
                                                    🔄 Regenerate Keys
                                                </motion.button>
                                            </div>
                                        </div>

                                        <div style={{ marginTop: 12, padding: 12, background: 'rgba(130,110,200,0.05)', borderRadius: 12, border: '1px dashed rgba(130,110,200,0.2)' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                                                <div style={{ width: 8, height: 8, borderRadius: '50%', background: remoteStatus === 'online' ? '#6de89e' : '#e74c3c' }} />
                                                <span style={{ fontSize: 11, fontWeight: 900, textTransform: 'uppercase', color: 'var(--mc-text-muted)' }}>Connection Status</span>
                                            </div>
                                            <span style={{ fontSize: 12, color: 'var(--mc-text)', fontWeight: 700 }}>
                                                {remoteStatus === 'online' ? 'Remote control connected.' : 'Remote control disconnected. Reconnecting...'}
                                            </span>
                                        </div>
                                    </div>
                                )}

                                {activeTab === 'privileges' && (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                                         <div style={{ display: 'flex', alignItems: 'center', gap: 6, borderBottom: '1px solid rgba(160,150,230,0.2)', paddingBottom: 8 }}>
                                            <span style={{ fontSize: 18 }}>🛡️</span>
                                            <span style={{ fontSize: 13, fontWeight: 900, color: 'var(--mc-text)' }}>Privilege Settings</span>
                                        </div>
                                        <p style={{ fontSize: 12, color: 'var(--mc-text-muted)', margin: 0, lineHeight: 1.4 }}>
                                            Manage child privilege suspensions. Click any card to suspend or reinstate.
                                        </p>
                                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
                                            {state.privileges.map(p => (
                                                <PrivilegeCardButton key={p.id} p={p} interactive={true} />
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Footer / Save */}
                        <div style={{ padding: '16px 24px', borderTop: '1px solid rgba(160,150,230,0.2)', background: 'rgba(255,255,255,0.4)', display: 'flex', justifyContent: 'flex-end' }}>
                            <motion.button
                                data-testid="mc-settings-save"
                                whileTap={{ scale: 0.95, y: 2 }}
                                whileHover={{ scale: 1.02 }}
                                onClick={save}
                                style={{
                                    background: 'linear-gradient(180deg,#b8a0ff,#9370ff)',
                                    border: '1.5px solid rgba(160,100,255,0.5)',
                                    borderRadius: 12,
                                    padding: '10px 24px',
                                    fontSize: 15,
                                    fontWeight: 900,
                                    color: '#fff',
                                    cursor: 'pointer',
                                    boxShadow: '0 4px 0 #7040cc, 0 6px 12px rgba(120,80,255,0.3)',
                                    fontFamily: "'Nunito', sans-serif",
                                    display: 'flex', alignItems: 'center', gap: 6,
                                }}
                            >
                                ✅ Save Settings
                            </motion.button>
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
