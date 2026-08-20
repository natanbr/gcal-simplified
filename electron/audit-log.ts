// ============================================================
// Durable Audit Trail (main process)
// ------------------------------------------------------------
// The in-app activity log lives inside the renderer's localStorage blob
// (`mc-state-v5`). That blob is capped at 200 entries, is wiped by the CLEAR
// button in the log view, and — before the single-instance lock — could be
// clobbered wholesale by a second app instance.
//
// This file is the tamper-evident counterpart: an append-only NDJSON file in
// userData that the renderer can only APPEND to. There is no delete/clear IPC
// channel by design. It survives restarts, updates, localStorage resets and a
// kid pressing every button on the screen.
// ============================================================

import { app } from 'electron';
import path from 'node:path';
import fs from 'node:fs';

export interface AuditEntry {
    /** ISO timestamp of the event. */
    t: string;
    /** Machine-readable event key, e.g. 'ADD_TOKENS' or 'MISSION_START'. */
    ev: string;
    /** Where the event came from. */
    src: 'local' | 'remote' | 'scheduler' | 'auto' | 'system';
    /** Human-readable one-liner. */
    msg: string;
    /** Bank-token delta, when the event moved tokens. */
    d?: number;
    /** Bank / game / total token balances *after* the event. */
    bank?: number;
    game?: number;
    total?: number;
    /** App version + renderer session id — makes double-instance eras obvious. */
    v?: string;
    sid?: string;
}

/** Hard caps. The renderer is not trusted; everything is clamped here. */
const MAX_ENTRIES_PER_APPEND = 100;
const MAX_STRING_LEN = 400;
const MAX_FILE_BYTES = 4 * 1024 * 1024; // 4 MB, then rotate
const VALID_SOURCES = new Set<AuditEntry['src']>(['local', 'remote', 'scheduler', 'auto', 'system']);

function clampString(value: unknown, fallback = ''): string {
    if (typeof value !== 'string') return fallback;
    return value.slice(0, MAX_STRING_LEN);
}

function clampNumber(value: unknown): number | undefined {
    if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
    return Math.round(value * 100) / 100;
}

/**
 * Rebuilds an untrusted renderer payload into a known-shape entry. Unknown keys
 * are dropped rather than spread through — the renderer cannot smuggle fields
 * (or unbounded strings) into the file.
 */
function sanitize(raw: unknown): AuditEntry | null {
    if (!raw || typeof raw !== 'object') return null;
    const input = raw as Record<string, unknown>;

    const ev = clampString(input.ev);
    if (!ev) return null;

    const parsedTime = typeof input.t === 'string' ? new Date(input.t) : new Date(NaN);
    const t = Number.isNaN(parsedTime.getTime()) ? new Date().toISOString() : parsedTime.toISOString();

    const src = VALID_SOURCES.has(input.src as AuditEntry['src'])
        ? (input.src as AuditEntry['src'])
        : 'system';

    const entry: AuditEntry = { t, ev, src, msg: clampString(input.msg) };

    const d = clampNumber(input.d);
    if (d !== undefined) entry.d = d;
    const bank = clampNumber(input.bank);
    if (bank !== undefined) entry.bank = bank;
    const game = clampNumber(input.game);
    if (game !== undefined) entry.game = game;
    const total = clampNumber(input.total);
    if (total !== undefined) entry.total = total;

    const v = clampString(input.v);
    if (v) entry.v = v;
    const sid = clampString(input.sid);
    if (sid) entry.sid = sid;

    return entry;
}

class AuditLog {
    private cachedPath = '';

    /** `<userData>/audit-log.ndjson` — resolved lazily so tests can run headless. */
    filePath(): string {
        if (!this.cachedPath) {
            this.cachedPath = path.join(app.getPath('userData'), 'audit-log.ndjson');
        }
        return this.cachedPath;
    }

    private rotateIfNeeded(): void {
        try {
            const p = this.filePath();
            if (!fs.existsSync(p)) return;
            if (fs.statSync(p).size < MAX_FILE_BYTES) return;
            // Keep exactly one previous generation. Two files bound disk use at
            // ~8 MB while still covering months of real usage.
            fs.rmSync(`${p}.1`, { force: true });
            fs.renameSync(p, `${p}.1`);
        } catch (e) {
            console.error('[AuditLog] Rotation failed:', e);
        }
    }

    /** Appends sanitized entries. Returns how many were actually written. */
    append(rawEntries: unknown): number {
        const list = Array.isArray(rawEntries) ? rawEntries : [rawEntries];
        const entries = list
            .slice(0, MAX_ENTRIES_PER_APPEND)
            .map(sanitize)
            .filter((e): e is AuditEntry => e !== null);

        if (entries.length === 0) return 0;

        try {
            this.rotateIfNeeded();
            const payload = entries.map(e => JSON.stringify(e)).join('\n') + '\n';
            fs.appendFileSync(this.filePath(), payload, 'utf-8');
            return entries.length;
        } catch (e) {
            console.error('[AuditLog] Append failed:', e);
            return 0;
        }
    }

    /**
     * Reads back the most recent entries, newest first. Reads the rotated
     * generation too when the live file alone cannot satisfy `limit`.
     */
    read(limit = 500): AuditEntry[] {
        const safeLimit = Math.max(1, Math.min(5000, Math.floor(limit) || 500));
        const p = this.filePath();
        const lines: string[] = [];

        for (const candidate of [p, `${p}.1`]) {
            if (lines.length >= safeLimit) break;
            try {
                if (!fs.existsSync(candidate)) continue;
                const fileLines = fs.readFileSync(candidate, 'utf-8').split('\n').filter(Boolean);
                // Newest lines are at the end of each file.
                lines.push(...fileLines.reverse());
            } catch (e) {
                console.error('[AuditLog] Read failed:', e);
            }
        }

        return lines
            .slice(0, safeLimit)
            .map(line => {
                try {
                    return JSON.parse(line) as AuditEntry;
                } catch {
                    return null;
                }
            })
            .filter((e): e is AuditEntry => e !== null);
    }
}

export const auditLog = new AuditLog();
