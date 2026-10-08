// ============================================================
// Who may name an action — structural pins (source-reading test).
// ------------------------------------------------------------
// Some actions must have exactly one way in. A behavioural test cannot catch a
// NEW dispatcher: it is, by definition, code no existing test drives. So this
// walks every production file under src/ and electron/ and lists the files
// that contain the action's type as a string literal. A literal is enough to
// dispatch it (directly, or through a constant), so the listed files ARE the
// ways in, and each list below is exact: a file that stops naming the action
// must leave its list too, so the lists never pad.
//
// The literals come from the TypeScript parser, not from a comment stripper.
// stripComments (helpers/sourceFiles.ts) reads the apostrophe in JSX text
// ("It's time for your", MissionOverlay.tsx) as a string opener, and from there
// on comments counted as code: a comment naming 'CANCEL_MISSION' near Minimize
// turned this guard red (review of 985592f, 2026-09-28). The parser tells JSX
// text, comments, regexes and strings apart.
//
// verifiedRedBy:
//   - SETTLE_GAME_TOKEN_CAP: add `dispatch({ type: 'SETTLE_GAME_TOKEN_CAP' })`
//     to useSuspensionExpiry.ts → the case names store/useSuspensionExpiry.ts.
//   - CANCEL_MISSION: the Minimize long-press dispatch as it stood at 777c53b →
//     names components/MissionOverlay.tsx; `export const STOP_TYPE =
//     "CANCEL_MISSION"` in MissionTimerDisplay.tsx → names that file, while
//     the same dispatch inside a comment alone stays green.
//   (Both proven 2026-09-24, re-proven on the parser 2026-09-28.)
//   - The parser itself: `{/* never 'CANCEL_MISSION' here */}` above Minimize
//     in MissionOverlay.tsx turned the stripComments version red (it named
//     MissionOverlay.tsx) and leaves this one green; the JSX-apostrophe case
//     below is red on the stripComments version (2026-09-28).
// ============================================================

import { describe, it, expect } from 'vitest';
import ts from 'typescript';
import { productionSources, readSource, toRepoPath } from './helpers/sourceFiles';

/** Whether the source contains the action type as a whole string literal: 'x', "x" or `x`. */
function namesAction(source: string, actionType: string, fileName = 'file.tsx'): boolean {
    if (!source.includes(actionType)) return false; // most files never mention it: skip the parse
    const kind = fileName.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
    const file = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, false, kind);
    let found = false;
    const visit = (node: ts.Node): void => {
        if (found) return;
        if ((ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) && node.text === actionType) {
            found = true;
            return;
        }
        ts.forEachChild(node, visit);
    };
    visit(file);
    return found;
}

const SOURCES = productionSources(['src', 'electron']).map(f => ({ path: toRepoPath(f), code: readSource(f) }));

const filesNaming = (actionType: string) =>
    SOURCES.filter(f => namesAction(f.code, actionType, f.path)).map(f => f.path).sort();

const MC = 'src/mission-control/';

