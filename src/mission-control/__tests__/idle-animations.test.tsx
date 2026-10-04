// ============================================================
// Idle animation guard — Mission Control
// ------------------------------------------------------------
// A loop draws a frame every vsync for as long as it is on screen, compositor-
// driven or not. The Remote dot's 2 s pulse (8 px, transform + opacity) cost
// 20-25 % of one CPU core on the child's screen, 1280x720 at scale 1.5, for as
// long as Mission Control was open (2026-10-04, docs/performance.md).
//
// The registry (src/__tests__/infinite-animation-registry.test.ts) pins every
// loop in the code. This file renders the screens the child's display sits on
// for minutes or hours and fails if a CSS, Tailwind or inline-style loop is on
// them, against every stylesheet the Mission Control tree can apply:
// src/mission-control/styles/ and src/index.css, which main.tsx imports.
// Blind spots: a loop driven by JavaScript (Framer `repeat: Infinity`, WAAPI,
// requestAnimationFrame) leaves nothing in the DOM to see, and jsdom does not
// show Framer's frame loop either (probed 2026-10-04: no requestAnimationFrame
// call even with a Framer infinite span on screen). For those, `onIdleView` in
// the registry, set by hand, is the only defence. A custom `animate-*` utility
// added in tailwind.config.js is not recognised as a loop either.
// The Calendar's idle view: src/__tests__/idle-calendar-animations.test.tsx.
// ============================================================

