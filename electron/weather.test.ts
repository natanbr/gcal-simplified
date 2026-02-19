import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { WeatherService } from './weather';

describe('WeatherService API Integration', () => {
    const service = new WeatherService();

    // Mock fetch
    const fetchMock = vi.fn();

    beforeEach(() => {
        vi.stubGlobal('fetch', fetchMock);
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('should fetch real weather data from Open-Meteo', async () => {
        fetchMock.mockResolvedValue({
            ok: true,
            json: async () => ({
                current: {
                    temperature_2m: 20,
                    weather_code: 1,
                    wind_speed_10m: 10,
                    wind_direction_10m: 180,
                    wind_gusts_10m: 15
                },
                daily: {
                    sunrise: ['2023-01-01T06:00'],
                    sunset: ['2023-01-01T18:00'],
                    weather_code: [1, 2],
                    temperature_2m_max: [25, 26],
                    temperature_2m_min: [15, 16]
                },
                hourly: {
                    time: ['2023-01-01T00:00', '2023-01-01T01:00'],
                    temperature_2m: [20, 21],
                    precipitation_probability: [0, 0],
                    weather_code: [1, 1],
                    wind_speed_10m: [10, 11],
                    wind_direction_10m: [180, 180],
                    wind_gusts_10m: [15, 16]
                }
            })
        });

        const data = await service.getWeather();

        // Verify structure
        expect(data).toBeDefined();
        expect(data.current).toBeDefined();
        expect(data.current.temperature).toBe(20);
        expect(data.daily).toBeDefined();
        expect(data.hourly).toBeDefined();
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('should fetch tide data from Open-Meteo', async () => {
        // Mock responses based on URL (simple check)
        fetchMock.mockImplementation(async (url: string) => {
            if (url.includes('open-meteo')) {
                return {
                    ok: true,
                    json: async () => ({
                        hourly: {
                            time: ['2023-01-01T00:00', '2023-01-01T01:00'],
                            wave_height: [1.2, 1.3],
                            wave_period: [5, 6],
                            ocean_current_velocity: [0.5, 0.6],
                            ocean_current_direction: [90, 95]
                        }
                    })
                };
            }
            if (url.includes('api-iwls')) {
                return {
                    ok: true,
                    json: async () => ([
                        { eventDate: '2023-01-01T00:00:00Z', value: 2.5, qualifier: 'SLACK' },
                        { eventDate: '2023-01-01T01:00:00Z', value: 3.0, qualifier: 'EXTREMA_FLOOD' }
                    ])
                };
            }
            return { ok: false };
        });

        const data = await service.getTides();

        expect(data).toBeDefined();
        // Since we mocked minimal data, check what we provided
        expect(data.hourly).toBeDefined();
        expect(data.hourly.time).toHaveLength(2);
        expect(data.hourly.wave_height).toHaveLength(2);
    });

});
