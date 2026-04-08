import React, { useState } from 'react';
import { SideDrawer } from '../../../components/SideDrawer';
import { WeatherData, AppTask } from '../../../types';
import {
    Anchor,
    Sun,
    ListTodo
} from 'lucide-react';
import { getWeatherIcon } from '../../../utils/weatherIcons';

import { WeatherPanel } from './WeatherPanel';
import { TasksPanel } from './TasksPanel';

interface WeatherDashboardProps {
    weather: WeatherData;
    tasks: AppTask[];
    onSwitchToMarine?: () => void;
}

export const WeatherDashboard: React.FC<WeatherDashboardProps> = ({
    weather,
    tasks,
    onSwitchToMarine,
}) => {
    const [isWeatherOpen, setWeatherOpen] = useState(false);
    const [isTasksOpen, setTasksOpen] = useState(false);

    return (
        <>
            <div className="flex gap-2">
                <button
                    onClick={() => setWeatherOpen(true)}
                    className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white dark:bg-zinc-900/80 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-all border border-zinc-200 dark:border-zinc-700/50 shadow-lg group"
                    data-testid="weather-button"
                >
                    {getWeatherIcon(weather.current.weatherCode)}
                    <span className="text-sm font-black text-zinc-900 dark:text-zinc-100 group-hover:text-black dark:group-hover:text-white">
                        {Math.round(weather.current.temperature)}°C
                    </span>
                </button>

                <button
                    onClick={() => onSwitchToMarine?.()}
                    className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white dark:bg-zinc-900/80 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-all border border-zinc-200 dark:border-zinc-700/50 shadow-lg group"
                    data-testid="tides-button"
                >
                    <Anchor className="text-blue-500 dark:text-blue-400" size={16} />
                    <span className="text-sm font-black text-zinc-900 dark:text-zinc-100 group-hover:text-black dark:group-hover:text-white">
                        Marine
                    </span>
                </button>

                 <button
                    onClick={() => setTasksOpen(true)}
                    className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white dark:bg-zinc-900/80 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-all border border-zinc-200 dark:border-zinc-700/50 shadow-lg group"
                    data-testid="tasks-button"
                >
                    <ListTodo className="text-purple-500 dark:text-purple-400" size={16} />
                    <span className="text-sm font-black text-zinc-900 dark:text-zinc-100 group-hover:text-black dark:group-hover:text-white">
                        Tasks
                    </span>
                    {tasks.length > 0 && (
                        <span className="bg-purple-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                            {tasks.length}
                        </span>
                    )}
                </button>
            </div>

            <SideDrawer
                isOpen={isWeatherOpen}
                onClose={() => setWeatherOpen(false)}
                title={<span className="flex items-center gap-2"><Sun className="text-yellow-500" /> Weather Forecast</span>}
            >
                <WeatherPanel weather={weather} />
            </SideDrawer>

            <SideDrawer
                isOpen={isTasksOpen}
                onClose={() => setTasksOpen(false)}
                title={<span className="flex items-center gap-2"><ListTodo className="text-purple-500" /> Tasks</span>}
            >
                <TasksPanel tasks={tasks} />
            </SideDrawer>
        </>
    );
};
