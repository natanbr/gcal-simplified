// ============================================================
// Shared by the diagnostics folder suites (diagnostics*.test.ts). Not a test
// file: the electron mock and the module reset stay in each suite, since
// vi.mock is hoisted per file.
// ============================================================

import fs from 'node:fs';
import path from 'node:path';

export type Handler = (...args: unknown[]) => Promise<unknown>;

/** Calls a registered ipcMain.handle handler the way Electron does: the event first. */
export function invokeHandler(handlers: Map<string, Handler>, channel: string, ...args: unknown[]): Promise<unknown> {
    const handler = handlers.get(channel);
    if (!handler) throw new Error(`no handler for ${channel}`);
    return handler({ sender: {} }, ...args);
}

/** Every file under `dir`, as POSIX paths relative to it, sorted. */
export function filesUnder(dir: string, prefix = ''): string[] {
    if (!fs.existsSync(dir)) return [];
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => entry.isDirectory()
        ? filesUnder(path.join(dir, entry.name), `${prefix}${entry.name}/`)
        : [`${prefix}${entry.name}`]).sort();
}

export function ndjson(file: string): Record<string, unknown>[] {
    return fs.readFileSync(file, 'utf-8').split('\n').filter(Boolean).map(line => JSON.parse(line));
}

/** A trace as GoalPedestal sends it when the picker opens. */
export const TRACE = {
    event: 'picker-open', caseId: 0, shownRewards: ['story-points', 'game', 'quick-game'],
    nowIso: '2026-09-02T12:00:00.000Z', tzOffsetMins: 120, nowMins: 840, today: '2026-09-02',
    gameTokens: 1, rewardEnabled: true, moodWind: 0, activeMission: 'none',
    eveningStartsAt: '19:00', eveningStartMins: 1140, lastCompletedOrFailedMorningDate: '2026-09-02',
    economyLocked: false, windowOpen: true, pickerVisible: true, useEnabled: true,
};

export function makeError(code: string): Error {
    return Object.assign(new Error(`${code}: operation failed`), { code });
}
