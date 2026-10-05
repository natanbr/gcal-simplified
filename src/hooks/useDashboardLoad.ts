import { useState, useCallback, useRef, useEffect } from 'react';
import { AppTask, UserConfig, WeatherData, WeekStartDay } from '../types';

/** config.json's settings; null when it cannot be read now (another program holds it). */
async function readSettings(): Promise<UserConfig | null> {
    try {
        return (await window.ipcRenderer?.invoke('settings:get') as UserConfig | undefined) ?? null;
    } catch {
        return null;
    }
}

/**
 * The Dashboard's settings, tasks and weather, and the `generation` its events follow.
 *
 * A load reads the settings first (or takes the config Settings has just saved, rather than reading
 * config.json again while antivirus may hold it), then starts a new events generation, so the events
 * are requested for the saved settings and are requested again even when nothing in them changed.
 * Generation 0 means the settings have not been read yet: no events request. Loads can overlap
 * (launch, Save, reconnect): only the newest one applies what it reads and ends the loading state.
 */
export function useDashboardLoad() {
    const [config, setConfig] = useState<UserConfig>({ calendarIds: [], taskListIds: [] });
    const [tasks, setTasks] = useState<AppTask[]>([]);
    const [weather, setWeather] = useState<WeatherData | null>(null);
    const [loading, setLoading] = useState(true);
    const [loadingMessage, setLoadingMessage] = useState('Loading Settings...');
    const [generation, setGeneration] = useState(0);
    const latestLoad = useRef(0);

    /** Tasks and weather, side by side. Optional: a failure is only logged, and an answer a newer load overtook is dropped. */
    const readOptional = useCallback(() => {
        const load = latestLoad.current;
        const readQuietly = async (channel: 'data:tasks' | 'weather:get', apply: (answer: unknown) => void) => {
            const ipc = window.ipcRenderer;
            if (!ipc) return;
            try {
                const answer = await ipc.invoke(channel);
                if (load === latestLoad.current) apply(answer);
            } catch (err) {
                console.error(`Failed to read ${channel}`, err);
            }
        };
        return Promise.all([
            readQuietly('data:tasks', answer => setTasks(answer as AppTask[])),
            readQuietly('weather:get', answer => setWeather(answer as WeatherData)),
        ]);
    }, []);

    const reload = useCallback(async (saved?: UserConfig) => {
        const load = ++latestLoad.current;
        const isLatest = () => load === latestLoad.current;
        setLoading(true);
        try {
            if (saved) {
                setConfig(prev => ({ ...prev, ...saved }));
            } else {
                setLoadingMessage('Loading Settings...');
                const read = await readSettings();
                if (read && isLatest()) setConfig(read);
            }
        } finally {
            if (isLatest()) setGeneration(g => g + 1);
        }
        try {
            if (isLatest()) setLoadingMessage('Updating Tasks & Weather...');
            await readOptional();
        } finally {
            if (isLatest()) setLoading(false);
        }
    }, [readOptional]);

    useEffect(() => { void reload(); }, [reload]);

    // A reconnect (Settings → Reconnect Account) loads everything again.
    useEffect(() => window.ipcRenderer?.on('auth:success', () => { void reload(); }), [reload]);

    // The one place an absent week start is resolved, as electron/store.ts defaults it.
    const weekStartDay: WeekStartDay = config.weekStartDay ?? 'today';

    return { config, weekStartDay, tasks, weather, loading, loadingMessage, generation, reload, readOptional };
}
