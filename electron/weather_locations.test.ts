
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WeatherService } from './weather';

// Mock global fetch
const fetchMock = vi.fn();
globalThis.fetch = fetchMock;

// Mock stations.json load
vi.mock('../stations.json', () => ({
    default: [
        {
            id: '5cebf1df3d0f4a073c4bbd0f', // Real ID for Sooke
            code: '07020',
            officialName: 'Sooke',
            latitude: 48.3746,
            longitude: -123.7276,
            timeSeries: [{ code: 'wlp' }, { code: 'wlp-hilo' }]
        },
        {
            id: '63aeee896a2b9417c034d337',
            code: '07090', // Hypothetical code for Race Passage in this mock
            officialName: 'Race Passage',
            latitude: 48.3066,
            longitude: -123.5366,
            timeSeries: [{ code: 'wcp' }, { code: 'wcp-hilo' }]
        },
        {
            id: '63aef09f84e5432cd3b6c509',
            code: '07527',
            officialName: 'Active Pass',
            latitude: 48.860444,
            longitude: -123.312759,
            timeSeries: [
                { code: 'wlp' }, { code: 'wlp-hilo' },
                { code: 'wcp' }, { code: 'wcp1-events' }
            ]
        }
    ]
}));

describe('WeatherService - Multi-Location Support', () => {
    let service: WeatherService;

    beforeEach(() => {
        service = new WeatherService();
        fetchMock.mockReset();
        // Default success for Open-Meteo
        fetchMock.mockImplementation((url) => {
            if (url.toString().includes('open-meteo')) {
                return Promise.resolve({
                    ok: true,
                    json: async () => ({ hourly: { time: [], sea_surface_temperature: [10] } })
                });
            }
            // Default empty response for others
            return Promise.resolve({
                ok: true,
                json: async () => []
            });
        });
    });

    it('should fetch data for specific station codes passed as arguments', async () => {
        // Pass IDs for Sooke and Race Passage
        // Note: getTides signature will need to be updated to accept these
        const config = {
            tideStation: '07020',
            currentStation: '07090'
        };

        // We expect getTides to accept arguments now. 
        await service.getTides(config.tideStation, config.currentStation);

        // Verify that the fetch call used the correct Station IDs (mapped from stations.json)
        // Sooke ID: 5cebf1df3d0f4a073c4bbd0f
        // Race Passage ID: 63aeee896a2b9417c034d337

        const calls = fetchMock.mock.calls.map(c => c[0] as string);
        const tideCall = calls.find(url => url.includes('stations/5cebf1df3d0f4a073c4bbd0f'));
        const currentCall = calls.find(url => url.includes('stations/63aeee896a2b9417c034d337'));

        expect(tideCall).toBeDefined();
        expect(tideCall).toContain('time-series-code=wlp');

        expect(currentCall).toBeDefined();
        // Race uses wcp in our mock
        expect(currentCall).toContain('time-series-code=wcp');
    });

    it('should handle same station for both tide and current (Active Pass)', async () => {
        const config = {
            tideStation: '07527', // Active Pass
            currentStation: '07527' // Active Pass
        };

        await service.getTides(config.tideStation, config.currentStation);

        const calls = fetchMock.mock.calls.map(c => c[0] as string);

        // Should fetch from Active Pass ID: 63aef09f84e5432cd3b6c509
        const activePassCalls = calls.filter(url => url.includes('stations/63aef09f84e5432cd3b6c509'));

        // Should have wlp (tide) call
        expect(activePassCalls.some(url => url.includes('time-series-code=wlp'))).toBe(true);
        // Should have wcp (current) call
        expect(activePassCalls.some(url => url.includes('time-series-code=wcp'))).toBe(true);
    });
});