describe('action literal boundaries', () => {
    it('is actually scanning the codebase', () => {
        expect(SOURCES.length, 'the file walk found nothing — every case would pass vacuously').toBeGreaterThan(80);
    });

    it('recognises a literal in any quoting, and a comment in none', () => {
        const names = (src: string) => namesAction(src, 'X_ACTION');
        expect(names("dispatch({ type: 'X_ACTION' });")).toBe(true);
        expect(names('dispatch({\n    type: "X_ACTION",\n});')).toBe(true);
        expect(names('const t = `X_ACTION`; dispatch({ type: t });')).toBe(true);
        expect(names("// dispatch({ type: 'X_ACTION' })")).toBe(false);
        expect(names("/* type: 'X_ACTION' */")).toBe(false);
        expect(names("dispatch({ type: 'X_ACTION_MORE' });")).toBe(false);
    });

    it('reads JSX text with an apostrophe as text, not as a string opener', () => {
        const jsx = "const V = () => <p>It's time</p>;\n";
        expect(namesAction(`${jsx}// dispatch({ type: 'X_ACTION' })`, 'X_ACTION')).toBe(false);
        expect(namesAction(`${jsx}const V2 = () => <p>{/* type: 'X_ACTION' */}</p>;`, 'X_ACTION')).toBe(false);
        expect(namesAction(`${jsx}dispatch({ type: 'X_ACTION' });`, 'X_ACTION')).toBe(true);
        expect(namesAction("const V = () => <p>{'X_ACTION'}</p>;", 'X_ACTION'), 'a literal inside JSX is a literal').toBe(true);
        expect(namesAction('const V = () => <p>X_ACTION</p>;', 'X_ACTION'), 'bare JSX text is not').toBe(false);
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

    it('END_STALE_MISSION_RUN is dispatched only by the end at load', () => {
        // It ends a mission with no outcome, under a message that says "at
        // startup". A second way in (a remote button, a timer) would end a
        // running mission with no miss and no stop recorded.
        expect(filesNaming('END_STALE_MISSION_RUN')).toEqual([
            `${MC}store/activityLog.ts`, // its log line
            `${MC}store/mcReducer.ts`, // the case
            `${MC}store/useStaleMissionRunEnd.ts`, // the one dispatcher
            `${MC}types.ts`, // the union member
        ]);
    });

    // Not the whole of "only the phone stops a mission": saving a new start time for
    // the running mission in MC Settings still ends it, through SET_SETTINGS, and
    // that is logged (settings-ends-mission.test.tsx; open decision, PR 170).
    it('CANCEL_MISSION reaches the store only from the phone: no desktop gesture stops a mission', () => {
        // A stop sticks for the rest of the window and does not move the shield,
        // so a desktop gesture let the child end a mission (decision 2026-09-24).
        // The phone's Stop arrives through useRemoteControl's allowlist.
        expect(filesNaming('CANCEL_MISSION')).toEqual([
            `${MC}hooks/useRemoteControl.ts`, // REMOTE_ALLOWED_ACTIONS: the phone's Stop
            `${MC}store/activityLog.ts`, // its log line
            `${MC}store/mcReducer.ts`, // the case, and the cream-task resync list
            `${MC}store/staleMissionAction.ts`, // refuses a Stop for a mission that is not running
            `${MC}types.ts`, // the union member
        ]);
    });

    // Reset is phone-only too (decision 2026-10-07). A full Reset is a fresh attempt
    // (freshAttempt clears loggedTimeoutAt while the charged miss stays), so the
    // child's 2 s hold on the overlay's "↺ Reset" erased a miss after the end and
    // restarted the timer before it: the timer never bound. Its tap (tasks only) went
    // with it: one control, and resetting a run is the parent's call.
    it('RESET_MISSION_WITH_TIMER reaches the store only from the remote: no desktop gesture restarts a mission', () => {
        expect(filesNaming('RESET_MISSION_WITH_TIMER')).toEqual([
            `${MC}hooks/useRemoteControl.ts`, // REMOTE_ALLOWED_ACTIONS (no phone build sends it yet)
            `${MC}store/activityLog.ts`, // its log line
            `${MC}store/mcReducer.ts`, // the case, and the cream-task resync list
            `${MC}store/staleMissionAction.ts`, // refuses a Reset for a mission that is not running
            `${MC}types.ts`, // the union member
        ]);
    });

    it('RESET_MISSION reaches the store only from the phone: no desktop gesture resets the tasks', () => {
        expect(filesNaming('RESET_MISSION')).toEqual([
            `${MC}hooks/useRemoteControl.ts`, // REMOTE_ALLOWED_ACTIONS: the phone's Reset
            `${MC}store/mcReducer.ts`, // the case, and the cream-task resync list
            `${MC}store/staleMissionAction.ts`, // refuses a Reset for a mission that is not running
            `${MC}types.ts`, // the union member
        ]);
    });
});
