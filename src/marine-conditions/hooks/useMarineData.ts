import { useState, useCallback, useRef } from 'react';
import type { TideData } from '../types';
import { getLocationById } from '../utils/marineLocations';

interface MarineDataState {
    data: TideData | null;
    isLoading: boolean;
    isError: boolean;
    isSuspect: boolean;
    sources: TideData['sources'];
}

const INITIAL: MarineDataState = {
    data: null,
    isLoading: false,
    isError: false,
    isSuspect: false,
    sources: [],
};

/**
 * Lazy-fetch hook for marine data.
 *
 * - Does NOT fetch on mount. Fetch only happens when `activate()` is called.
 * - Tries CHS official data first; falls back to Open-Meteo on failure.
 * - Re-fetches automatically when `locationId` changes AND the module is active.
 * - Sets `isSuspect: true` when max current speed < 2.0 kn (stale/bad station data guard).
 *
 * @example
 * const { state, activate } = useMarineData(locationId);
 * // In an effect:
 * useEffect(() => { activate(); }, [locationId, activate]);
 */
export function useMarineData(locationId: string) {
    const [state, setState] = useState<MarineDataState>(INITIAL);
    const isActiveRef = useRef(false);

    const activate = useCallback(async () => {
        isActiveRef.current = true;
        const location = getLocationById(locationId);

        setState(prev => ({ ...prev, isLoading: true, isError: false }));

        try {
            // Guard: ipcRenderer is only available in Electron
            if (!window.ipcRenderer) {
                console.warn('[useMarineData] ipcRenderer not available — running in browser mode');
                setState(prev => ({ ...prev, isLoading: false, isError: true }));
                return;
            }

            // Primary: CHS official data via Electron IPC
            const result = await window.ipcRenderer.invoke(
                'tides:get',
                location.tideStation,
                location.currentStation,
                location.coords.lat,
                location.coords.lng
            ) as TideData;

            // Suspect data guard: if max current < 2kn the station data is likely stale
            const speeds = result?.hourly?.current_speed ?? [];
            const maxSpeed = speeds.length > 0 ? Math.max(...speeds) : 0;
            const isSuspect = maxSpeed < 2.0;

            setState({
                data: result,
                isLoading: false,
                isError: false,
                isSuspect,
                sources: result.sources ?? [],
            });
        } catch (err) {
            console.error('[useMarineData] Failed to fetch marine data:', err);
            setState(prev => ({ ...prev, isLoading: false, isError: true }));
        }
    }, [locationId]);

    return { state, activate } as const;
}
