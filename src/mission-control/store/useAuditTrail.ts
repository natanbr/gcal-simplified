// ============================================================
// Mission Control — Durable Audit Trail Bridge
// ------------------------------------------------------------
// Mirrors every activity-log entry to an append-only file in the main process
// (electron/audit-log.ts). The in-app log is a 200-entry ring buffer inside the
// localStorage blob, and the log view has a CLEAR button — neither survives the
// question "what actually happened three days ago?".
//
// This bridge adds NO timer. It reacts to activityLogs changing, which is
// event-driven, so an idle Calendar view stays idle.
// ⚠️  Internal to src/mission-control/ only.
// ============================================================

import { useEffect, useRef } from 'react';
import type { MCState, ActivityLogEntry } from '../types';
import { sourceOf } from './activityLog';

/** Coalesce bursts (an action plus its log entry) into one disk write. */
const FLUSH_DEBOUNCE_MS = 1000;

/** Mirror of MAX_ENTRIES_PER_APPEND in electron/audit-log.ts — the main
 *  process truncates anything larger, so oversized flushes must be chunked
 *  here or their newest entries are silently lost. */
const MAX_BATCH = 100;

/** One id per app run — makes a double-instance era obvious in the file. */
const SESSION_ID = typeof self.crypto?.randomUUID === 'function'
    ? self.crypto.randomUUID().slice(0, 8)
    : String(Date.now());

interface AuditPayload {
    t: string;
    ev: string;
    src: 'local' | 'remote' | 'scheduler' | 'auto' | 'system';
    msg: string;
    d?: number;
    bank?: number;
    game?: number;
    total?: number;
    v?: string;
    sid: string;
}

function toPayload(log: ActivityLogEntry, appVersion: string): AuditPayload {
    return {
        t: log.timestamp,
        ev: log.type,
        src: sourceOf(log),
        // Strip the **bold** markers the in-app renderer uses.
        msg: log.message.replace(/\*\*/g, ''),
        ...(log.delta !== undefined ? { d: log.delta } : {}),
        ...(log.bankTokens !== undefined ? { bank: log.bankTokens } : {}),
        ...(log.gameTokens !== undefined ? { game: log.gameTokens } : {}),
        ...(log.totalTokens !== undefined ? { total: log.totalTokens } : {}),
        ...(appVersion ? { v: appVersion } : {}),
        sid: SESSION_ID,
    };
}

export function useAuditTrail(state: MCState): void {
    /** Ids already written to disk, so a re-render never duplicates a line. */
    const writtenIds = useRef<Set<string>>(new Set());
    /** Entries restored from localStorage were mirrored by the session that
     *  wrote them; re-appending them every launch would duplicate the trail.
     *  Seeding once at mount trades the previous session's unflushed tail
     *  (≤1s of entries, indistinguishable without persistent ids) for
     *  never double-writing history. */
    const seeded = useRef(false);
    const appVersion = useRef('');
    const pending = useRef<AuditPayload[]>([]);
    const flushTimer = useRef<ReturnType<typeof setTimeout>>();

    // Session marker — the anchor a parent scrolls back to when asking
    // "what happened after the app restarted?".
    useEffect(() => {
        if (!window.ipcRenderer) return;
        const ipc = window.ipcRenderer;

        let cancelled = false;
        (ipc.invoke('app:info') as Promise<{ version?: string }>)
            .then(info => {
                if (cancelled) return;
                appVersion.current = info?.version ?? '';
                ipc.invoke('audit:append', [{
                    t: new Date().toISOString(),
                    ev: 'SESSION_START',
                    src: 'system',
                    msg: 'App started',
                    v: appVersion.current,
                    sid: SESSION_ID,
                }]).catch(() => { /* best-effort */ });
            })
            .catch(() => { /* audit trail is best-effort; never break the app */ });

        return () => { cancelled = true; };
    }, []);

    useEffect(() => {
        const logs = state.activityLogs;
        if (!seeded.current) {
            seeded.current = true;
            if (logs) for (const log of logs) writtenIds.current.add(log.id);
            return;
        }
        if (!window.ipcRenderer) return;
        if (!logs || logs.length === 0) return;

        // activityLogs is newest-first; walk it oldest-first so the file reads
        // in chronological order.
        const fresh: AuditPayload[] = [];
        for (let i = logs.length - 1; i >= 0; i--) {
            const log = logs[i];
            if (writtenIds.current.has(log.id)) continue;
            writtenIds.current.add(log.id);
            fresh.push(toPayload(log, appVersion.current));
        }

        if (fresh.length === 0) return;
        pending.current.push(...fresh);

        clearTimeout(flushTimer.current);
        flushTimer.current = setTimeout(() => {
            const batch = pending.current;
            pending.current = [];
            for (let i = 0; i < batch.length; i += MAX_BATCH) {
                window.ipcRenderer?.invoke('audit:append', batch.slice(i, i + MAX_BATCH))
                    .catch(() => { /* best-effort */ });
            }
        }, FLUSH_DEBOUNCE_MS);
    }, [state.activityLogs]);

    // Bound the dedup set. The ring buffer holds 200 entries, so anything far
    // beyond that can never reappear in `activityLogs` and be double-written.
    useEffect(() => {
        if (writtenIds.current.size <= 1000) return;
        const live = new Set(state.activityLogs.map(l => l.id));
        writtenIds.current = live;
    }, [state.activityLogs]);

    // Flush whatever is still queued when the window goes away.
    useEffect(() => {
        return () => {
            clearTimeout(flushTimer.current);
            const batch = pending.current;
            pending.current = [];
            for (let i = 0; i < batch.length; i += MAX_BATCH) {
                window.ipcRenderer?.invoke('audit:append', batch.slice(i, i + MAX_BATCH)).catch(() => {});
            }
        };
    }, []);
}
