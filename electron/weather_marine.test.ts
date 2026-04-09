
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WeatherService } from './weather';

// Mock global fetch
const fetchMock = vi.fn();
global.fetch = fetchMock;

// Mock stations.json load
vi.mock('../stations.json', () => ({
    default: [
        {
            id: '07020-sooke', // Mock ID
            code: '07020',
            officialName: 'Sooke',
            latitude: 48.3746,
            longitude: -123.7276, // Coordinates of Sooke
            timeSeries: [{ code: 'wlp' }, { code: 'wlp-hilo' }]
        },
        {
            id: '07040-race', // Mock ID
            code: '07040',
            officialName: 'Race Passage',
            latitude: 48.3066,
            longitude: -123.5366, // Coordinates of Race Passage (~20km from Sooke)
            timeSeries: [{ code: 'wcp' }, { code: 'wcp-hilo' }]
        },
        {
            id: '99999-far', // Far station
            code: '99999',
            officialName: 'Far Away',
            latitude: 0,
            longitude: 0,
            timeSeries: [{ code: 'wcp' }]
        }
    ]
}));

describe('WeatherService - Marine Data', () => {
    let service: WeatherService;

    beforeEach(() => {
        service = new WeatherService();
        fetchMock.mockReset();
    });

    it('should identify Race Passage as the nearest current station for Sooke', async () => {
        // Mock responses
        // 1. Open-Meteo
        fetchMock.mockResolvedValueOnce({
            ok: true,
            json: async () => ({
                hourly: {
                    time: ['2026-02-05T00:00:00Z'],
                    swell_wave_height: [1.2],
                    sea_surface_temperature: [10.5]
                }
            })
        });

        // 2. CHS Tide (Sooke)
        fetchMock.mockResolvedValueOnce({
            ok: true,
            json: async () => ([{ eventDate: '2026-02-05T00:00:00Z', value: 2.5 }])
        });

        // 3. CHS Tide Hilo (Sooke)
        fetchMock.mockResolvedValueOnce({
            ok: true,
            json: async () => ([{ eventDate: '2026-02-05T02:00:00Z', value: 3.0 }])
        });

        // 4. CHS Current (Race Passage) - Should be called because it's nearby
        fetchMock.mockResolvedValueOnce({
            ok: true,
            json: async () => ([
                { eventDate: '2026-02-05T00:00:00Z', value: 3.5 }
            ])
        });

        // 5. CHS Current Hilo (Race Passage)
        fetchMock.mockResolvedValueOnce({
            ok: true,
            json: async () => ([
                { eventDate: '2026-02-05T01:00:00Z', value: 0.0 }, // Slack
                { eventDate: '2026-02-05T04:00:00Z', value: 5.3 }  // Max
            ])
        });

        const result = await service.getTides();

        expect(result.station).toContain('Race Passage');
        expect(result.hourly.current_speed).toBeDefined();
        // Check if current speed matches mock
        expect(result.hourly.current_speed?.[0]).toBe(3.5);

        // Verify sources metadata
        const currentSource = result.sources?.find(s => s.name.includes('CHS Currents'));
        expect(currentSource).toBeDefined();
        expect(currentSource?.details).toContain('Station 07040');
    });

    it('should fallback if CHS data has suspiciously low max speed (< 2.0kn)', async () => {
        // 1. Open-Meteo (Success)
        fetchMock.mockResolvedValueOnce({
            ok: true,
            json: async () => ({
                hourly: { time: ['2026-02-05T00:00:00Z'], ocean_current_velocity: [0.5] }
            })
        });

        // 2. CHS Tide (Success)
        fetchMock.mockResolvedValueOnce({ ok: true, json: async () => [] });
        fetchMock.mockResolvedValueOnce({ ok: true, json: async () => [] });

        // 3. CHS Current (Success but LOW SPEED)
        fetchMock.mockResolvedValueOnce({
            ok: true,
            json: async () => ([
                { eventDate: '2026-02-05T00:00:00Z', value: 0.1 },
                { eventDate: '2026-02-05T01:00:00Z', value: 1.5 } // Max 1.5 < 2.0
            ])
        });
        // 4. CHS Hilo
        fetchMock.mockResolvedValueOnce({ ok: true, json: async () => [] });

        const result = await service.getTides();

        // Should fallback due to validation failure
        expect(result.station).toContain('Modeled Data (Warning)');
        const omSource = result.sources?.find(s => s.name.includes('Weather Model'));
        expect(omSource).toBeDefined();
    });

    it('should fallback to Open-Meteo calculations if CHS current fetch fails', async () => {
        // 1. Open-Meteo (Success with current data)
        fetchMock.mockResolvedValueOnce({
            ok: true,
            json: async () => ({
                hourly: {
                    time: ['2026-02-05T00:00:00Z'],
                    swell_wave_height: [1.2],
                    sea_surface_temperature: [10.5],
                    ocean_current_velocity: [0.5], // Fallback data
                    ocean_current_direction: [180]
                }
            })
        });

        // 2. CHS Tide (Success)
        fetchMock.mockResolvedValueOnce({ ok: true, json: async () => [] });
        fetchMock.mockResolvedValueOnce({ ok: true, json: async () => [] });

        // 3. CHS Current (Failure)
        fetchMock.mockResolvedValueOnce({ ok: false, statusText: 'Not Found' });
        fetchMock.mockResolvedValueOnce({ ok: false });

        const result = await service.getTides();

        // Should use Open-Meteo because CHS failed
        expect(result.station).toContain('Modeled Data (Warning)');
        expect(result.hourly.current_speed?.[0]).toBe(0.5);
        const omSource = result.sources?.find(s => s.name.includes('Weather Model'));
        expect(omSource).toBeDefined();
        expect(omSource?.details).toContain('Warning: Modeled open-ocean data');
    });

    it('should correctly map CHS qualifiers to MaxEbb/MaxFlood', async () => {
        // 1. Open-Meteo
        fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({}) });
        // 2. CHS Tide
        fetchMock.mockResolvedValueOnce({ ok: true, json: async () => [] });
        fetchMock.mockResolvedValueOnce({ ok: true, json: async () => [] });

        // 3. CHS Current (Success)
        fetchMock.mockResolvedValueOnce({
            ok: true,
            json: async () => ([{ eventDate: '2026-02-05T00:00:00Z', value: 3.5 }])
        });

        // 4. CHS Hilo with Qualifiers
        fetchMock.mockResolvedValueOnce({
            ok: true,
            json: async () => ([
                { eventDate: '2026-02-05T01:00:00Z', value: 0.0, qualifier: 'SLACK' },
                { eventDate: '2026-02-05T02:00:00Z', value: 4.5, qualifier: 'EXTREMA_FLOOD' },
                { eventDate: '2026-02-05T03:00:00Z', value: 4.5, qualifier: 'EXTREMA_EBB' }
            ])
        });

        const result = await service.getTides();

        expect(result.hilo).toBeDefined();
        const flood = result.hilo?.find(h => h.time.includes('02:00:00'));
        expect(flood?.type).toBe('Max Flood');

        const ebb = result.hilo?.find(h => h.time.includes('03:00:00'));
        expect(ebb?.type).toBe('Max Ebb');

        const slack = result.hilo?.find(h => h.time.includes('01:00:00'));
        expect(slack?.type).toBe('Slack Water');
    });
    it('should NOT fall back to Open-Meteo when CHS UTC timestamps and OM naive-PDT timestamps differ by 7 hours', async () => {
        // Regression test for timezone mismatch bug:
        // Open-Meteo returns times as naive local strings e.g. "2026-04-08T00:00" (PDT = UTC-7)
        // CHS returns UTC strings e.g. "2026-04-08T07:00:00Z" (same wall-clock moment)
        // Before the fix, mapChsDataToHourly treated OM strings as UTC, creating a 7h offset
        // where no CHS data point fell within MAX_DIFF (45min) of any hourly bucket.
        // All values returned 0 → Max speed = 0 < 2.0 → fallback triggered. WRONG.

        // 1. Open-Meteo — naive PDT strings (no Z), as real API returns them
        fetchMock.mockResolvedValueOnce({
            ok: true,
            json: async () => ({
                utc_offset_seconds: -25200, // PDT = UTC-7
                hourly: {
                    time: ['2026-04-08T00:00', '2026-04-08T01:00', '2026-04-08T02:00'],
                    swell_wave_height: [0.5, 0.5, 0.5],
                    sea_surface_temperature: [9.4],
                    ocean_current_velocity: [0.3, 0.3, 0.3], // Low OM fallback values
                    ocean_current_direction: [180, 180, 180]
                }
            })
        });

        // 2. CHS Tide wlp
        fetchMock.mockResolvedValueOnce({ ok: true, json: async () => [] });
        // 3. CHS Tide wlp-hilo
        fetchMock.mockResolvedValueOnce({ ok: true, json: async () => [] });

        // 4. CHS Current wcsp1 — UTC timestamps corresponding to the SAME hours as OM PDT
        // OM "2026-04-08T00:00" PDT = "2026-04-08T07:00:00Z" UTC
        // OM "2026-04-08T01:00" PDT = "2026-04-08T08:00:00Z" UTC
        // OM "2026-04-08T02:00" PDT = "2026-04-08T09:00:00Z" UTC
        fetchMock.mockResolvedValueOnce({
            ok: true,
            json: async () => ([
                { eventDate: '2026-04-08T07:00:00Z', value: 4.5 }, // Max ebb — must match bucket 0
                { eventDate: '2026-04-08T08:00:00Z', value: 3.9 }, // Must match bucket 1
                { eventDate: '2026-04-08T09:00:00Z', value: 2.8 }  // Must match bucket 2
            ])
        });

        // 5. CHS Hilo wcp1-events
        fetchMock.mockResolvedValueOnce({
            ok: true,
            json: async () => ([
                { eventDate: '2026-04-08T07:00:00Z', value: 4.5, qualifier: 'EXTREMA_EBB' }
            ])
        });

        // Note: no direction mock needed (mock station uses wcp, not wcsp1/wcdp1)

        const result = await service.getTides('07020', '07040');

        // Verify: CHS data was used (max speed 4.5 >> 2.0 → no fallback)
        expect(result.station).not.toContain('Modeled Data (Warning)');
        expect(result.station).toContain('Race Passage');

        // Verify: speed values are from CHS (4.5, 3.9, 2.8) not OM (0.3, 0.3, 0.3)
        expect(result.hourly.current_speed?.[0]).toBeCloseTo(4.5, 1);
        expect(result.hourly.current_speed?.[1]).toBeCloseTo(3.9, 1);
        expect(result.hourly.current_speed?.[2]).toBeCloseTo(2.8, 1);
    });

    it('should interpolate hourly speeds from wcp1-events when wcsp1 returns HTTP 400 (events-only station)', async () => {
        // Regression test for Race Passage (operating:false) where:
        // - wcsp1 continuous series → HTTP 400 (not available for predicted-only stations)
        // - wcp1-events prediction events → HTTP 200 with Slack/Max Ebb/Max Flood
        // Expected: sinusoidal interpolation produces correct speed range, NOT Open-Meteo fallback

        // 1. Open-Meteo — naive PDT strings + UTC offset
        fetchMock.mockResolvedValueOnce({
            ok: true,
            json: async () => ({
                utc_offset_seconds: -25200, // PDT = UTC-7
                hourly: {
                    time: [
                        '2026-04-08T00:00', '2026-04-08T01:00', '2026-04-08T02:00',
                        '2026-04-08T03:00', '2026-04-08T04:00', '2026-04-08T05:00',
                        '2026-04-08T06:00', '2026-04-08T07:00', '2026-04-08T08:00',
                        '2026-04-08T09:00', '2026-04-08T10:00', '2026-04-08T11:00',
                        '2026-04-08T12:00', '2026-04-08T13:00', '2026-04-08T14:00',
                        '2026-04-08T15:00', '2026-04-08T16:00', '2026-04-08T17:00',
                        '2026-04-08T18:00', '2026-04-08T19:00', '2026-04-08T20:00',
                    ],
                    ocean_current_velocity: Array(21).fill(0.3), // Low OM fallback — should NOT be used
                    ocean_current_direction: Array(21).fill(180),
                    swell_wave_height: Array(21).fill(0.5),
                    sea_surface_temperature: [9.4]
                }
            })
        });

        // 2. CHS Tide wlp
        fetchMock.mockResolvedValueOnce({ ok: true, json: async () => [] });
        // 3. CHS Tide wlp-hilo
        fetchMock.mockResolvedValueOnce({ ok: true, json: async () => [] });

        // 4. CHS Current wcsp1 → HTTP 400 (the actual Race Passage scenario)
        fetchMock.mockResolvedValueOnce({ ok: false, status: 400 });

        // 5. CHS wcp1-events → HTTP 200 with real Apr 8 events (BW Dave verified)
        // PDT times converted to UTC (+7h):
        //   Slack   05:38 PDT = 12:38 UTC
        //   Max Ebb 11:43 PDT = 18:43 UTC  (-4.5kn)
        //   Slack   15:54 PDT = 22:54 UTC
        //   Max Flood 19:12 PDT = 02:12+1 UTC (+3.8kn)
        fetchMock.mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: async () => ([
                { eventDate: '2026-04-08T00:11:00Z', value: -2.7, qualifier: 'EXTREMA_EBB' },   // 01:11 PDT Max Ebb
                { eventDate: '2026-04-08T12:38:00Z', value: 0.0,  qualifier: 'SLACK' },          // 05:38 PDT Slack
                { eventDate: '2026-04-08T18:43:00Z', value: -4.5, qualifier: 'EXTREMA_EBB' },   // 11:43 PDT Max Ebb
                { eventDate: '2026-04-08T22:54:00Z', value: 0.0,  qualifier: 'SLACK' },          // 15:54 PDT Slack
            ])
        });

        // 6. CHS Direction → not ok (no direction data)
        fetchMock.mockResolvedValueOnce({ ok: false });

        const result = await service.getTides('07020', '07040');

        // Key assertion: NOT using Open-Meteo modeled data
        expect(result.station).not.toContain('Modeled Data (Warning)');
        expect(result.station).toContain('Race Passage');

        // Verify interpolated max speed is in the correct tidal range (3-5kn) not OM range (0.3kn)
        const maxSpeed = Math.max(...(result.hourly.current_speed || []));
        expect(maxSpeed).toBeGreaterThan(2.0);   // Must exceed suspect threshold
        expect(maxSpeed).toBeLessThan(6.0);       // Physically reasonable for Race Passage

        // Hour 11 PDT = index 11 = near Max Ebb (11:43 PDT) → should be close to 4.5kn
        expect(result.hourly.current_speed?.[11]).toBeGreaterThan(3.0);

        // Hour 05 PDT = index 5 = near Slack (05:38 PDT) → should be near 0
        expect(result.hourly.current_speed?.[5]).toBeLessThan(1.5);
    });
});
