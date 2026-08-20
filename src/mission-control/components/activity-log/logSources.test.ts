// ============================================================
// Mission Control — daily roll-up used by the five-second summary strip
// ============================================================

import { describe, it, expect } from 'vitest';
import { summariseDay, sourceOf } from './logSources';
import type { ActivityLogEntry } from '../../types';

let seq = 0;
function entry(partial: Partial<ActivityLogEntry> = {}): ActivityLogEntry {
    return {
        id: `log-${seq++}`,
        timestamp: new Date().toISOString(),
        icon: '🪙',
        message: 'test',
        type: 'manual',
        ...partial,
    };
}

describe('sourceOf', () => {
    it('uses the explicit source when present', () => {
        expect(sourceOf(entry({ source: 'scheduler' }))).toBe('scheduler');
    });

    it('falls back to the legacy isRemote flag for entries written before attribution', () => {
        expect(sourceOf(entry({ isRemote: true }))).toBe('remote');
    });

    it('defaults to local', () => {
        expect(sourceOf(entry())).toBe('local');
    });
});

describe('summariseDay', () => {
    it('splits earned and spent from the deltas', () => {
        const s = summariseDay([
            entry({ delta: 3 }),
            entry({ delta: -1 }),
            entry({ delta: 2 }),
            entry({ delta: -4 }),
        ]);

        expect(s.earned).toBe(5);
        expect(s.spent).toBe(5);
        expect(s.net).toBe(0);
    });

    it('ignores entries from other days', () => {
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);

        const s = summariseDay([
            entry({ delta: 3 }),
            entry({ delta: 100, timestamp: yesterday.toISOString() }),
        ]);

        expect(s.earned).toBe(3);
        expect(s.total).toBe(1);
    });

    it('counts events per source', () => {
        const s = summariseDay([
            entry({ source: 'local' }),
            entry({ source: 'remote' }),
            entry({ source: 'remote' }),
            entry({ source: 'scheduler' }),
        ]);

        expect(s.bySource.local).toBe(1);
        expect(s.bySource.remote).toBe(2);
        expect(s.bySource.scheduler).toBe(1);
        expect(s.bySource.auto).toBe(0);
    });

    it('flags token movements that nobody triggered', () => {
        const s = summariseDay([
            entry({ delta: 2, source: 'local' }),      // a person — not unattended
            entry({ delta: 1, source: 'auto' }),       // the app itself
            entry({ delta: -1, source: 'scheduler' }), // the clock
            entry({ delta: 0, source: 'auto' }),       // no token movement — not counted
            entry({ source: 'scheduler' }),            // no delta at all — not counted
        ]);

        expect(s.unattended).toBe(2);
    });

    it('counts cheat-trap trips separately', () => {
        const s = summariseDay([
            entry({ type: 'cheat-attempt' }),
            entry({ type: 'cheat-attempt' }),
            entry({ type: 'manual' }),
        ]);

        expect(s.cheatAttempts).toBe(2);
    });

    it('returns a zeroed summary for an empty log', () => {
        const s = summariseDay([]);
        expect(s).toMatchObject({ earned: 0, spent: 0, net: 0, total: 0, unattended: 0, cheatAttempts: 0 });
    });
});
