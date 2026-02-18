import { describe, it, expect } from 'vitest';
import { WeatherService } from './weather';

describe('WeatherService Security', () => {
    const service = new WeatherService();

    it('should throw error for invalid latitude (> 90)', async () => {
        await expect(service.getWeather(91, 0)).rejects.toThrow('Invalid latitude');
    });

    it('should throw error for invalid latitude (< -90)', async () => {
        await expect(service.getWeather(-91, 0)).rejects.toThrow('Invalid latitude');
    });

    it('should throw error for invalid longitude (> 180)', async () => {
        await expect(service.getWeather(0, 181)).rejects.toThrow('Invalid longitude');
    });

    it('should throw error for invalid longitude (< -180)', async () => {
        await expect(service.getWeather(0, -181)).rejects.toThrow('Invalid longitude');
    });

    it('should throw error for invalid latitude in getTides', async () => {
        await expect(service.getTides('07020', '07090', 91, 0)).rejects.toThrow('Invalid latitude');
    });
});
