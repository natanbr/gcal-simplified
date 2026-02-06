
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
});
