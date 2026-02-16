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
        await expect(weatherService.getWeather(maliciousLat, -123.0))
            .rejects.toThrow(/Invalid coordinates/);
    });

    it('should validate longitude input to prevent parameter injection', async () => {
        const maliciousLng = "-123&hourly=sensitive_data" as any;
        await expect(weatherService.getWeather(50.0, maliciousLng))
            .rejects.toThrow(/Invalid coordinates/);
    });

    it('should validate coordinates in getTides', async () => {
        const maliciousLat = "50&hourly=sensitive_data" as any;
        await expect(weatherService.getTides('07020', '07090', maliciousLat, -123.0))
            .rejects.toThrow(/Invalid coordinates/);
    });
});
