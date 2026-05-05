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


});
