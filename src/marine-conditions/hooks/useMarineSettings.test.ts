import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useMarineSettings } from './useMarineSettings';

const KEY = 'marine-settings-v1';

beforeEach(() => localStorage.clear());
afterEach(() => localStorage.clear());

describe('useMarineSettings', () => {
    it('returns defaults when no localStorage key exists', () => {
        const { result } = renderHook(() => useMarineSettings());
        expect(result.current.settings).toEqual({
            locationId: 'sooke',
            tempUnit: 'C',
        });
    });

    it('reads persisted locationId from localStorage', () => {
        localStorage.setItem(KEY, JSON.stringify({ locationId: 'oak-bay', tempUnit: 'C' }));
        const { result } = renderHook(() => useMarineSettings());
        expect(result.current.settings.locationId).toBe('oak-bay');
    });

    it('reads persisted tempUnit from localStorage', () => {
        localStorage.setItem(KEY, JSON.stringify({ locationId: 'sombrio', tempUnit: 'F' }));
        const { result } = renderHook(() => useMarineSettings());
        expect(result.current.settings.tempUnit).toBe('F');
    });

    it('updateSettings patches only changed fields', () => {
        localStorage.setItem(KEY, JSON.stringify({ locationId: 'gulf-islands', tempUnit: 'C' }));
        const { result } = renderHook(() => useMarineSettings());

        act(() => {
            result.current.updateSettings({ tempUnit: 'F' });
        });

        expect(result.current.settings.locationId).toBe('gulf-islands'); // unchanged
        expect(result.current.settings.tempUnit).toBe('F');              // updated
    });

    it('persists the updated value to localStorage', () => {
        const { result } = renderHook(() => useMarineSettings());

        act(() => {
            result.current.updateSettings({ locationId: 'salt-spring' });
        });

        const stored = JSON.parse(localStorage.getItem(KEY)!) as { locationId: string };
        expect(stored.locationId).toBe('salt-spring');
    });

    it('handles corrupted localStorage JSON gracefully', () => {
        localStorage.setItem(KEY, '{ bad json !!!');
        const { result } = renderHook(() => useMarineSettings());
        expect(result.current.settings.locationId).toBe('sooke'); // fell back to defaults
    });

    it('uses versioned key marine-settings-v1, not marine-settings', () => {
        const { result } = renderHook(() => useMarineSettings());
        act(() => {
            result.current.updateSettings({ locationId: 'sooke' });
        });
        expect(localStorage.getItem('marine-settings')).toBeNull();
        expect(localStorage.getItem('marine-settings-v1')).not.toBeNull();
    });
});
