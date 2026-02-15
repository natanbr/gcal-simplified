import { describe, it, expect } from 'vitest';
import { WeatherService } from './weather';

describe('WeatherService Security', () => {
    const service = new WeatherService();

    it('should reject invalid latitude', async () => {
        // @ts-expect-error - Testing invalid input
        await expect(service.getWeather("invalid", -123)).rejects.toThrow(/Invalid latitude/);
        // @ts-expect-error - Testing invalid input
        await expect(service.getWeather(100, -123)).rejects.toThrow(/Invalid latitude/); // > 90
        // @ts-expect-error - Testing invalid input
        await expect(service.getWeather(-91, -123)).rejects.toThrow(/Invalid latitude/); // < -90
    });

    it('should reject invalid longitude', async () => {
        // @ts-expect-error - Testing invalid input
        await expect(service.getWeather(50, "invalid")).rejects.toThrow(/Invalid longitude/);
        // @ts-expect-error - Testing invalid input
        await expect(service.getWeather(50, 200)).rejects.toThrow(/Invalid longitude/); // > 180
        // @ts-expect-error - Testing invalid input
        await expect(service.getWeather(50, -181)).rejects.toThrow(/Invalid longitude/); // < -180
    });

    it('should prevent parameter injection', async () => {
         // @ts-expect-error - Testing invalid input
         await expect(service.getWeather("50&evil=true", -123)).rejects.toThrow(/Invalid latitude/);
    });
});
