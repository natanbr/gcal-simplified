import { describe, it, expect } from 'vitest';
import { calculateThemeState } from './themeLogic';
import { UserConfig, WeatherData } from '../types';

describe('calculateThemeState', () => {
    const baseConfig: UserConfig = {
        calendarIds: [],
        taskListIds: [],
        themeMode: 'manual',
        manualDayStart: 8,
        manualDayEnd: 20,
        sleepEnabled: true,
        sleepStart: 22,
        sleepEnd: 6
    };

    it('should use manual mode correctly (Day)', () => {
        const config: UserConfig = { ...baseConfig, themeMode: 'manual' };
        const noon = new Date('2023-01-01T12:00:00');
        expect(calculateThemeState(config, noon, null)).toBe('light');
    });

    it('should use manual mode correctly (Night)', () => {
        const config: UserConfig = { ...baseConfig, themeMode: 'manual' };
        const night = new Date('2023-01-01T22:00:00');
        expect(calculateThemeState(config, night, null)).toBe('dark');
    });

    it('should handle wrap-around manual mode', () => {
        const config: UserConfig = {
            ...baseConfig,
            themeMode: 'manual',
            manualDayStart: 20, // 8pm
            manualDayEnd: 6,    // 6am
        };
        // 20->6 is Light Mode

        const midnight = new Date('2023-01-01T00:00:00');
        expect(calculateThemeState(config, midnight, null)).toBe('light');

        const noon = new Date('2023-01-01T12:00:00');
        expect(calculateThemeState(config, noon, null)).toBe('dark');
    });

    it('should use auto mode with weather data', () => {
        const config: UserConfig = {
            ...baseConfig,
            themeMode: 'auto',
        };
        const weather: WeatherData = {
            current: { temperature: 0, weatherCode: 0, windSpeed: 0 },
            daily: {
                sunrise: ['2023-01-01T06:00'],
                sunset: ['2023-01-01T18:00'],
                weather_code: [], temperature_2m_max: [], temperature_2m_min: []
            },
            hourly: { time: [], temperature_2m: [], precipitation_probability: [], weather_code: [] }
        };

        // Before sunrise (Dark)
        const early = new Date('2023-01-01T05:00:00');
        expect(calculateThemeState(config, early, weather)).toBe('dark');

        // Day (Light)
        const day = new Date('2023-01-01T12:00:00');
        expect(calculateThemeState(config, day, weather)).toBe('light');

        // After sunset (Dark)
        const night = new Date('2023-01-01T20:00:00');
        expect(calculateThemeState(config, night, weather)).toBe('dark');
    });

    it('should handle auto mode fallback (no weather)', () => {
        const config: UserConfig = { ...baseConfig, themeMode: 'auto' };
        // Default fallback is 7am-7pm

        const day = new Date('2023-01-01T12:00:00');
        expect(calculateThemeState(config, day, null)).toBe('light');

        const night = new Date('2023-01-01T22:00:00');
        expect(calculateThemeState(config, night, null)).toBe('dark');
    });
});
