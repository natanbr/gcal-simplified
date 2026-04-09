// ── Marine Conditions — Type Definitions ──────────────────────────────────────
// TideData moved here from src/types.ts — it is only consumed by this module.

// ── Raw API types ─────────────────────────────────────────────────────────────

export interface TideData {
    location?: string;
    station?: string;
    water_temperature?: number;
    sunrise?: string[];       // ISO strings per day (from OM daily)
    sunset?: string[];        // ISO strings per day (from OM daily)
    hourly: {
        time: string[];
        tide_height: number[];
        current_speed?: number[];
        current_direction?: number[];
        wave_height?: number[];
        wave_period?: number[];
    };
    hilo?: {
        time: string;
        value: number;
        type: string;
    }[];
    sources?: {
        name: string;
        details: string;
    }[];
}

// ── Domain types ──────────────────────────────────────────────────────────────

export type ActivityProfile = 'diving' | 'surfing';

export type MarineEventType =
    | 'Slack'
    | 'Max Flood'
    | 'Max Ebb'
    | 'High Tide'
    | 'Low Tide'
    | 'separator';

export interface MarineEvent {
    type: MarineEventType;
    time: string;           // ISO string
    currentSpeed?: number;  // knots
    tideHeight?: number;    // metres
    swellHeight?: number;   // metres
    windSpeed?: number;     // knots
    label?: string;         // day separator text, e.g. "Tuesday, Apr 1"
}

export interface DiveWindow {
    slackTime: string;      // ISO - exact slack moment
    windowStart: string;    // ISO - when speed drops below threshold
    windowEnd: string;      // ISO - when speed rises above threshold
    duration: number;       // minutes
    currentSpeed: number;   // knots at slack
    currentAtStart: number; // knots at windowStart (interpolated from wcp)
    currentAtEnd: number;   // knots at windowEnd (interpolated from wcp)
    currentRampRate: number;// kn/hr — rate of change across window (+ = building, - = ebbing)
    tideHeight: number;     // metres at slack
    isHighTide: boolean;
    isDaylight: boolean;
    activityScore: {
        diving: number;     // 0–100, computed via min(7-factor model)
        surfing: number;    // 0–100 (future)
    };
}

// ── Location ──────────────────────────────────────────────────────────────────

export interface MarineLocation {
    id: string;
    name: string;
    tideStation: string;
    currentStation: string;
    coords: { lat: number; lng: number };
}

// ── Settings (persisted to localStorage) ─────────────────────────────────────

export interface MarineSettings {
    locationId: string;
    tempUnit: 'C' | 'F';
    // Future: distanceUnit, pressureUnit, etc.
}

// ── Chart-ready data (recharts) ───────────────────────────────────────────────

export interface MarineHourlyPoint {
    time: string;           // ISO — recharts x-axis key
    tideHeight: number;     // metres
    currentSpeed: number;   // knots
    swellHeight: number;    // metres
    isForecast: boolean;
}

export interface MarineChartData {
    hourly: MarineHourlyPoint[];
    extremes: Array<{
        time: string;
        type: MarineEventType;
        value: number;
    }>;
}

// ── Conditions panel ──────────────────────────────────────────────────────────

export interface MarineConditionsSnapshot {
    swellHeight?: number;   // metres
    swellPeriod?: number;   // seconds
    swellDirection?: string; // e.g. "NORTH WEST"
    waterTemp?: number;     // °C (sea surface)
    airTempC?: number;      // °C (air temperature at 2m)
    airFeelsLikeC?: number; // °C (wind chill / feels-like)
    windSpeed?: number;     // knots
    windGust?: number;      // knots
    windDirection?: string; // e.g. "NW"
    visibilityEst?: number; // metres (~6m)
    visibilityQuality?: 'GOOD' | 'FAIR' | 'POOR';
    isSuspect?: boolean;    // CHS data suspect flag
}
