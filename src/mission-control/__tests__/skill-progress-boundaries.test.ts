// ============================================================
// Skill progress — structural boundary pins (source-reading
// tests, timer-registry style). What these protect:
//   1. skillProgress must NEVER ride the remote broadcast — the
//      hand-built projection in useRemoteSync would ship ~68KB
//      (caps-saturated) per answered question if someone added it.
//   2. Reading content/data stays inside games/quiz/reading/ —
//      the curated word bank is the quiz module's private data.
// verifiedRedBy: adding `state.skillProgress` to useRemoteSync's
// payload (1) and importing wordBank from a component outside
// games/quiz (2) — both made the relevant test fail.
// ============================================================

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const srcRoot = resolve(here, '..', '..');

function walk(dir: string, out: string[] = []): string[] {
    for (const name of readdirSync(dir)) {
        const full = join(dir, name);
        if (statSync(full).isDirectory()) walk(full, out);
        else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(full);
    }
    return out;
}

describe('skill-progress boundaries', () => {
    it('keeps skillProgress out of the remote-sync broadcast', () => {
        const source = readFileSync(
            join(srcRoot, 'mission-control', 'store', 'useRemoteSync.ts'),
            'utf-8',
        );
        // Comments explaining the exclusion are fine; a real reference
        // (`state.skillProgress` / `stateRef.current.skillProgress`) is not.
        const references = [...source.matchAll(/\b(?:state|current)\s*\.\s*skillProgress/g)];
        expect(
            references,
            'useRemoteSync references skillProgress — the slice must never enter the payload ' +
            'or the dependency list (~45KB per answered question over Supabase).'
        ).toEqual([]);
    });

    it('keeps the reading word bank private to games/quiz', () => {
        const offenders: string[] = [];
        for (const file of walk(join(srcRoot, 'mission-control'))) {
            const rel = relative(srcRoot, file).replace(/\\/g, '/');
            if (rel.startsWith('mission-control/games/quiz/')) continue;
            const source = readFileSync(file, 'utf-8');
            if (/from\s+'[^']*games\/quiz\/reading\//.test(source)) offenders.push(rel);
        }
        expect(
            offenders,
            'Reading content is quiz-internal data; other modules go through the engine.'
        ).toEqual([]);
    });
});
