export interface AppEvent {
    id: string;
    title: string;
    start: Date;
    end: Date;
    allDay?: boolean;
    isHoliday?: boolean;
    description?: string;
    location?: string;
    colorId?: string;
    color?: string; // Hex color for calendar color inheritance
}

export interface AppTask {
    id: string;
    title: string;
    status: 'needsAction' | 'completed';
}

export interface CalendarSource {
    id: string;
    summary: string;
    backgroundColor?: string;
    primary?: boolean;
}

export interface TaskListSource {
    id: string;
    title: string;
    updated: string;
}

export interface UserConfig {
    calendarIds: string[];
    taskListIds: string[];
    activeHoursStart?: number; // 0-23
    activeHoursEnd?: number;   // 0-23

    // Theme & Power Settings
    themeMode?: 'auto' | 'manual';
    manualDayStart?: number; // 0-23 (Default 7)
    manualDayEnd?: number;   // 0-23 (Default 19)
    sleepEnabled?: boolean;  // Default true
    sleepStart?: number;     // 0-23 (Default 22)
    sleepEnd?: number;       // 0-23 (Default 6)

    weekStartDay?: 'sunday' | 'monday' | 'today';
}

export interface WeatherData {
    current: {
        temperature: number;
        weatherCode: number;
        windSpeed: number;
        windDirection?: number;
        windGusts?: number;
    };
    daily: {
        sunrise: string[];
        sunset: string[];
        weather_code: number[];
        temperature_2m_max: number[];
        temperature_2m_min: number[];
    };
    hourly: {
        time: string[];
        temperature_2m: number[];
        precipitation_probability: number[];
        weather_code: number[];
        wind_speed_10m?: number[];
        wind_direction_10m?: number[];
        wind_gusts_10m?: number[];
    };
}

export interface TideData {
    location?: string;
    station?: string;
    water_temperature?: number;
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
