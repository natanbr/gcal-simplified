// ============================================================
// Privilege suspend / reinstate must write an activity-log line
// ------------------------------------------------------------
// CLAUDE.md → Attribution: every state-changing action carries an origin and
// every log entry a source, so a parent can see who moved what. Suspending a
// privilege from Settings or from the phone wrote nothing at all —
// `createLogEntry` had no SET_PRIVILEGE_STATUS case and fell through to
// `default: null`. And the mirror rule still applies: an action that changes
// nothing must stay silent, or the log records events that never happened.
// ============================================================

import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderHook, act } from '@testing-library/react';
import { createLogEntry } from './activityLog';
import { initialState, mcReducer } from './mcReducer';
import { MCContext, useMCDispatch } from './useMCStore';
import type { MCState, MCAction, PrivilegeStatus } from '../types';

const NOW = '2026-09-22T10:00:00.000Z';
const HOUR = 60 * 60 * 1000;
const at = (ms: number) => new Date(Date.parse(NOW) + ms).toISOString();

function withPhoneGames(status: PrivilegeStatus, suspendedUntil: string | null): MCState {
    return {
        ...initialState,
        privileges: initialState.privileges.map(p =>
            p.id === 'phone-games' ? { ...p, status, suspendedUntil } : p,
        ),
    };
}

type PrivilegeAction = Extract<MCAction, { type: 'SET_PRIVILEGE_STATUS' }>;
type Extra = Pick<PrivilegeAction, 'isRemote' | 'origin' | 'cardId'>;

const suspend = (until: string | null, extra: Partial<Extra> = {}): PrivilegeAction => ({
    type: 'SET_PRIVILEGE_STATUS', cardId: 'phone-games', status: 'suspended', suspendedUntil: until,
    timestamp: NOW, ...extra,
});

const reinstate = (extra: Partial<Extra> = {}): PrivilegeAction => ({
    type: 'SET_PRIVILEGE_STATUS', cardId: 'phone-games', status: 'active', suspendedUntil: null,
    timestamp: NOW, ...extra,
});

describe('SET_PRIVILEGE_STATUS writes a log line', () => {
    it('records a suspension with its length and end, attributed to this machine', () => {
        const entry = createLogEntry(suspend(at(24 * HOUR)), withPhoneGames('active', null));
        expect(entry).not.toBeNull();
        expect(entry!.icon).toBe('🚫');
        expect(entry!.message).toContain('**Phone Games** suspended for 1 day');
        // The end time makes the line self-sufficient: no separate "expired"
        // entry is written when the suspension runs out.
        expect(entry!.message).toMatch(/until \d{1,2} [A-Z][a-z]{2} \d{2}:\d{2}/);
        expect(entry!.source).toBe('local');
        expect(entry!.timestamp).toBe(NOW);
    });

    it('says days for the longer choices', () => {
        const entry = createLogEntry(suspend(at(72 * HOUR)), withPhoneGames('active', null));
        expect(entry!.message).toContain('suspended for 3 days');
    });

    it('records a reinstatement', () => {
        const entry = createLogEntry(reinstate(), withPhoneGames('suspended', at(5 * HOUR)));
        expect(entry).not.toBeNull();
        expect(entry!.icon).toBe('✅');
        expect(entry!.message).toBe('**Phone Games** reinstated');
        expect(entry!.source).toBe('local');
    });

    it('attributes a suspension from the phone to the remote', () => {
        const entry = createLogEntry(
            suspend(at(24 * HOUR), { isRemote: true, origin: 'remote' }),
            withPhoneGames('active', null),
        );
        expect(entry!.source).toBe('remote');
        expect(entry!.isRemote).toBe(true);
    });

    it('carries the balance snapshot like every other entry', () => {
        const entry = createLogEntry(reinstate(), withPhoneGames('suspended', at(5 * HOUR)));
        expect(entry!.bankTokens).toBe(initialState.bankCount);
        expect(entry!.gameTokens).toBe(initialState.gameTokens);
        expect(entry!.totalTokens).toBeTypeOf('number');
    });
});

