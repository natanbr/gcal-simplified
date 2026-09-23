// ============================================================
// isPrivilegeSuspended / effectivePrivilege — the one answer to "is this
// privilege suspended right now". Boundaries only; the behaviour it fixes is
// covered end-to-end in components/privilege-expiry.test.tsx.
// ============================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { effectivePrivilege, expireLapsedSuspensions, isPhoneGamesSuspended, isPrivilegeSuspended, nextSuspensionEnd } from './privileges';
import { formatSuspendedRemainingTime, parseSuspensionEnd } from '../utils/timeUtils';
import { initialState, mcReducer } from './mcReducer';
import type { MCState, PrivilegeCard } from '../types';

const NOW = Date.parse('2026-09-22T10:00:00.000Z');
const iso = (ms: number) => new Date(NOW + ms).toISOString();
const knife = (status: PrivilegeCard['status'], suspendedUntil: string | null): PrivilegeCard => ({
    id: 'knife', label: 'Knife', icon: 'Utensils', status, suspendedUntil,
});

describe('isPrivilegeSuspended', () => {
    it('is true while the end time is ahead', () => {
        expect(isPrivilegeSuspended(knife('suspended', iso(60_000)), NOW)).toBe(true);
    });

    it('is false once the end time has passed', () => {
        expect(isPrivilegeSuspended(knife('suspended', iso(-60_000)), NOW)).toBe(false);
    });

    it('ends at the end time exactly — the instant the countdown badge disappears', () => {
        const card = knife('suspended', iso(0));
        expect(isPrivilegeSuspended(card, NOW)).toBe(false);
        expect(isPrivilegeSuspended(card, NOW - 1)).toBe(true);
    });

    it('never outlives the countdown badge (they share one boundary)', () => {
        // Real clock on purpose: the formatter has no `now` parameter.
        const running = knife('suspended', new Date(Date.now() + 90_000).toISOString());
        const lapsed = knife('suspended', new Date(Date.now() - 1).toISOString());
        expect(isPrivilegeSuspended(running)).toBe(formatSuspendedRemainingTime(running.suspendedUntil) !== null);
        expect(isPrivilegeSuspended(lapsed)).toBe(formatSuspendedRemainingTime(lapsed.suspendedUntil) !== null);
    });

    it('treats a missing or unreadable end time as not in force (no indefinite suspension)', () => {
        expect(isPrivilegeSuspended(knife('suspended', null), NOW)).toBe(false);
        expect(isPrivilegeSuspended(knife('suspended', 'not a date'), NOW)).toBe(false);
    });

    it('is false for any other status, whatever the end time says', () => {
        expect(isPrivilegeSuspended(knife('active', iso(60_000)), NOW)).toBe(false);
        expect(isPrivilegeSuspended(knife('locked', iso(60_000)), NOW)).toBe(false);
    });
});

describe('effectivePrivilege', () => {
    it('turns a lapsed suspension into active with no end time', () => {
        expect(effectivePrivilege(knife('suspended', iso(-1)), NOW)).toEqual(knife('active', null));
    });

    it('returns a running suspension, and every other card, as the same object', () => {
        const running = knife('suspended', iso(60_000));
        const active = knife('active', null);
        const locked = knife('locked', null);
        expect(effectivePrivilege(running, NOW)).toBe(running);
        expect(effectivePrivilege(active, NOW)).toBe(active);
        expect(effectivePrivilege(locked, NOW)).toBe(locked);
    });
});

describe('isPhoneGamesSuspended', () => {
    const withPhoneGames = (suspendedUntil: string) => initialState.privileges.map(p =>
        p.id === 'phone-games' ? { ...p, status: 'suspended' as const, suspendedUntil } : p,
    );

    it('follows the Phone Games card only', () => {
        expect(isPhoneGamesSuspended(withPhoneGames(iso(60_000)), NOW)).toBe(true);
        expect(isPhoneGamesSuspended(withPhoneGames(iso(-60_000)), NOW)).toBe(false);
        expect(isPhoneGamesSuspended(initialState.privileges, NOW)).toBe(false);
    });

    it('is false when the card is missing', () => {
        expect(isPhoneGamesSuspended([], NOW)).toBe(false);
    });
});

