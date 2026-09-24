// ============================================================
// Who may name an action — structural pins (source-reading test).
// ------------------------------------------------------------
// Some actions must have exactly one way in. A behavioural test cannot catch a
// NEW dispatcher: it is, by definition, code no existing test drives. So this
// walks every production file under src/ and electron/ and lists the files
// that contain the action's type as a string literal, comments stripped. A
// literal is enough to dispatch it (directly, or through a constant), so the
// listed files ARE the ways in, and each list below is exact: a file that stops
// naming the action must leave its list too, so the lists never pad.
//
// verifiedRedBy (proven 2026-09-24 in this worktree):
//   - SETTLE_GAME_TOKEN_CAP: add `dispatch({ type: 'SETTLE_GAME_TOKEN_CAP' })`
//     to useSuspensionExpiry.ts → the case names store/useSuspensionExpiry.ts.
//   - CANCEL_MISSION: the Minimize long-press dispatch as it stood at 777c53b →
//     names components/MissionOverlay.tsx; `export const STOP_TYPE =
//     "CANCEL_MISSION"` in MissionTimerDisplay.tsx → names that file, while
//     the same dispatch inside a comment alone stays green.
// ============================================================

import { describe, it, expect } from 'vitest';
import { productionSources, readSource, stripComments, toRepoPath } from './helpers/sourceFiles';

const SOURCES = productionSources(['src', 'electron']).map(f => ({ path: toRepoPath(f), code: stripComments(readSource(f)) }));

/** Whether comment-free code contains the action type as a quoted string literal. */
function namesAction(code: string, actionType: string): boolean {
    return new RegExp(`(['"\`])${actionType}\\1`).test(code);
}

const filesNaming = (actionType: string) => SOURCES.filter(f => namesAction(f.code, actionType)).map(f => f.path).sort();

const MC = 'src/mission-control/';

describe('action literal boundaries', () => {
    it('is actually scanning the codebase', () => {
        expect(SOURCES.length, 'the file walk found nothing — every case would pass vacuously').toBeGreaterThan(80);
    });

    it('recognises a literal in any quoting, and a comment in none', () => {
        const names = (src: string) => namesAction(stripComments(src), 'X_ACTION');
        expect(names("dispatch({ type: 'X_ACTION' });")).toBe(true);
        expect(names('dispatch({\n    type: "X_ACTION",\n});')).toBe(true);
        expect(names('const t = `X_ACTION`; dispatch({ type: t });')).toBe(true);
        expect(names("// dispatch({ type: 'X_ACTION' })")).toBe(false);
        expect(names("/* type: 'X_ACTION' */")).toBe(false);
        expect(names("dispatch({ type: 'X_ACTION_MORE' });")).toBe(false);
    });

    it('SETTLE_GAME_TOKEN_CAP is dispatched only by the settle at load', () => {
        // The removal is logged because it is dispatched through the interceptor
        // at load, once. A second way in (a remote button, a timer) would remove
        // tokens under a message that says "at load".
        expect(filesNaming('SETTLE_GAME_TOKEN_CAP')).toEqual([
            `${MC}store/activityLog.ts`, // its log line
            `${MC}store/mcReducer.ts`, // the case
            `${MC}store/useGameTokenCapSettle.ts`, // the one dispatcher
            `${MC}types.ts`, // the union member
        ]);
    });

    it('CANCEL_MISSION reaches the store only from the phone: no desktop control stops a mission', () => {
        // A stop sticks for the rest of the window and does not move the shield,
        // so a desktop gesture let the child end a mission (decision 2026-09-24).
        // The phone's Stop arrives through useRemoteControl's allowlist.
        expect(filesNaming('CANCEL_MISSION')).toEqual([
            `${MC}hooks/useRemoteControl.ts`, // REMOTE_ALLOWED_ACTIONS: the phone's Stop
            `${MC}store/activityLog.ts`, // its log line
            `${MC}store/mcReducer.ts`, // the case, and the cream-task resync list
            `${MC}types.ts`, // the union member
        ]);
    });
});
