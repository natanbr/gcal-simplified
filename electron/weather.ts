import { WeatherData } from '../src/types';

const SOOKE_LAT = 48.3746;
const SOOKE_LONG = -123.7276;

export class WeatherService {

    private validateCoordinates(lat: unknown, lng: unknown): void {
        if (typeof lat !== 'number' || typeof lng !== 'number') {
            throw new Error('Invalid coordinate type');
        }
        if (lat < -90 || lat > 90) {
            throw new Error('Invalid latitude');
        }
        if (lng < -180 || lng > 180) {
            throw new Error('Invalid longitude');
        }
    }

    async getWeather(lat: number = SOOKE_LAT, lng: number = SOOKE_LONG): Promise<WeatherData> {
        this.validateCoordinates(lat, lng);

        const url = new URL('https://api.open-meteo.com/v1/forecast');
        url.searchParams.append('latitude', lat.toString());
        url.searchParams.append('longitude', lng.toString());
        url.searchParams.append('current', 'temperature_2m,weather_code,wind_speed_10m,wind_direction_10m,wind_gusts_10m');
        url.searchParams.append('hourly', 'temperature_2m,precipitation_probability,weather_code,wind_speed_10m,wind_direction_10m,wind_gusts_10m');
        url.searchParams.append('daily', 'sunrise,sunset,weather_code,temperature_2m_max,temperature_2m_min');
        url.searchParams.append('timezone', 'auto');
        url.searchParams.append('forecast_days', '16');

        try {
            const response = await fetch(url.toString());
            if (!response.ok) throw new Error('Weather fetch failed');
            const data = await response.json();

            return {
                current: {
                    temperature: data.current.temperature_2m,
                    weatherCode: data.current.weather_code,
                    windSpeed: data.current.wind_speed_10m,
                    windDirection: data.current.wind_direction_10m,
                    windGusts: data.current.wind_gusts_10m
                },
                daily: {
                    time: data.daily.time,
                    sunrise: data.daily.sunrise,
                    sunset: data.daily.sunset,
                    weather_code: data.daily.weather_code,
                    temperature_2m_max: data.daily.temperature_2m_max,
                    temperature_2m_min: data.daily.temperature_2m_min
                },
                hourly: {
                    time: data.hourly.time,
                    temperature_2m: data.hourly.temperature_2m,
                    precipitation_probability: data.hourly.precipitation_probability,
                    weather_code: data.hourly.weather_code,
                    wind_speed_10m: data.hourly.wind_speed_10m,
                    wind_direction_10m: data.hourly.wind_direction_10m,
                    wind_gusts_10m: data.hourly.wind_gusts_10m
                }
            };
        } catch (error) {
            console.error('Error fetching weather:', error);
            throw error;
        }
    }
}



export const weatherService = new WeatherService();