describe('one reading of the end time, shared by every reader', () => {
    // `Date.parse(2030)` reads a NUMBER as the year 2030; `new Date(2030)` reads
    // it as 2030 ms after 1970. The type says string, but the phone payload is
    // untrusted JSON, so the card and the countdown badge once disagreed on it:
    // red hazard stripes for four years with no badge. Any value that is not a
    // readable date string is "no end time" to all of them.
    beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(NOW); });
    afterEach(() => { vi.useRealTimers(); });

    const odd: unknown[] = [2030, NOW + 60_000, '2030', 'garbage', '', {}, true];

    it.each(odd)('card and countdown badge agree on %s', value => {
        // Deliberately ill-typed: what untrusted JSON can put in the field.
        const card = { ...knife('suspended', null), suspendedUntil: value as string };
        expect(isPrivilegeSuspended(card)).toBe(formatSuspendedRemainingTime(card.suspendedUntil) !== null);
    });

    it('reads only a date string, never a number', () => {
        expect(parseSuspensionEnd(2030)).toBeNull();
        expect(parseSuspensionEnd(NOW + 60_000)).toBeNull();
        expect(parseSuspensionEnd('garbage')).toBeNull();
        expect(parseSuspensionEnd(null)).toBeNull();
        expect(parseSuspensionEnd(iso(60_000))).toBe(NOW + 60_000);
    });
});

describe('expireLapsedSuspensions', () => {
    it('lifts only the suspensions that have ended', () => {
        const lapsed = knife('suspended', iso(-1));
        const running = { ...knife('suspended', iso(60_000)), id: 'fire' };
        const out = expireLapsedSuspensions([lapsed, running], NOW);
        expect(out[0]).toMatchObject({ status: 'active', suspendedUntil: null });
        expect(out[1]).toBe(running);
    });

    it('returns the same array when nothing has ended, so the store does not churn', () => {
        const privileges = [knife('suspended', iso(60_000)), knife('active', null)];
        expect(expireLapsedSuspensions(privileges, NOW)).toBe(privileges);
    });

    it('lifts nothing on an unreadable "now" (a missing timestamp must not end every suspension)', () => {
        const privileges = [knife('suspended', iso(60_000))];
        expect(expireLapsedSuspensions(privileges, Number.NaN)).toBe(privileges);
    });
});

describe('nextSuspensionEnd', () => {
    it('is the earliest stored end, including one that has already passed', () => {
        const privileges = [knife('suspended', iso(60_000)), knife('suspended', iso(-5_000)), knife('active', null)];
        expect(nextSuspensionEnd(privileges)).toBe(NOW - 5_000);
    });

    it('is null when nothing is suspended', () => {
        expect(nextSuspensionEnd(initialState.privileges)).toBeNull();
    });
});

describe('EXPIRE_SUSPENSIONS in the reducer', () => {
    const withKnife = (suspendedUntil: string): MCState => ({
        ...initialState,
        privileges: initialState.privileges.map(p => (p.id === 'knife' ? { ...p, status: 'suspended' as const, suspendedUntil } : p)),
    });
    const expire = (atMs: number) => ({ type: 'EXPIRE_SUSPENSIONS' as const, timestamp: new Date(atMs).toISOString() });

    it('lifts a suspension at its end time exactly, judged by the action timestamp', () => {
        const state = withKnife(iso(0));
        expect(mcReducer(state, expire(NOW - 1)).privileges).toBe(state.privileges);
        expect(mcReducer(state, expire(NOW)).privileges.find(p => p.id === 'knife'))
            .toMatchObject({ status: 'active', suspendedUntil: null });
    });
});
