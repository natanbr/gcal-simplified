// ============================================================
// Quiz Lab — shared style atoms (dev only)
// Every colour here is an --mc-* token or a neutral rgba(): the
// lab is a DOM surface, so the no-raw-hex rule applies in full.
// ⚠️  Internal to src/mission-control/ only.
// ============================================================

import type { CSSProperties } from 'react';

export const MONO = "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";

export const panel: CSSProperties = {
    background: 'var(--mc-surface)',
    border: '1px solid var(--mc-border)',
    borderRadius: 18,
    padding: 18,
    boxShadow: 'var(--mc-depth-shadow)',
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
    minWidth: 0,
};

export const panelTitle: CSSProperties = {
    fontSize: 12,
    fontWeight: 900,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    color: 'var(--mc-text-muted)',
};

export const mutedNote: CSSProperties = {
    fontSize: 12,
    color: 'var(--mc-text-muted)',
    lineHeight: 1.5,
};

export const codeText: CSSProperties = {
    fontFamily: MONO,
    fontSize: 12,
    color: 'var(--mc-text)',
};

export function chip(active: boolean): CSSProperties {
    return {
        appearance: 'none',
        border: `2px solid ${active ? 'var(--mc-purple)' : 'var(--mc-border)'}`,
        background: active ? 'var(--mc-purple)' : 'var(--mc-surface-raised)',
        color: active ? 'var(--mc-surface)' : 'var(--mc-text)',
        borderRadius: 12,
        padding: '8px 14px',
        fontFamily: "'Nunito', sans-serif",
        fontSize: 14,
        fontWeight: 800,
        cursor: 'pointer',
        boxShadow: active ? 'none' : 'var(--mc-btn-shadow)',
    };
}

export const actionButton: CSSProperties = {
    ...chip(false),
    background: 'var(--mc-mint)',
    borderColor: 'var(--mc-border-bright)',
};

/** A horizontal bar row: label · track · count. Used by both distributions. */
export const barTrack: CSSProperties = {
    flex: 1,
    height: 12,
    borderRadius: 6,
    background: 'rgba(130, 120, 200, 0.12)',
    overflow: 'hidden',
};

export function barFill(share: number, color: string): CSSProperties {
    return {
        width: `${Math.max(share * 100, share > 0 ? 2 : 0)}%`,
        height: '100%',
        borderRadius: 6,
        background: color,
    };
}

/** Chart palette — the parent Learning view's CVD-validated triple. */
export const SERIES = ['var(--mc-chart-violet)', 'var(--mc-chart-teal)', 'var(--mc-chart-rust)'];
