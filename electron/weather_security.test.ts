import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { weatherService } from './weather';

describe('WeatherService Security', () => {
    const fetchMock = vi.fn();

    beforeEach(() => {
        global.fetch = fetchMock;
        fetchMock.mockResolvedValue({
            ok: true,
            json: async () => ({
                current: {}, daily: {}, hourly: { time: [] }
            })
        });
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('should validate latitude input to prevent parameter injection', async () => {
        // Attack payload: injecting extra query parameters
        // We cast to any to simulate IPC call passing a string where a number is expected
        const maliciousLat = "50&hourly=sensitive_data" as any;

        // This should throw an error due to input validation
        // The new validation throws 'Invalid coordinate type' for non-number inputs
        await expect(weatherService.getWeather(maliciousLat, -123.0))
            .rejects.toThrow('Invalid coordinate type');
    });

    it('should validate longitude input to prevent parameter injection', async () => {
        const maliciousLng = "-123&hourly=sensitive_data" as any;
        await expect(weatherService.getWeather(50.0, maliciousLng))
            .rejects.toThrow('Invalid coordinate type');
    });

    it('should throw error for invalid latitude value', async () => {
        await expect(weatherService.getWeather(91, 0)).rejects.toThrow('Invalid latitude');
        await expect(weatherService.getWeather(-91, 0)).rejects.toThrow('Invalid latitude');
    });

    it('should throw error for invalid longitude value', async () => {
        await expect(weatherService.getWeather(0, 181)).rejects.toThrow('Invalid longitude');
        await expect(weatherService.getWeather(0, -181)).rejects.toThrow('Invalid longitude');
    });

    it('should throw error for invalid coordinate types', async () => {
        // @ts-expect-error - testing type safety
        await expect(weatherService.getWeather('invalid', 0)).rejects.toThrow('Invalid coordinate type');
        // @ts-expect-error - testing type safety
        await expect(weatherService.getWeather(0, 'invalid')).rejects.toThrow('Invalid coordinate type');
    });

    it('should validate coordinates in getTides', async () => {
        const maliciousLat = "50&hourly=sensitive_data" as any;
        await expect(weatherService.getTides('07020', '07090', maliciousLat, -123.0))
            .rejects.toThrow('Invalid coordinate type');

        await expect(weatherService.getTides('code', 'code', 91, 0)).rejects.toThrow('Invalid latitude');
    });
});
