import React from 'react';
import { RefreshCw, Moon, Sun, Power, Calendar } from 'lucide-react';
import { UserConfig } from '../../../types';

interface GeneralSettingsTabProps {
    config: UserConfig;
    setConfig: React.Dispatch<React.SetStateAction<UserConfig>>;
    appVersion: string;
    isCheckingUpdates: boolean;
    handleCheckUpdates: () => Promise<void>;
}

export const GeneralSettingsTab: React.FC<GeneralSettingsTabProps> = ({ config, setConfig, appVersion, isCheckingUpdates, handleCheckUpdates }) => {
    return (
        <div className="space-y-8 animate-in fade-in slide-in-from-right-4 duration-300">
                                {/* Calendar View Settings */}
                                <div>
                                    <h3 className="text-lg font-bold text-zinc-900 dark:text-white mb-4 flex items-center gap-2">
                                        <Calendar size={20} className="text-family-cyan" /> Calendar View
                                    </h3>
                                    <div className="bg-white dark:bg-zinc-900 p-6 rounded-xl border border-zinc-200 dark:border-zinc-800 space-y-4">
                                        <h4 className="text-sm font-bold text-zinc-500 uppercase tracking-wider">Week Starts On</h4>
                                        <div className="flex gap-2">
                                            {(['today', 'sunday', 'monday'] as const).map((mode) => (
                                                <button
                                                    key={mode}
                                                    onClick={() => setConfig(prev => ({ ...prev, weekStartDay: mode }))}
                                                    className={`flex-1 py-2 px-4 rounded-lg font-bold text-sm transition-all uppercase tracking-wider ${config.weekStartDay === mode || (mode === 'today' && !config.weekStartDay) ? 'bg-family-cyan text-white shadow-lg shadow-family-cyan/20' : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700'}`}
                                                    data-testid={`week-start-${mode}-button`}
                                                >
                                                    {mode}
                                                </button>
                                            ))}
                                        </div>
                                        <p className="text-xs text-zinc-500">
                                            {config.weekStartDay === 'sunday' ? "Calendar will start from Sunday of the current week." :
                                             config.weekStartDay === 'monday' ? "Calendar will start from Monday of the current week." :
                                             "Calendar will start from today and show the next 7 days."}
                                        </p>
                                    </div>
                                </div>

                                {/* Active Hours Section */}
                                <div className="border-t border-zinc-200 dark:border-zinc-800 pt-8">
                                    <h3 className="text-lg font-bold text-zinc-900 dark:text-white mb-4 flex items-center gap-2">
                                         <span className="text-orange-500"><Sun size={20} /></span> Active Hours
                                    </h3>
                                    <div className="flex flex-col sm:flex-row items-center gap-8 bg-white dark:bg-zinc-900 p-6 rounded-xl border border-zinc-200 dark:border-zinc-800">
                                         <div className="flex flex-col gap-2">
                                            <label className="text-sm font-bold text-zinc-500 uppercase tracking-wider">Start Time (24h)</label>
                                            <input
                                                type="number"
                                                min={0}
                                                max={23}
                                                value={config.activeHoursStart ?? 7}
                                                onChange={(e) => setConfig(prev => ({ ...prev, activeHoursStart: parseInt(e.target.value) }))}
                                                className="bg-zinc-50 dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-700 rounded-lg px-4 py-2 text-zinc-900 dark:text-white font-mono text-xl w-32 focus:outline-none focus:border-orange-500 transition-colors hover:bg-zinc-100 dark:hover:bg-zinc-900"
                                            />
                                         </div>
                                         <div className="h-px w-full sm:w-8 bg-zinc-300 dark:bg-zinc-700" />
                                         <div className="flex flex-col gap-2">
                                            <label className="text-sm font-bold text-zinc-500 uppercase tracking-wider">End Time (24h)</label>
                                            <input
                                                type="number"
                                                min={0}
                                                max={23}
                                                value={config.activeHoursEnd ?? 21}
                                                onChange={(e) => setConfig(prev => ({ ...prev, activeHoursEnd: parseInt(e.target.value) }))}
                                                className="bg-zinc-50 dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-700 rounded-lg px-4 py-2 text-zinc-900 dark:text-white font-mono text-xl w-32 focus:outline-none focus:border-orange-500 transition-colors hover:bg-zinc-100 dark:hover:bg-zinc-900"
                                            />
                                         </div>
                                         <div className="sm:ml-auto text-sm text-zinc-500 max-w-sm">
                                            Define the "Active Hours" for your day. Events outside this range will be grouped into "Before" and "After" buckets.
                                         </div>
                                    </div>
                                </div>

                                {/* Display & Power Section */}
                                <div className="border-t border-zinc-200 dark:border-zinc-800 pt-8">
                                    <h3 className="text-lg font-bold text-zinc-900 dark:text-white mb-4 flex items-center gap-2">
                                       <Moon size={20} className="text-purple-500" /> Display & Power
                                    </h3>

                                    <div className="grid grid-cols-1 gap-6">
                                        {/* Theme Settings */}
                                        <div className="bg-white dark:bg-zinc-900 p-6 rounded-xl border border-zinc-200 dark:border-zinc-800 space-y-4">
                                            <h4 className="text-sm font-bold text-zinc-500 uppercase tracking-wider">Theme Mode</h4>
                                            <div className="flex gap-2">
                                                <button
                                                    onClick={() => setConfig(prev => ({ ...prev, themeMode: 'auto' }))}
                                                    className={`flex-1 py-2 px-4 rounded-lg font-bold text-sm transition-all flex items-center justify-center gap-2 ${config.themeMode !== 'manual' ? 'bg-purple-500 text-white shadow-lg shadow-purple-500/20' : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700'}`}
                                                    data-testid="theme-auto-button"
                                                >
                                                    <Sun size={16} /> AUTO (Sun)
                                                </button>
                                                <button
                                                    onClick={() => setConfig(prev => ({ ...prev, themeMode: 'manual' }))}
                                                    className={`flex-1 py-2 px-4 rounded-lg font-bold text-sm transition-all flex items-center justify-center gap-2 ${config.themeMode === 'manual' ? 'bg-purple-500 text-white shadow-lg shadow-purple-500/20' : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700'}`}
                                                    data-testid="theme-manual-button"
                                                >
                                                    <RefreshCw size={16} /> MANUAL
                                                </button>
                                            </div>

                                            {config.themeMode === 'manual' && (
                                                <div className="flex items-center gap-4 mt-4 animate-pulse-once">
                                                    <div className="flex flex-col gap-1">
                                                        <label className="text-xs font-bold text-zinc-400 uppercase">Day Start</label>
                                                        <input
                                                            type="number" min={0} max={23}
                                                            value={config.manualDayStart ?? 7}
                                                            onChange={(e) => setConfig(prev => ({ ...prev, manualDayStart: parseInt(e.target.value) }))}
                                                            className="bg-zinc-50 dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-700 rounded px-3 py-1.5 w-20 text-center font-mono text-zinc-900 dark:text-white"
                                                            data-testid="manual-day-start-input"
                                                        />
                                                    </div>
                                                    <div className="h-px flex-1 bg-zinc-300 dark:bg-zinc-700 mx-2" />
                                                    <div className="flex flex-col gap-1">
                                                        <label className="text-xs font-bold text-zinc-400 uppercase">Day End</label>
                                                        <input
                                                            type="number" min={0} max={23}
                                                            value={config.manualDayEnd ?? 19}
                                                            onChange={(e) => setConfig(prev => ({ ...prev, manualDayEnd: parseInt(e.target.value) }))}
                                                            className="bg-zinc-50 dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-700 rounded px-3 py-1.5 w-20 text-center font-mono text-zinc-900 dark:text-white"
                                                            data-testid="manual-day-end-input"
                                                        />
                                                    </div>
                                                </div>
                                            )}
                                        </div>

                                        {/* Power Settings */}
                                        <div className="bg-white dark:bg-zinc-900 p-6 rounded-xl border border-zinc-200 dark:border-zinc-800 space-y-4" data-testid="sleep-schedule-section">
                                            <div className="flex justify-between items-center">
                                                <h4 className="text-sm font-bold text-zinc-500 uppercase tracking-wider flex items-center gap-2"><Power size={16} /> Sleep Schedule</h4>
                                                <button
                                                    onClick={() => setConfig(prev => ({ ...prev, sleepEnabled: !prev.sleepEnabled }))}
                                                    className={`w-12 h-6 rounded-full transition-colors relative ${config.sleepEnabled !== false ? 'bg-green-500' : 'bg-zinc-300 dark:bg-zinc-700'}`}
                                                >
                                                    <div className={`absolute top-1 bottom-1 left-1 w-4 h-4 rounded-full bg-white transition-transform ${config.sleepEnabled !== false ? 'translate-x-6' : 'translate-x-0'}`} />
                                                </button>
                                            </div>

                                            <div className={`space-y-4 transition-opacity ${config.sleepEnabled !== false ? 'opacity-100' : 'opacity-50 pointer-events-none'}`}>
                                                <div className="flex items-center gap-4">
                                                     <div className="flex flex-col gap-1">
                                                        <label className="text-xs font-bold text-zinc-400 uppercase">Sleep Start</label>
                                                        <input
                                                            type="number" min={0} max={23}
                                                            value={config.sleepStart ?? 22}
                                                            onChange={(e) => setConfig(prev => ({ ...prev, sleepStart: parseInt(e.target.value) }))}
                                                            className="bg-zinc-50 dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-700 rounded px-3 py-1.5 w-20 text-center font-mono text-zinc-900 dark:text-white"
                                                            data-testid="sleep-start-input"
                                                        />
                                                    </div>
                                                    <div className="h-px flex-1 bg-zinc-300 dark:bg-zinc-700 mx-2" />
                                                    <div className="flex flex-col gap-1">
                                                        <label className="text-xs font-bold text-zinc-400 uppercase">Sleep End</label>
                                                        <input
                                                            type="number" min={0} max={23}
                                                            value={config.sleepEnd ?? 6}
                                                            onChange={(e) => setConfig(prev => ({ ...prev, sleepEnd: parseInt(e.target.value) }))}
                                                            className="bg-zinc-50 dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-700 rounded px-3 py-1.5 w-20 text-center font-mono text-zinc-900 dark:text-white"
                                                            data-testid="sleep-end-input"
                                                        />
                                                    </div>
                                                </div>
                                                <p className="text-xs text-zinc-500">
                                                    During these hours, the screen will turn off after 5 minutes of inactivity. Mouse movement wakes the screen.
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* About Section */}
                                <div className="border-t border-zinc-200 dark:border-zinc-800 pt-8">
                                    <h3 className="text-lg font-bold text-zinc-900 dark:text-white mb-4 flex items-center gap-2">
                                       <RefreshCw size={20} className="text-zinc-400" /> About
                                    </h3>
                                    <div className="bg-white dark:bg-zinc-900 p-6 rounded-xl border border-zinc-200 dark:border-zinc-800 flex flex-col sm:flex-row items-center justify-between gap-6">
                                        <div className="flex flex-col gap-1">
                                            <div className="text-sm font-bold text-zinc-500 uppercase tracking-wider">Application Version</div>
                                            <div className="text-2xl font-black text-zinc-800 dark:text-zinc-200 font-mono">v{appVersion}</div>
                                        </div>

                                        <button
                                            onClick={handleCheckUpdates}
                                            disabled={isCheckingUpdates}
                                            className={`px-6 py-3 rounded-xl font-bold flex items-center gap-2 transition-all ${isCheckingUpdates ? 'bg-zinc-100 dark:bg-zinc-800 text-zinc-400 cursor-not-allowed' : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700'}`}
                                        >
                                            <RefreshCw size={18} className={isCheckingUpdates ? 'animate-spin' : ''} />
                                            {isCheckingUpdates ? 'Checking for updates...' : 'Check for Updates'}
                                        </button>
                                    </div>
                                </div>
                            </div>
    );
};
