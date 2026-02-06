import { describe, it, expect } from 'vitest';
import { WeatherService } from './weather';

describe('WeatherService API Integration', () => {
    const service = new WeatherService();

    it('should fetch real weather data from Open-Meteo', async () => {
        const data = await service.getWeather();

        // Verify structure
        expect(data).toBeDefined();
        expect(data.current).toBeDefined();
        expect(typeof data.current.temperature).toBe('number');
        expect(typeof data.current.weatherCode).toBe('number');
        expect(typeof data.current.windSpeed).toBe('number');
        expect(typeof data.current.windDirection).toBe('number');
        expect(typeof data.current.windGusts).toBe('number');

        expect(data.daily).toBeDefined();
        expect(Array.isArray(data.daily.weather_code)).toBe(true);
        expect(data.daily.weather_code.length).toBeGreaterThan(0);

        expect(data.hourly).toBeDefined();
        expect(Array.isArray(data.hourly.temperature_2m)).toBe(true);
        expect(Array.isArray(data.hourly.wind_speed_10m)).toBe(true);
        expect(data.hourly.time.length).toBeGreaterThan(0);
    });

    it('should fetch tide data from Open-Meteo', async () => {
        const data = await service.getTides();

        expect(data).toBeDefined();
        expect(data.location).toBe('Lat: 48.37, Lng: -123.73');
        expect(data.hourly).toBeDefined();
        expect(Array.isArray(data.hourly.time)).toBe(true);
        expect(Array.isArray(data.hourly.tide_height)).toBe(true);
        expect(Array.isArray(data.hourly.current_speed)).toBe(true);
        expect(Array.isArray(data.hourly.wave_height)).toBe(true);

        if (data.hourly.time.length > 0) {
            expect(data.hourly.tide_height.length).toBeGreaterThan(0);
            expect(data.hourly.current_speed?.length).toBeGreaterThan(0);
            expect(data.hourly.wave_height?.length).toBeGreaterThan(0);
            expect(data.hourly.wave_period?.length).toBeGreaterThan(0);
        }

        expect(data.sources?.length).toBeGreaterThan(0);
    });

});
