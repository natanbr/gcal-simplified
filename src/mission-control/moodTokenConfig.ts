// ============================================================
// Mission Control — Mood Token Config (Single Source of Truth)
// Defines the visual identity of "mood tokens" across the app.
// Used by: GameTokenPanel, GoalPedestal, GameSelectorOverlay
// ⚠️  Internal to src/mission-control/ only.
// ============================================================

export const MOOD_TOKEN = {
    emoji: '😊',
    label: 'Mood Token',
    filledGradient: 'radial-gradient(circle at 35% 32%, #6ee7b7, #10B981 60%, #047857)',
    filledBorder: '2px solid #10B981',
    filledShadow: '0 2px 8px rgba(16,185,129,0.4)',
    emptyBg: 'rgba(16,185,129,0.08)',
    emptyBorder: '2px dashed rgba(16,185,129,0.25)',
    accentColor: '#10B981',
    darkColor: '#047857',
} as const;
