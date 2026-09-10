// ============================================================
// Drag metering for the dev-only PerformanceHUD: frame rate and how long the
// pointermove handler itself takes. Kept out of useShapeDrag so the gesture
// reads as gesture — this is instrumentation, not behaviour.
// ⚠️  Internal to src/mission-control/games/blocks/ only.
// ============================================================

export interface DragPerf {
    lastTickTime: number;
    ticks: number;
    fps: number;
    totalScriptTime: number;
    avgScriptTime: number;
}

export const freshPerf = (): DragPerf => ({
    lastTickTime: performance.now(),
    ticks: 0,
    fps: 60,
    totalScriptTime: 0,
    avgScriptTime: 0,
});

/**
 * Fold one handled pointermove into the running metrics. `start`/`end` bracket
 * the work, so `avgScriptTime` measures this handler and `fps` measures the
 * gap between moves — the browser's delivery rate, not the render rate.
 * Smoothed 90/10 so a single delayed event does not make the HUD flash red.
 */
export function recordDragTick(perf: DragPerf, start: number, end: number): void {
    perf.ticks += 1;
    perf.totalScriptTime += end - start;
    perf.avgScriptTime = perf.totalScriptTime / perf.ticks;

    const sinceLast = end - perf.lastTickTime;
    if (sinceLast > 0) perf.fps = perf.fps * 0.9 + (1000 / sinceLast) * 0.1;
    perf.lastTickTime = end;
}
