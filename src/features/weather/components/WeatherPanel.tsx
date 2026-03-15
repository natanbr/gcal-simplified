import React from 'react';
import { WeatherData } from '../../../types';
import { format } from 'date-fns';
import { getWeatherIcon } from '../../../utils/weatherIcons';

export const WeatherPanel: React.FC<{ weather: WeatherData }> = ({ weather }) => {
    // Current hour index
    const now = new Date();
    const currentHourStr = format(now, "yyyy-MM-dd'T'HH:00");
    const startIndex = weather.hourly.time.findIndex(t => t.startsWith(currentHourStr));
    const hourlyData = startIndex !== -1 ? weather.hourly.time.slice(startIndex, startIndex + 24) : [];

    return (
        <div className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
                <div className="bg-zinc-50 dark:bg-zinc-800/50 p-4 rounded-xl border border-zinc-200 dark:border-zinc-700/50">
                    <div className="text-zinc-500 dark:text-zinc-500 text-xs font-bold uppercase mb-1">Temperature</div>
                    <div className="text-3xl font-black text-zinc-900 dark:text-white">{Math.round(weather.current.temperature)}°C</div>
                </div>
                <div className="bg-zinc-50 dark:bg-zinc-800/50 p-4 rounded-xl border border-zinc-200 dark:border-zinc-700/50">
                    <div className="text-zinc-500 dark:text-zinc-500 text-xs font-bold uppercase mb-1">Wind</div>
                    <div className="text-3xl font-black text-zinc-900 dark:text-white">{Math.round(weather.current.windSpeed)} <span className="text-sm font-normal text-zinc-400 dark:text-zinc-400">km/h</span></div>
                </div>
            </div>

            <div data-testid="hourly-forecast-section">
                <h3 className="text-zinc-400 dark:text-zinc-400 font-bold uppercase text-xs tracking-widest mb-4">Hourly Forecast</h3>
                <div className="bg-zinc-50 dark:bg-zinc-800/30 rounded-lg overflow-hidden border border-zinc-200 dark:border-zinc-700/50">
                     <table className="w-full text-left text-sm">
                         <thead className="bg-zinc-100 dark:bg-zinc-900/50 text-zinc-500 dark:text-zinc-500 text-xs uppercase font-bold">
                             <tr>
                                 <th className="p-2">Time</th>
                                 <th className="p-2">Cond</th>
                                 <th className="p-2 text-right">Temp</th>
                                 <th className="p-2 text-right">Rain</th>
                                 <th className="p-2 text-right">Wind</th>
                             </tr>
                         </thead>
                         <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800/50">
                            {hourlyData.map((time, i) => {
                                const idx = startIndex + i;
                                const t = new Date(time);
                                return (
                                    <tr key={time} className="hover:bg-zinc-100 dark:hover:bg-zinc-800/50 transition-colors">
                                        <td className="p-2 font-mono text-zinc-600 dark:text-zinc-300">{format(t, 'HH:mm')}</td>
                                        <td className="p-2">{getWeatherIcon(weather.hourly.weather_code[idx])}</td>
                                        <td className="p-2 text-right font-bold text-zinc-900 dark:text-white">{Math.round(weather.hourly.temperature_2m[idx])}°</td>
                                        <td className="p-2 text-right text-blue-500 dark:text-blue-400 font-medium">
                                            {weather.hourly.precipitation_probability[idx] > 0 ? `${weather.hourly.precipitation_probability[idx]}%` : '-'}
                                        </td>
                                        <td className="p-2 text-right text-zinc-500 dark:text-zinc-400 text-xs">
                                            {Math.round(weather.hourly.wind_speed_10m?.[idx] || 0)}
                                        </td>
                                    </tr>
                                );
                            })}
                         </tbody>
                     </table>
                </div>
            </div>
        </div>
    );
};