describe('SET_PRIVILEGE_STATUS stays silent when nothing changes (negative)', () => {
    it('an unknown privilege id', () => {
        expect(createLogEntry(suspend(at(HOUR), { cardId: 'jetpack' }), initialState)).toBeNull();
    });

    it('reinstating a privilege that is already active', () => {
        expect(createLogEntry(reinstate(), withPhoneGames('active', null))).toBeNull();
    });

    it('reinstating a suspension that had already run out', () => {
        // Stored as suspended, but it lifted an hour ago — the child already
        // had the privilege back, so "reinstated" would be a false event.
        expect(createLogEntry(reinstate(), withPhoneGames('suspended', at(-HOUR)))).toBeNull();
    });

    it('a suspension whose end is not in the future', () => {
        expect(createLogEntry(suspend(at(-HOUR)), withPhoneGames('active', null))).toBeNull();
        expect(createLogEntry(suspend(NOW), withPhoneGames('active', null))).toBeNull();
    });

    it('a suspension with no end time', () => {
        // A suspension is defined by when it ends; without one it is not in force.
        expect(createLogEntry(suspend(null), withPhoneGames('active', null))).toBeNull();
    });

    it('re-sending the identical suspension', () => {
        const until = at(24 * HOUR);
        expect(createLogEntry(suspend(until), withPhoneGames('suspended', until))).toBeNull();
    });
});

describe('EXPIRE_SUSPENSIONS: the automatic end is logged and attributed', () => {
    const expire = { type: 'EXPIRE_SUSPENSIONS' as const, timestamp: NOW, origin: 'auto' as const };

    it('names the privilege and when it ended, attributed to the automatic timer', () => {
        const entry = createLogEntry(expire, withPhoneGames('suspended', at(-HOUR)));
        expect(entry).not.toBeNull();
        expect(entry!.icon).toBe('✅');
        expect(entry!.message).toMatch(/^\*\*Phone Games\*\* suspension ended \(\d{1,2} [A-Z][a-z]{2} \d{2}:\d{2}\)$/);
        expect(entry!.source).toBe('auto');
    });

    it('stays silent when nothing has ended (negative)', () => {
        expect(createLogEntry(expire, withPhoneGames('suspended', at(HOUR)))).toBeNull();
        expect(createLogEntry(expire, withPhoneGames('active', null))).toBeNull();
    });
});

describe('the locked status', () => {
    const setStatus = (status: PrivilegeStatus): PrivilegeAction => ({
        type: 'SET_PRIVILEGE_STATUS', cardId: 'phone-games', status, suspendedUntil: null, timestamp: NOW,
    });

    it('logs locking, once', () => {
        expect(createLogEntry(setStatus('locked'), withPhoneGames('active', null))?.message).toBe('**Phone Games** locked');
        expect(createLogEntry(setStatus('locked'), withPhoneGames('locked', null))).toBeNull();
    });

    it('logs unlocking a locked card as a reinstatement (a state change with no line broke attribution)', () => {
        expect(createLogEntry(setStatus('active'), withPhoneGames('locked', null))?.message).toBe('**Phone Games** reinstated');
    });

    it('never calls an unknown status from a tampered phone "locked"', () => {
        // Deliberately ill-typed: what a stale or tampered remote build can send.
        const bogus = { ...setStatus('active'), status: 'bogus' as PrivilegeStatus };
        expect(createLogEntry(bogus, withPhoneGames('active', null))).toBeNull();
    });
});

describe('through the real interceptor', () => {
    it('lands exactly one entry per suspend and per reinstate', () => {
        let latest: MCState = initialState;
        const Wrapper = ({ children }: { children: React.ReactNode }) => {
            const [state, dispatch] = React.useReducer(mcReducer, { ...initialState, activityLogs: [] });
            latest = state;
            return React.createElement(MCContext.Provider, { value: { state, dispatch } }, children);
        };
        const { result } = renderHook(() => useMCDispatch(), { wrapper: Wrapper });

        const until = new Date(Date.now() + 24 * HOUR).toISOString();
        act(() => {
            result.current({ type: 'SET_PRIVILEGE_STATUS', cardId: 'knife', status: 'suspended', suspendedUntil: until });
        });
        act(() => {
            result.current({ type: 'SET_PRIVILEGE_STATUS', cardId: 'knife', status: 'active', suspendedUntil: null });
        });

        expect(latest.activityLogs.map(l => l.icon)).toEqual(['✅', '🚫']);
        expect(latest.activityLogs.every(l => l.source === 'local')).toBe(true);
    });
});
