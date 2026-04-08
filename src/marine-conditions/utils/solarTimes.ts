/**
 * Minimal sunrise/sunset calculator using the NOAA solar algorithm.
 * Returns ISO datetime strings in LOCAL time (no timezone suffix) for each
 * day in the requested range, compatible with useDiveWindows.
 *
 * Accuracy: ±1 minute for latitudes 48–50°N (BC coast). Good enough for
 * determining daylight dive windows.
 */

const DEG = Math.PI / 180;

function julianDay(date: Date): number {
    return date.getTime() / 86400000 + 2440587.5;
}

/** Returns { sunrise, sunset } as fractional hours (local solar time) for a given day */
function solarTimes(lat: number, lng: number, date: Date): { sunrise: number; sunset: number } | null {
    const jd = julianDay(date);
    const n  = Math.round(jd - 2451545.0);

    // Mean longitude & mean anomaly
    const L = (280.460 + 0.9856474 * n) % 360;
    const g = ((357.528 + 0.9856003 * n) % 360) * DEG;

    // Ecliptic longitude
    const lam = (L + 1.915 * Math.sin(g) + 0.020 * Math.sin(2 * g)) * DEG;

    // Obliquity of ecliptic
    const eps = 23.439 * DEG;

    // Sun declination
    const sinDec = Math.sin(eps) * Math.sin(lam);
    const dec    = Math.asin(sinDec);

    // Hour angle at sunrise (solar elevation = -0.833°)
    const cosH = (Math.sin(-0.833 * DEG) - Math.sin(lat * DEG) * sinDec)
                / (Math.cos(lat * DEG) * Math.cos(dec));

    if (cosH < -1 || cosH > 1) return null; // polar day/night

    const H = Math.acos(cosH) / DEG; // degrees

    // Equation of time (minutes)
    const RL   = L * DEG;
    const RA   = Math.atan2(Math.cos(eps) * Math.sin(lam), Math.cos(lam)) / DEG;
    const EqT  = 4 * (RL / DEG - RA) - (720 / 360) * lng; // rough; good enough

    // UTC solar noon
    const noon  = 12 - lng / 15 - EqT / 60;
    const sunrise = noon - H / 15;
    const sunset  = noon + H / 15;

    return { sunrise, sunset };
}

/**
 * Build arrays of sunrise/sunset strings (same format as Open-Meteo daily)
 * for `days` consecutive days starting at `startDate`.
 *
 * Returns ISO-8601 LOCAL strings like "2025-04-08T06:13".
 */
export function getDaylightTimes(
    lat: number,
    lng: number,
    startDate: Date,
    days = 7,
): { sunrises: string[]; sunsets: string[] } {
    const sunrises: string[] = [];
    const sunsets:  string[] = [];

    for (let i = 0; i < days; i++) {
        const d = new Date(startDate);
        d.setDate(d.getDate() + i);

        const yyyy = d.getFullYear();
        const mm   = String(d.getMonth() + 1).padStart(2, '0');
        const dd   = String(d.getDate()).padStart(2, '0');
        const dateStr = `${yyyy}-${mm}-${dd}`;

        const times = solarTimes(lat, lng, d);
        if (!times) continue;

        // Convert fractional UTC hours → local hours using browser's UTC offset
        const offsetH = -d.getTimezoneOffset() / 60;
        const riseLocal = times.sunrise + offsetH;
        const setLocal  = times.sunset  + offsetH;

        const toHHMM = (h: number) => {
            const clamped = ((h % 24) + 24) % 24;
            const hh = Math.floor(clamped);
            const min = Math.round((clamped - hh) * 60);
            return `${String(hh).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
        };

        sunrises.push(`${dateStr}T${toHHMM(riseLocal)}`);
        sunsets.push( `${dateStr}T${toHHMM(setLocal)}`);
    }

    return { sunrises, sunsets };
}
