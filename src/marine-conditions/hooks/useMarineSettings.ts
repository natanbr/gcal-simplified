import { useState, useCallback } from 'react';
import { MARINE_SETTINGS_KEY, DEFAULT_LOCATION_ID } from '../config';
import type { MarineSettings } from '../types';

const DEFAULTS: MarineSettings = {
    locationId: DEFAULT_LOCATION_ID,
    tempUnit: 'C',
};

function loadSettings(): MarineSettings {
    try {
        const raw = localStorage.getItem(MARINE_SETTINGS_KEY);
        if (!raw) return DEFAULTS;
        const parsed = JSON.parse(raw) as Partial<MarineSettings>;
        return { ...DEFAULTS, ...parsed };
    } catch {
        return DEFAULTS;
    }
}

function saveSettings(settings: MarineSettings): void {
    try {
        localStorage.setItem(MARINE_SETTINGS_KEY, JSON.stringify(settings));
    } catch {
        // Storage unavailable — continue without persistence
    }
}

/**
 * Manages persisted marine user settings (location, units, etc.).
 * Reads from localStorage on first render, persists any updates.
 *
 * @example
 * const { settings, updateSettings } = useMarineSettings();
 * updateSettings({ tempUnit: 'F' });
 */
export function useMarineSettings() {
    const [settings, setSettings] = useState<MarineSettings>(loadSettings);

    const updateSettings = useCallback((patch: Partial<MarineSettings>) => {
        setSettings(prev => {
            const next = { ...prev, ...patch };
            saveSettings(next);
            return next;
        });
    }, []);

    return { settings, updateSettings } as const;
}
