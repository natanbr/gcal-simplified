// ============================================================
// Durable audit trail — sanitisation and round-trip.
//
// The renderer is not trusted: it can be driven by a tampered remote payload or
// a stale build. Everything it sends must be rebuilt into a known shape before
// it reaches disk.
// ============================================================

import { describe, it, expect, beforeEach, afterEach, afterAll, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'audit-log-test-'));
// The per-test hooks delete only the two ndjson files — without this, every
// unit-test run leaked one empty audit-log-test-* directory in the OS temp dir.
afterAll(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

vi.mock('electron', () => ({
    app: { getPath: () => tmpDir },
}));

const { auditLog } = await import('./audit-log');

describe('auditLog', () => {
    beforeEach(() => {
        fs.rmSync(auditLog.filePath(), { force: true });
        fs.rmSync(`${auditLog.filePath()}.1`, { force: true });
    });

    afterEach(() => {
        fs.rmSync(auditLog.filePath(), { force: true });
        fs.rmSync(`${auditLog.filePath()}.1`, { force: true });
    });

    it('appends entries and reads them back newest-first', () => {
        auditLog.append([
            { t: '2026-08-19T10:00:00.000Z', ev: 'ADD_TOKENS', src: 'local', msg: 'first', d: 2, bank: 5 },
            { t: '2026-08-19T11:00:00.000Z', ev: 'ADD_TOKENS', src: 'remote', msg: 'second', d: 1, bank: 6 },
        ]);

        const read = auditLog.read();
        expect(read).toHaveLength(2);
        expect(read[0].msg).toBe('second');
        expect(read[1].msg).toBe('first');
        expect(read[0].src).toBe('remote');
    });

    it('survives across appends (append-only, never truncating)', () => {
        auditLog.append([{ t: '2026-08-19T10:00:00.000Z', ev: 'A', src: 'local', msg: 'one' }]);
        auditLog.append([{ t: '2026-08-19T10:01:00.000Z', ev: 'B', src: 'local', msg: 'two' }]);

        expect(auditLog.read()).toHaveLength(2);
    });

    it('drops unknown fields instead of spreading them through', () => {
        auditLog.append([{
            t: '2026-08-19T10:00:00.000Z',
            ev: 'ADD_TOKENS',
            src: 'local',
            msg: 'ok',
            evil: 'should not survive',
            __proto__: { polluted: true },
        }]);

        const [entry] = auditLog.read();
        expect(entry).not.toHaveProperty('evil');
        expect(Object.keys(entry).sort()).toEqual(['ev', 'msg', 'src', 't']);
    });

    it('coerces an unknown source to system rather than trusting it', () => {
        auditLog.append([{ t: '2026-08-19T10:00:00.000Z', ev: 'X', src: 'administrator', msg: 'hi' }]);
        expect(auditLog.read()[0].src).toBe('system');
    });

    it('rejects entries with no event key', () => {
        expect(auditLog.append([{ src: 'local', msg: 'no ev' }])).toBe(0);
        expect(auditLog.read()).toHaveLength(0);
    });

    it('substitutes now for an invalid timestamp', () => {
        auditLog.append([{ t: 'not-a-date', ev: 'X', src: 'local', msg: 'hi' }]);
        expect(Number.isNaN(new Date(auditLog.read()[0].t).getTime())).toBe(false);
    });

    it('truncates oversized strings so one payload cannot bloat the file', () => {
        auditLog.append([{ t: '2026-08-19T10:00:00.000Z', ev: 'X', src: 'local', msg: 'x'.repeat(10_000) }]);
        expect(auditLog.read()[0].msg.length).toBeLessThanOrEqual(400);
    });

    it('caps how many entries a single append may write', () => {
        const many = Array.from({ length: 500 }, (_, i) => ({
            t: '2026-08-19T10:00:00.000Z', ev: 'X', src: 'local', msg: `m${i}`,
        }));
        expect(auditLog.append(many)).toBe(100);
    });

    it('never writes a newline that could forge a second record', () => {
        auditLog.append([{ t: '2026-08-19T10:00:00.000Z', ev: 'X', src: 'local', msg: 'a\n{"ev":"FORGED"}' }]);
        const lines = fs.readFileSync(auditLog.filePath(), 'utf-8').split('\n').filter(Boolean);
        expect(lines).toHaveLength(1);
        expect(auditLog.read()).toHaveLength(1);
    });

    it('returns an empty list when nothing has been written yet', () => {
        expect(auditLog.read()).toEqual([]);
    });
});
