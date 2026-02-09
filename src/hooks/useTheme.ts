import { useState, useEffect } from 'react';
import { UserConfig, WeatherData } from '../types';
import { calculateThemeState } from '../utils/themeLogic';

export function useTheme(config: UserConfig, weather: WeatherData | null) {
    // Default to dark initially to avoid flash? Or calculate immediately?
    // We can calculate immediately if config/weather provided, else dark.
    const [theme, setTheme] = useState<'light' | 'dark'>('dark');

    useEffect(() => {
        const updateTheme = () => {
            const newTheme = calculateThemeState(config, new Date(), weather);
            setTheme(newTheme);

            const root = window.document.documentElement;
            // Tailwind 'class' strategy looks for .dark on html or body.
            // Usually html is safer.
            if (newTheme === 'dark') {
                root.classList.add('dark');
            } else {
                root.classList.remove('dark');
            }
        };

        updateTheme();

        // Check every minute for time-based switch
        const interval = setInterval(updateTheme, 60 * 1000);
        return () => clearInterval(interval);
    }, [config, weather]);

    return theme;
}
