// ============================================================
// Mission Control — Privilege suspension, decided in one place
//
// A suspension is defined by when it ENDS. The stored `status: 'suspended'`
// is only the parent's last decision. Every reader asks `isPrivilegeSuspended`
// instead of comparing the flag, so no surface can show a suspension past its
// end. Same shape as `isEconomyLocked`: derived, not trusted from storage.
// The stored flag is then made true by EXPIRE_SUSPENSIONS, dispatched at the
// end time by useSuspensionExpiry; that is what re-renders every surface,
// tells the phone, and logs the lift.
//
// Guarded by __tests__/privilege-suspension-boundary.test.ts: comparing
// `status === 'suspended'` anywhere else is what made a 1-day suspension
// indefinite (QA 2026-09-22).
// ⚠️  Internal to src/mission-control/ only.
// ============================================================

import type { PrivilegeCard } from '../types';
import { parseSuspensionEnd } from '../utils/timeUtils';

export const PHONE_GAMES_PRIVILEGE_ID = 'phone-games';

type SuspensionFields = Pick<PrivilegeCard, 'status' | 'suspendedUntil'>;

/**
 * True while a suspension is in force at `nowMs`: stored as suspended AND its
 * end is still ahead. It ends at `suspendedUntil` exactly — the same boundary
 * at which `formatSuspendedRemainingTime` drops the countdown badge, so the
 * badge and the hazard stripes can never disagree.
 *
 * A missing or unreadable end time means NOT in force. The type contract is
 * "null if not suspended", no screen writes that pair, and reading it as
 * "suspended forever" is exactly the indefinite suspension this module exists
 * to prevent.
 */
export function isPrivilegeSuspended(card: SuspensionFields, nowMs: number = Date.now()): boolean {
    if (card.status !== 'suspended') return false;
    const endMs = parseSuspensionEnd(card.suspendedUntil);
    return endMs !== null && endMs > nowMs;
}

/**
 * The card as it stands at `nowMs`: a lapsed suspension becomes active with no
 * end time; anything else is returned untouched. The phone payload sends this,
 * so it never shows a lapsed suspension as running before the expiry lands.
 */
export function effectivePrivilege(card: PrivilegeCard, nowMs: number = Date.now()): PrivilegeCard {
    if (card.status !== 'suspended' || isPrivilegeSuspended(card, nowMs)) return card;
    return { ...card, status: 'active', suspendedUntil: null };
}

type PrivilegeChange = Pick<PrivilegeCard, 'status' | 'suspendedUntil'> & { cardId: string };

/** The parent's decision (SET_PRIVILEGE_STATUS), applied to one card. */
export function setPrivilegeStatus(privileges: PrivilegeCard[], { cardId, status, suspendedUntil }: PrivilegeChange): PrivilegeCard[] {
    return privileges.map(p => (p.id === cardId ? { ...p, status, suspendedUntil } : p));
}

/**
 * EXPIRE_SUSPENSIONS: every stored suspension no longer in force at `nowMs`,
 * lifted. The SAME array when none is, so the reducer can return the same state
 * and nothing re-renders, persists or broadcasts. An unreadable `nowMs` lifts
 * nothing: `endMs > NaN` is false, which would otherwise end every suspension.
 */
export function expireLapsedSuspensions(privileges: PrivilegeCard[], nowMs: number): PrivilegeCard[] {
    if (!Number.isFinite(nowMs)) return privileges;
    const next = privileges.map(p => effectivePrivilege(p, nowMs));
    return next.some((p, i) => p !== privileges[i]) ? next : privileges;
}

/** When the next stored suspension ends (one already past counts), or null if none is stored. */
export function nextSuspensionEnd(privileges: readonly PrivilegeCard[]): number | null {
    const ends = privileges
        .filter(p => p.status === 'suspended')
        .map(p => parseSuspensionEnd(p.suspendedUntil))
        .filter((ms): ms is number => ms !== null);
    return ends.length > 0 ? Math.min(...ends) : null;
}

/** Phone Games blocks the 🎮 Game goal: the picker hides it and "Use!" locks. */
export function isPhoneGamesSuspended(privileges: readonly PrivilegeCard[], nowMs: number = Date.now()): boolean {
    const card = privileges.find(p => p.id === PHONE_GAMES_PRIVILEGE_ID);
    return card ? isPrivilegeSuspended(card, nowMs) : false;
}
