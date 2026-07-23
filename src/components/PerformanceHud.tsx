// ============================================================
// Global Performance HUD (opt-in profiling tool)
// ------------------------------------------------------------
// Bottom-right readout for both the Calendar and Mission Control views
// (and during games). Colour is the primary signal — green / yellow /
// orange / red — so it's readable at a glance without parsing the numbers.
//
// ⚠️  OFF by default. A live FPS meter needs a continuous 60fps
// requestAnimationFrame loop; that loop, by requesting a frame every
// ~16ms, keeps the CPU/GPU awake and would make the Calendar view busy
// even when the user is idle — directly violating the app's idle-Calendar
// performance invariant (see docs/performance.md, CLAUDE.md → Performance).
// It also makes idle FPS read a misleading ~60 instead of ~0. So it must
// be explicitly enabled when profiling rather than run for every user.
//
// Metrics (all derived from a SINGLE requestAnimationFrame loop, so it
// adds no setInterval and pushes to React state only ~once per second):
//   • FPS   — frames/sec. Drops when the main thread is busy.
//   • JANK  — worst single frame time (ms) in the last second. The best
//             "did the UI hitch/freeze" signal.
//   • MEM   — JS heap in use (MB), coloured by fraction of the heap limit.
//
// Enable: run `localStorage.setItem('perf-hud','on')` then reload
// (no rebuild needed). Remove the key / set anything else to hide it.
// ============================================================

import { useEffect, useRef, useState } from 'react';

type Grade = 'good' | 'ok' | 'warn' | 'bad';

const GRADE_COLOR: Record<Grade, string> = {
    good: '#22c55e', // green
    ok: '#eab308',   // yellow
    warn: '#f97316', // orange
    bad: '#ef4444',  // red
};

/** Grade a value against 3 ascending cut-offs. `higherIsBetter` flips the scale (used for FPS). */
function grade(value: number, cuts: [number, number, number], higherIsBetter = false): Grade {
    const [a, b, c] = cuts;
    if (higherIsBetter) {
        if (value >= a) return 'good';
        if (value >= b) return 'ok';
        if (value >= c) return 'warn';
        return 'bad';
    }
    if (value < a) return 'good';
    if (value < b) return 'ok';
    if (value < c) return 'warn';
    return 'bad';
}

interface HeapMemory {
    usedJSHeapSize: number;
    jsHeapSizeLimit: number;
}

interface Metrics {
    fps: number;
    jank: number;
    memMB: number;
    memGrade: Grade;
    hasMem: boolean;
}

function Chip({ label, value, color }: { label: string; value: string; color: string }) {
    return (
        <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 4 }}>
            <span style={{ color: 'rgba(226,232,240,0.55)' }}>{label}</span>
            <span style={{ color, fontWeight: 900 }}>{value}</span>
        </span>
    );
}

export function PerformanceHud() {
    const [enabled] = useState(() => {
        try {
            // Opt-in: only run (and thus only spin up the 60fps rAF loop) when
            // explicitly enabled for profiling. Default off keeps the idle
            // Calendar view genuinely idle.
            return localStorage.getItem('perf-hud') === 'on';
        } catch {
            return false;
        }
    });

    const [m, setM] = useState<Metrics>({ fps: 0, jank: 0, memMB: 0, memGrade: 'good', hasMem: false });
    const rafRef = useRef<number>();

    useEffect(() => {
        if (!enabled) return;

        const memApi = (performance as unknown as { memory?: HeapMemory }).memory;

        let frames = 0;
        let maxDelta = 0;
        let last = performance.now();
        let windowStart = last;

        const loop = (now: number) => {
            const delta = now - last;
            last = now;
            // Ignore multi-second gaps: the loop was paused (window hidden /
            // machine asleep), which is not real UI jank.
            if (delta < 2000 && delta > maxDelta) maxDelta = delta;
            frames++;

            const elapsed = now - windowStart;
            if (elapsed >= 1000) {
                const used = memApi ? memApi.usedJSHeapSize : 0;
                const limit = memApi ? memApi.jsHeapSizeLimit : 0;
                const ratio = limit ? used / limit : 0;
                setM({
                    fps: Math.round((frames * 1000) / elapsed),
                    jank: Math.round(maxDelta),
                    memMB: Math.round(used / 1048576),
                    memGrade: grade(ratio, [0.6, 0.75, 0.9]),
                    hasMem: !!memApi,
                });
                frames = 0;
                maxDelta = 0;
                windowStart = now;
            }
            rafRef.current = requestAnimationFrame(loop);
        };

        rafRef.current = requestAnimationFrame(loop);
        return () => {
            if (rafRef.current) cancelAnimationFrame(rafRef.current);
        };
    }, [enabled]);

    if (!enabled) return null;

    const fpsGrade = grade(m.fps, [55, 40, 25], true);
    const jankGrade = grade(m.jank, [50, 150, 400]);
    const grades: Grade[] = [fpsGrade, jankGrade, ...(m.hasMem ? [m.memGrade] : [])];

    // Worst grade drives the panel's own border/glow, so trouble is visible
    // peripherally without reading the numbers.
    const rank: Record<Grade, number> = { good: 0, ok: 1, warn: 2, bad: 3 };
    const worst = grades.reduce((w, g) => (rank[g] > rank[w] ? g : w), 'good' as Grade);
    const alert = worst === 'warn' || worst === 'bad';
    const worstColor = GRADE_COLOR[worst];

    return (
        <div
            aria-hidden
            style={{
                position: 'fixed',
                bottom: 8,
                right: 8,
                zIndex: 2147483000, // above every overlay, notification and game
                display: 'flex',
                gap: 12,
                alignItems: 'baseline',
                padding: '5px 12px',
                borderRadius: 12,
                background: 'rgba(15,23,42,0.82)',
                border: `1px solid ${alert ? worstColor : 'rgba(255,255,255,0.12)'}`,
                boxShadow: alert
                    ? `0 0 0 1px ${worstColor}, 0 0 14px ${worstColor}77`
                    : '0 4px 14px rgba(0,0,0,0.35)',
                backdropFilter: 'blur(6px)',
                fontFamily: 'monospace',
                fontSize: 11,
                fontWeight: 700,
                lineHeight: 1,
                letterSpacing: '0.02em',
                pointerEvents: 'none', // never intercept clicks on the app
                userSelect: 'none',
                transition: 'border-color 0.3s, box-shadow 0.3s',
            }}
        >
            <Chip label="FPS" value={`${m.fps}`} color={GRADE_COLOR[fpsGrade]} />
            <Chip label="JANK" value={`${m.jank}ms`} color={GRADE_COLOR[jankGrade]} />
            {m.hasMem && <Chip label="MEM" value={`${m.memMB}MB`} color={GRADE_COLOR[m.memGrade]} />}
        </div>
    );
}
