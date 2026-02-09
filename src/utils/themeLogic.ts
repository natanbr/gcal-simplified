import { UserConfig, WeatherData } from '../types';

export function calculateThemeState(
    config: UserConfig,
    currentTime: Date,
    weather: WeatherData | null
): 'light' | 'dark' {
    // 1. Manual Mode
    if (config.themeMode === 'manual') {
        const start = config.manualDayStart ?? 7;
        const end = config.manualDayEnd ?? 19;

        const currentHour = currentTime.getHours();

        if (start < end) {
            // Normal range: 7 to 19
            return (currentHour >= start && currentHour < end) ? 'light' : 'dark';
        } else if (start > end) {
            // Wrap around: 20 to 6 (Day is night?)
            // Usually means Light Mode is active from 20:00 to 06:00
            return (currentHour >= start || currentHour < end) ? 'light' : 'dark';
        } else {
            // Start == End. Always dark?
            return 'dark';
        }
    }

    // 2. Auto Mode (Sunrise/Sunset)

    // Fallback if no weather data
    if (!weather || !weather.daily || !weather.daily.sunrise || !weather.daily.sunset) {
         const currentHour = currentTime.getHours();
         // Default fallback: 7am to 7pm is Day
         return (currentHour >= 7 && currentHour < 19) ? 'light' : 'dark';
    }

    // Parse today's sunrise/sunset
    // We assume the weather data is reasonably fresh.
    // Sunrise strings are ISO-ish: "2023-10-25T07:45"

    const todayStr = currentTime.toISOString().split('T')[0];

    let sunriseTime = 0;
    let sunsetTime = 0;

    // Find the sunrise/sunset for the current calendar day
    const sunriseIndex = weather.daily.sunrise.findIndex(s => s.startsWith(todayStr));
    const sunsetIndex = weather.daily.sunset.findIndex(s => s.startsWith(todayStr));

    // Use index 0 as fallback if today not found (maybe TZ shift)
    // But be careful: if index 0 is yesterday, we might use yesterday's times.
    // Ideally we want closest.

    const safeSunriseStr = sunriseIndex >= 0 ? weather.daily.sunrise[sunriseIndex] : weather.daily.sunrise[0];
    const safeSunsetStr = sunsetIndex >= 0 ? weather.daily.sunset[sunsetIndex] : weather.daily.sunset[0];

    if (safeSunriseStr && safeSunsetStr) {
        sunriseTime = new Date(safeSunriseStr).getTime();
        sunsetTime = new Date(safeSunsetStr).getTime();
    }

    if (sunriseTime === 0 || sunsetTime === 0 || isNaN(sunriseTime) || isNaN(sunsetTime)) {
        // Fallback
        const currentHour = currentTime.getHours();
        return (currentHour >= 7 && currentHour < 19) ? 'light' : 'dark';
    }

    const now = currentTime.getTime();
    return (now >= sunriseTime && now < sunsetTime) ? 'light' : 'dark';
}
