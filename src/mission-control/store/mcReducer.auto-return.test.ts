// ============================================================
// Mission Control — Auto-Return Timer: Settings Tests
// Verifies that autoReturnMins is properly defaulted, persisted,
// and migrated from old localStorage saves that lack the field.
// ============================================================

import { describe, it, expect } from 'vitest';
import { mcReducer, initialState } from './mcReducer';
import { DEFAULT_SETTINGS } from '../types';
import { loadPersistedState, STORAGE_KEY } from './useMCStore';

// ── DEFAULT_SETTINGS ─────────────────────────────────────────────────────────

describe('DEFAULT_SETTINGS — autoReturnMins', () => {
    it('has a default value of 5 minutes', () => {
        expect(DEFAULT_SETTINGS.autoReturnMins).toBe(5);
    });
});

// ── initialState ─────────────────────────────────────────────────────────────

describe('initialState — autoReturnMins', () => {
    it('initialState.settings carries the default 5-minute timer', () => {
        expect(initialState.settings.autoReturnMins).toBe(5);
    });
});

// ── SET_SETTINGS ─────────────────────────────────────────────────────────────

describe('mcReducer — SET_SETTINGS with autoReturnMins', () => {
    it('can be set to a custom value (e.g. 10 minutes)', () => {
        const state = mcReducer(initialState, {
            type: 'SET_SETTINGS',
            settings: { autoReturnMins: 10 },
        });
        expect(state.settings.autoReturnMins).toBe(10);
    });

    it('can be disabled by setting value to 0', () => {
        const state = mcReducer(initialState, {
            type: 'SET_SETTINGS',
            settings: { autoReturnMins: 0 },
        });
        expect(state.settings.autoReturnMins).toBe(0);
    });

    it('does not reset other settings when autoReturnMins is changed', () => {
        const state = mcReducer(initialState, {
            type: 'SET_SETTINGS',
            settings: { autoReturnMins: 15 },
        });
        expect(state.settings.morningStartsAt).toBe(DEFAULT_SETTINGS.morningStartsAt);
        expect(state.settings.eveningStartsAt).toBe(DEFAULT_SETTINGS.eveningStartsAt);
    });
});

// ── loadPersistedState migration ─────────────────────────────────────────────

describe('loadPersistedState — autoReturnMins migration', () => {
    it('falls back to default 5 when old save does not have autoReturnMins', () => {
        const oldSave = {
            bankCount: 3,
            settings: {
                morningStartsAt: '07:00',
                // No autoReturnMins — simulates an old save
            },
        };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(oldSave));
        const loaded = loadPersistedState();
        expect(loaded.settings.autoReturnMins).toBe(5);
        localStorage.removeItem(STORAGE_KEY);
    });

    it('preserves a saved autoReturnMins value of 0 (disabled)', () => {
        const savedState = {
            bankCount: 3,
            settings: {
                morningStartsAt: '07:00',
                autoReturnMins: 0,
            },
        };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(savedState));
        const loaded = loadPersistedState();
        expect(loaded.settings.autoReturnMins).toBe(0);
        localStorage.removeItem(STORAGE_KEY);
    });

    it('preserves a saved autoReturnMins value of 15', () => {
        const savedState = {
            bankCount: 3,
            settings: {
                autoReturnMins: 15,
            },
        };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(savedState));
        const loaded = loadPersistedState();
        expect(loaded.settings.autoReturnMins).toBe(15);
        localStorage.removeItem(STORAGE_KEY);
    });
});
