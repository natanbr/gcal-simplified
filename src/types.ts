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

export type SerializedAppEvent = Omit<AppEvent, 'start' | 'end'> & {
    start: string;
    end: string;
};

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

/** The first day of the week view. A display setting only: the events request does not depend on it. */
export type WeekStartDay = 'sunday' | 'monday' | 'today';

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

    weekStartDay?: WeekStartDay; // absent means 'today', as in electron/store.ts
}

/** Why the main process wrote nothing (mirrors electron/store.ts WriteResult).
 *  `file` is the settings file's full path, for the message the user reads. */
export interface SettingsWriteFailure {
    ok: false;
    /** locked: another program holds the file · unreadable: it could not be read · write-failed: disk, permissions */
    reason: 'locked' | 'unreadable' | 'write-failed';
    code?: string;
    file: string;
}

/** What `settings:save` resolves to. It never rejects for a refused write. */
export type SaveSettingsResult = { ok: true } | SettingsWriteFailure;

export interface WeatherData {
    current: {
        temperature: number;
        weatherCode: number;
        windSpeed: number;
        windDirection?: number;
        windGusts?: number;
    };
    daily: {
        time: string[];
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


