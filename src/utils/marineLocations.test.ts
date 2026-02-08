import { describe, it, expect } from 'vitest';
import { MARINE_LOCATIONS } from './marineLocations';
import stations from '../../stations.json';

describe('MARINE_LOCATIONS Data Integrity', () => {
    it('should have unique IDs', () => {
        const ids = MARINE_LOCATIONS.map(loc => loc.id);
        const uniqueIds = new Set(ids);
        expect(uniqueIds.size).toBe(ids.length);
    });

    it('should have non-empty names', () => {
        MARINE_LOCATIONS.forEach(loc => {
            expect(loc.name).toBeTruthy();
            expect(loc.name.trim().length).toBeGreaterThan(0);
        });
    });

    it('should have valid coordinates', () => {
        MARINE_LOCATIONS.forEach(loc => {
            expect(loc.coords.lat).toBeGreaterThanOrEqual(-90);
            expect(loc.coords.lat).toBeLessThanOrEqual(90);
            expect(loc.coords.lng).toBeGreaterThanOrEqual(-180);
            expect(loc.coords.lng).toBeLessThanOrEqual(180);
        });
    });

    it('should have valid tideStation and currentStation IDs that exist in stations.json', () => {
        const stationCodes = new Set(stations.map((s: any) => s.code));

        MARINE_LOCATIONS.forEach(loc => {
            expect(stationCodes.has(loc.tideStation)).toBe(true);
            expect(stationCodes.has(loc.currentStation)).toBe(true);
        });
    });
});
