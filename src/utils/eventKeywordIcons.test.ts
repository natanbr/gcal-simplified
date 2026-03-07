import { describe, it, expect } from 'vitest';
import { getEventIconName } from './eventKeywordIcons';

// ── Trash / Garbage ───────────────────────────────────────────────────────────

describe('getEventIconName — trash / garbage', () => {
    it('"garbage day" → trash', () => {
        expect(getEventIconName('Garbage Day')).toBe('trash');
    });

    it('"Trash Pickup" → trash', () => {
        expect(getEventIconName('Trash Pickup')).toBe('trash');
    });

    it('keyword in description → trash', () => {
        expect(getEventIconName('Pickup', 'put out garbage bins')).toBe('trash');
    });

    it('case-insensitive match — "GARBAGE" → trash', () => {
        expect(getEventIconName('GARBAGE BINS')).toBe('trash');
    });
});

// ── Recycle ───────────────────────────────────────────────────────────────────

describe('getEventIconName — recycle / recycling', () => {
    it('"Recycling Pickup" → recycle', () => {
        expect(getEventIconName('Recycling Pickup')).toBe('recycle');
    });

    it('"recycle bins out" → recycle', () => {
        expect(getEventIconName('recycle bins out')).toBe('recycle');
    });

    it('keyword only in description → recycle', () => {
        expect(getEventIconName('Bins', 'put out recycle bins')).toBe('recycle');
    });
});

// ── Waves (pool / swim) ───────────────────────────────────────────────────────

describe('getEventIconName — pool / swim', () => {
    it('"Pool Party" → waves', () => {
        expect(getEventIconName('Pool Party')).toBe('waves');
    });

    it('"Swim Meet" → waves', () => {
        expect(getEventIconName('Swim Meet')).toBe('waves');
    });

    it('"swimming lessons" → waves', () => {
        expect(getEventIconName('Swimming Lessons')).toBe('waves');
    });

    it('keyword in description → waves', () => {
        expect(getEventIconName('Activity', 'going to the pool')).toBe('waves');
    });
});

// ── Users (scout) ─────────────────────────────────────────────────────────────

describe('getEventIconName — scout / scouting', () => {
    it('"Scout Meeting" → users', () => {
        expect(getEventIconName('Scout Meeting')).toBe('users');
    });

    it('"Scouting Trip" → users', () => {
        expect(getEventIconName('Scouting Trip')).toBe('users');
    });

    it('keyword in description → users', () => {
        expect(getEventIconName('Weekly Group', 'scout adventure')).toBe('users');
    });
});

// ── Swords (karate / martial) ─────────────────────────────────────────────────

describe('getEventIconName — karate / martial arts', () => {
    it('"Karate Class" → swords', () => {
        expect(getEventIconName('Karate Class')).toBe('swords');
    });

    it('"Martial Arts" → swords', () => {
        expect(getEventIconName('Martial Arts Training')).toBe('swords');
    });

    it('keyword in description → swords', () => {
        expect(getEventIconName('Training', 'karate belt test')).toBe('swords');
    });
});

// ── No match ──────────────────────────────────────────────────────────────────

describe('getEventIconName — no match', () => {
    it('"Birthday Party" → null', () => {
        expect(getEventIconName('Birthday Party')).toBeNull();
    });

    it('"Doctor Appointment" → null', () => {
        expect(getEventIconName('Doctor Appointment', 'checkup')).toBeNull();
    });

    it('empty string → null', () => {
        expect(getEventIconName('')).toBeNull();
    });

    it('undefined description does not throw → null', () => {
        expect(getEventIconName('No keywords', undefined)).toBeNull();
    });
});

// ── Priority (first match wins) ───────────────────────────────────────────────

describe('getEventIconName — first keyword match wins', () => {
    it('"garbage swim" — first matching keyword is trash', () => {
        // "garbage" appears first in the check order
        expect(getEventIconName('garbage swim')).toBe('trash');
    });

    it('"pool karate" — first matching keyword is waves (pool)', () => {
        expect(getEventIconName('pool karate')).toBe('waves');
    });
});