import { describe, it, expect, vi, afterEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { initialState } from '../store/mcReducer';
import { MISSED_LOCK_THRESHOLD } from '../store/missionStreak';
import { MCContext } from '../store/useMCStore';
import { MissionControl } from '../MissionControl';
import { MissionOverlay } from '../components/MissionOverlay';
import { CHEAT_TRAP_TOTAL_MS } from '../components/CheatTrapOverlay';
import { DragLayer } from '../components/DragLayer';
import { animationDeclarationOf, infiniteCssRules, loopingOnScreen, stylesheetsUnder } from './infiniteAnimations';
import type { MCState } from '../types';

const here = dirname(fileURLToPath(import.meta.url));
const mcStyles = stylesheetsUnder(resolve(here, '..', 'styles'));
const everyStylesheet = `${mcStyles}\n${readFileSync(resolve(here, '..', '..', 'index.css'), 'utf8')}`;

describe('Mission Control stylesheets — nothing loops forever', () => {
    it('no rule under src/mission-control/styles loops or hides its iteration count', () => {
        expect(infiniteCssRules(mcStyles)).toEqual([]);
    });

    // The cheat trap is the one moment these play: MissionControl.tsx shows it
    // for CHEAT_TRAP_SHOW_MS, re-shows it once while the flag is set and clears
    // the flag, CHEAT_TRAP_TOTAL_MS in all. Each must last that long and then stop.
    it.each([
        ['.mc-notification-dot', 'mc-dot-pulse'],
        ['.mc-anim-finger-wag', 'mc-finger-wag'],
    ])(`%s plays for the whole cheat trap (${CHEAT_TRAP_TOTAL_MS / 1000} s or more), then stops`, (selector, keyframes) => {
        const declaration = animationDeclarationOf(mcStyles, selector) ?? '';
        const parts = declaration.match(/^(\S+)\s+([\d.]+)s\s+\S+\s+(\d+)(?:\s+forwards)?$/);
        expect(parts, `${selector}: "${declaration}" is not "<name> <seconds>s <easing> <count>"`).not.toBeNull();
        const [, name, seconds, count] = parts as RegExpMatchArray;
        expect(name).toBe(keyframes);
        expect(Number(seconds) * Number(count) * 1000).toBeGreaterThanOrEqual(CHEAT_TRAP_TOTAL_MS);
    });
});

describe('loopingOnScreen — what it matches', () => {
    afterEach(() => { document.body.innerHTML = ''; });

    it('matches ::after and :hover rules on their host (a tap leaves :hover on a touchscreen)', () => {
        document.body.innerHTML = '<b class="host"></b>';
        const css = '.host::after { animation: x 1s infinite } .host:hover { animation: y 1s infinite }';
        expect(loopingOnScreen(document, css)).toHaveLength(2);
    });

    it('refuses a looping rule whose selector it cannot evaluate, instead of passing it', () => {
        const found = loopingOnScreen(document, '.x:unknown-state { animation: x 1s infinite }');
        expect(found).toEqual([expect.stringContaining('cannot evaluate the selector')]);
    });

    it('sees an inline loop and a looping class in the arbitrary-value form', () => {
        document.body.innerHTML = `<i style="animation: x 1s infinite"></i><i class="${'animate-'}[x_1s_infinite]"></i>`;
        expect(loopingOnScreen(document, '')).toHaveLength(2);
    });
});

const hourFromNow = () => new Date(Date.now() + 3_600_000).toISOString();

function runningMorning(state: MCState, allDone = false): MCState {
    return {
        ...state,
        activeMission: 'morning',
        missions: state.missions.map(m => (m.phase !== 'morning' ? m : {
            ...m, active: true, startedAt: new Date().toISOString(), durationMins: 30,
            tasks: m.tasks.map(t => ({ ...t, completed: allDone })),
        })),
    };
}

// Screens the display sits on for minutes or hours with nobody touching it.
const IDLE_SCREENS: [string, MCState, { minimize?: boolean }?][] = [
    ['a fresh start: no goals, nothing done', initialState],
    ['a goal ready to redeem', { ...initialState, cases: initialState.cases.map((c, i) => (i === 0 ? { ...c, status: 'active', reward: 'story-points', tokenCount: c.targetCount } : c)) }],
    ['a goal part-filled', { ...initialState, cases: initialState.cases.map((c, i) => (i === 1 ? { ...c, status: 'active', reward: 'fishing', tokenCount: 2 } : c)) }],
    ['a responsibility DONE', { ...initialState, responsibilities: initialState.responsibilities.map((r, i) => (i === 0 ? { ...r, pointsEarned: r.pointsRequired, completedAt: new Date().toISOString() } : r)) }],
    ['the shield broken (bank locked)', { ...initialState, missedMissionStreak: MISSED_LOCK_THRESHOLD }],
    ['a privilege suspended', { ...initialState, privileges: initialState.privileges.map((p, i) => (i === 0 ? { ...p, status: 'suspended', suspendedUntil: hourFromNow() } : p)) }],
    ['the game tokens full and the mood gauge held full', { ...initialState, gameTokens: 5, behaviorProgress: 100, moodWind: 2 }],
    ['a mission running, its overlay open', runningMorning(initialState)],
    ['a mission running, every task done', runningMorning(initialState, true)],
    ['a mission running, minimized to the pill', runningMorning(initialState), { minimize: true }],
];

describe('idle Mission Control screens render no looping animation', () => {
    afterEach(() => { delete window.ipcRenderer; });

    it.each(IDLE_SCREENS)('%s', async (_name, state, options) => {
        window.ipcRenderer = {
            invoke: vi.fn(async (channel: string) => (channel === 'remote:get-status' ? true : null)),
            on: vi.fn(() => () => {}),
        };
        render(
            <MCContext.Provider value={{ state, dispatch: vi.fn() }}>
                <DragLayer>
                    <MissionOverlay />
                    <MissionControl onBackToCalendar={() => {}} />
                </DragLayer>
            </MCContext.Provider>,
        );
        await waitFor(() => expect(screen.getByTestId('mc-remote-dot')).toHaveAttribute('data-status', 'online'));
        if (options?.minimize) {
            const minimize = screen.getByTestId('mc-minimize-btn');
            fireEvent.pointerDown(minimize);
            fireEvent.pointerUp(minimize);
            await screen.findByTestId('mc-mission-pill');
        }

        expect(loopingOnScreen(document, everyStylesheet), 'looping animations on an idle screen').toEqual([]);
    });
});
