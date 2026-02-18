import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { X, Save, Check, RefreshCw, Moon, Sun, Power, Calendar } from 'lucide-react';
import { CalendarSource, TaskListSource, UserConfig } from '../types';

interface SettingsModalProps {
    onClose: () => void;
    onSave: () => void; // Trigger a refresh
}

export const SettingsModal: React.FC<SettingsModalProps> = ({ onClose, onSave }) => {
    const [isLoading, setIsLoading] = useState(true);
    const [appVersion, setAppVersion] = useState<string>('');
    const [isCheckingUpdates, setIsCheckingUpdates] = useState(false);
    const [calendars, setCalendars] = useState<CalendarSource[]>([]);
    const [taskLists, setTaskLists] = useState<TaskListSource[]>([]);
    const [config, setConfig] = useState<UserConfig>({ calendarIds: [], taskListIds: [] });

    useEffect(() => {
        const loadData = async () => {
            try {
                setIsLoading(true);
                const [cals, lists, settings, appInfo] = await Promise.all([
                    window.ipcRenderer.invoke('data:calendars'),
                    window.ipcRenderer.invoke('data:tasklists'),
                    window.ipcRenderer.invoke('settings:get'),
                    window.ipcRenderer.invoke('app:info')
                ]);
                
                setCalendars(cals as CalendarSource[]);
                setAppVersion((appInfo as { version: string }).version);
                setTaskLists(lists as TaskListSource[]);
                setConfig(settings as UserConfig);
            } catch (e) {
                console.error("Failed to load settings data", e);
            } finally {
                setIsLoading(false);
            }
        };
        loadData();
    }, []);

    const handleSave = async () => {
        try {
            await window.ipcRenderer.invoke('settings:save', config);
            onSave();
            onClose();
        } catch (e) {
            console.error("Failed to save settings", e);
        }
    };

    const handleCheckUpdates = async () => {
        setIsCheckingUpdates(true);
        try {
            await window.ipcRenderer.invoke('update:check');
            // Give visual feedback for at least 2 seconds
            setTimeout(() => setIsCheckingUpdates(false), 2000);
        } catch (e) {
            console.error("Manual update check failed", e);
            setIsCheckingUpdates(false);
        }
    };

    const toggleId = (key: 'calendarIds' | 'taskListIds', id: string) => {
        setConfig(prev => {
            const currentIds = prev[key];
            const newIds = currentIds.includes(id)
                ? currentIds.filter(item => item !== id)
                : [...currentIds, id];
            return { ...prev, [key]: newIds };
        });
    };
    
    return (
        <motion.div 
            initial={{ opacity: 0 }} 
            animate={{ opacity: 1 }} 
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-8"
        >
            <motion.div 
                initial={{ scale: 0.95 }} 
                animate={{ scale: 1 }}
                className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl w-full max-w-4xl h-[85vh] flex flex-col shadow-2xl overflow-hidden transition-colors duration-300"
            >
                {/* Header */}
                <div className="p-6 border-b border-zinc-200 dark:border-zinc-800 flex justify-between items-center bg-white dark:bg-zinc-900 transition-colors duration-300">
                    <h2 className="text-2xl font-bold text-zinc-900 dark:text-white uppercase tracking-wide" data-testid="settings-modal-title">Configuration</h2>
                    <button onClick={onClose} className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-full text-zinc-500 dark:text-zinc-400 hover:text-black dark:hover:text-white transition-colors">
                        <X size={24} />
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-8 grid grid-cols-1 lg:grid-cols-2 gap-12 custom-scrollbar">
                    {/* Calendars Section */}
                    <div className="flex flex-col gap-4">
                        <h3 className="text-lg font-bold text-blue-500 dark:text-blue-400 uppercase tracking-widest border-b border-zinc-200 dark:border-zinc-800 pb-2">
                            Calendars ({calendars.length})
                        </h3>
                        <div className="space-y-2">
                            {calendars.map(cal => {
                                const isChecked = config.calendarIds.includes(cal.id);
                                return (
                                    <div 
                                        key={cal.id} 
                                        onClick={() => toggleId('calendarIds', cal.id)}
                                        className={`p-4 rounded-xl border flex items-center gap-4 cursor-pointer transition-all ${isChecked ? 'bg-blue-500/10 border-blue-500/50' : 'bg-zinc-50 dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-900'}`}
                                    >
                                        <div className={`w-5 h-5 rounded border flex items-center justify-center ${isChecked ? 'bg-blue-500 border-blue-500' : 'border-zinc-400 dark:border-zinc-600'}`}>
                                            {isChecked && <Check size={14} className="text-white" />}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="font-bold text-zinc-800 dark:text-zinc-200 truncate">{cal.summary}</div>
                                            {cal.primary && <div className="text-xs text-blue-500 dark:text-blue-400 font-mono mt-0.5">PRIMARY</div>}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {/* Task Lists Section */}
                    <div className="flex flex-col gap-4">
                         <h3 className="text-lg font-bold text-green-500 dark:text-green-400 uppercase tracking-widest border-b border-zinc-200 dark:border-zinc-800 pb-2">
                            Task Lists ({taskLists.length})
                        </h3>
                         <div className="space-y-2">
                            {taskLists.map(list => {
                                 const isChecked = config.taskListIds.includes(list.id);
                                 return (
                                    <div 
                                        key={list.id} 
                                        onClick={() => toggleId('taskListIds', list.id)}
                                        className={`p-4 rounded-xl border flex items-center gap-4 cursor-pointer transition-all ${isChecked ? 'bg-green-500/10 border-green-500/50' : 'bg-zinc-50 dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-900'}`}
                                    >
                                        <div className={`w-5 h-5 rounded border flex items-center justify-center ${isChecked ? 'bg-green-500 border-green-500' : 'border-zinc-400 dark:border-zinc-600'}`}>
                                            {isChecked && <Check size={14} className="text-white" />}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="font-bold text-zinc-800 dark:text-zinc-200 truncate">{list.title}</div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    
                    {/* Calendar View Settings */}
                    <div className="lg:col-span-2 border-t border-zinc-200 dark:border-zinc-800 pt-8 mt-4">
                        <h3 className="text-lg font-bold text-family-cyan uppercase tracking-widest mb-4 flex items-center gap-2">
                           <Calendar size={20} /> Calendar View
                        </h3>
                        <div className="bg-zinc-50 dark:bg-zinc-950 p-6 rounded-xl border border-zinc-200 dark:border-zinc-800 space-y-4">
                            <h4 className="text-sm font-bold text-zinc-500 uppercase tracking-wider">Week Starts On</h4>
                            <div className="flex gap-2">
                                {(['today', 'sunday', 'monday'] as const).map((mode) => (
                                    <button
                                        key={mode}
                                        onClick={() => setConfig(prev => ({ ...prev, weekStartDay: mode }))}
                                        className={`flex-1 py-2 px-4 rounded-lg font-bold text-sm transition-all uppercase tracking-wider ${config.weekStartDay === mode || (mode === 'today' && !config.weekStartDay) ? 'bg-family-cyan text-white shadow-lg shadow-family-cyan/20' : 'bg-zinc-200 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 hover:bg-zinc-300 dark:hover:bg-zinc-700'}`}
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
                    <div className="lg:col-span-2 border-t border-zinc-200 dark:border-zinc-800 pt-8 mt-4">
                        <h3 className="text-lg font-bold text-orange-500 dark:text-orange-400 uppercase tracking-widest mb-4">
                            Active Hours
                        </h3>
                        <div className="flex flex-col sm:flex-row items-center gap-8 bg-zinc-50 dark:bg-zinc-950 p-6 rounded-xl border border-zinc-200 dark:border-zinc-800">
                             <div className="flex flex-col gap-2">
                                <label className="text-sm font-bold text-zinc-500 uppercase tracking-wider">Start Time (24h)</label>
                                <input 
                                    type="number" 
                                    min={0} 
                                    max={23}
                                    value={config.activeHoursStart ?? 7}
                                    onChange={(e) => setConfig(prev => ({ ...prev, activeHoursStart: parseInt(e.target.value) }))}
                                    className="bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 rounded-lg px-4 py-2 text-zinc-900 dark:text-white font-mono text-xl w-32 focus:outline-none focus:border-orange-500 transition-colors"
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
                                    className="bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 rounded-lg px-4 py-2 text-zinc-900 dark:text-white font-mono text-xl w-32 focus:outline-none focus:border-orange-500 transition-colors"
                                />
                             </div>
                             <div className="sm:ml-auto text-sm text-zinc-500 max-w-sm">
                                Define the "Active Hours" for your day. Events outside this range will be grouped into "Before" and "After" buckets.
                             </div>
                        </div>
                    </div>

                    {/* Display & Power Section */}
                    <div className="lg:col-span-2 border-t border-zinc-200 dark:border-zinc-800 pt-8 mt-4">
                        <h3 className="text-lg font-bold text-purple-500 dark:text-purple-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                           <Moon size={20} /> Display & Power
                        </h3>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            {/* Theme Settings */}
                            <div className="bg-zinc-50 dark:bg-zinc-950 p-6 rounded-xl border border-zinc-200 dark:border-zinc-800 space-y-4">
                                <h4 className="text-sm font-bold text-zinc-500 uppercase tracking-wider">Theme Mode</h4>
                                <div className="flex gap-2">
                                    <button
                                        onClick={() => setConfig(prev => ({ ...prev, themeMode: 'auto' }))}
                                        className={`flex-1 py-2 px-4 rounded-lg font-bold text-sm transition-all flex items-center justify-center gap-2 ${config.themeMode !== 'manual' ? 'bg-purple-500 text-white shadow-lg shadow-purple-500/20' : 'bg-zinc-200 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 hover:bg-zinc-300 dark:hover:bg-zinc-700'}`}
                                        data-testid="theme-auto-button"
                                    >
                                        <Sun size={16} /> AUTO (Sun)
                                    </button>
                                    <button
                                        onClick={() => setConfig(prev => ({ ...prev, themeMode: 'manual' }))}
                                        className={`flex-1 py-2 px-4 rounded-lg font-bold text-sm transition-all flex items-center justify-center gap-2 ${config.themeMode === 'manual' ? 'bg-purple-500 text-white shadow-lg shadow-purple-500/20' : 'bg-zinc-200 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 hover:bg-zinc-300 dark:hover:bg-zinc-700'}`}
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
                                                className="bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 rounded px-3 py-1.5 w-20 text-center font-mono text-zinc-900 dark:text-white"
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
                                                className="bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 rounded px-3 py-1.5 w-20 text-center font-mono text-zinc-900 dark:text-white"
                                                data-testid="manual-day-end-input"
                                            />
                                        </div>
                                    </div>
                                )}
                                <p className="text-xs text-zinc-500 mt-2">
                                    {config.themeMode === 'manual'
                                        ? "Manually switch between Light and Dark mode based on these hours."
                                        : "Automatically switch based on local sunrise and sunset times (Weather data required)."}
                                </p>
                            </div>

                            {/* Power Settings */}
                            <div className="bg-zinc-50 dark:bg-zinc-950 p-6 rounded-xl border border-zinc-200 dark:border-zinc-800 space-y-4" data-testid="sleep-schedule-section">
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
                                                className="bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 rounded px-3 py-1.5 w-20 text-center font-mono text-zinc-900 dark:text-white"
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
                                                className="bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 rounded px-3 py-1.5 w-20 text-center font-mono text-zinc-900 dark:text-white"
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
                    <div className="lg:col-span-2 border-t border-zinc-200 dark:border-zinc-800 pt-8 mt-4 mb-8">
                        <h3 className="text-lg font-bold text-zinc-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                           <RefreshCw size={20} /> About
                        </h3>
                        <div className="bg-zinc-50 dark:bg-zinc-950 p-6 rounded-xl border border-zinc-200 dark:border-zinc-800 flex flex-col sm:flex-row items-center justify-between gap-6">
                            <div className="flex flex-col gap-1">
                                <div className="text-sm font-bold text-zinc-500 uppercase tracking-wider">Application Version</div>
                                <div className="text-2xl font-black text-zinc-800 dark:text-zinc-200 font-mono">v{appVersion}</div>
                            </div>

                            <button
                                onClick={handleCheckUpdates}
                                disabled={isCheckingUpdates}
                                className={`px-6 py-3 rounded-xl font-bold flex items-center gap-2 transition-all ${isCheckingUpdates ? 'bg-zinc-200 dark:bg-zinc-800 text-zinc-400 cursor-not-allowed' : 'bg-zinc-200 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-300 dark:hover:bg-zinc-700'}`}
                            >
                                <RefreshCw size={18} className={isCheckingUpdates ? 'animate-spin' : ''} />
                                {isCheckingUpdates ? 'Checking for updates...' : 'Check for Updates'}
                            </button>
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="p-6 border-t border-zinc-200 dark:border-zinc-800 bg-white/95 dark:bg-zinc-900/50 flex justify-end gap-4 transition-colors duration-300">
                    <button onClick={onClose} className="px-6 py-3 rounded-xl font-bold text-zinc-500 dark:text-zinc-400 hover:text-black dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors">
                        Cancel
                    </button>
                    <button 
                        onClick={handleSave} 
                        className="px-8 py-3 rounded-xl font-bold bg-zinc-900 dark:bg-white text-white dark:text-black hover:bg-zinc-700 dark:hover:bg-zinc-200 transition-colors flex items-center gap-2"
                        data-testid="save-settings-button"
                    >
                        <Save size={18} />
                        Save Changes
                    </button>
                </div>

                {isLoading && (
                    <div className="absolute inset-0 bg-white/80 dark:bg-black/60 backdrop-blur-sm flex items-center justify-center flex-col gap-4">
                        <RefreshCw size={48} className="animate-spin text-zinc-500" />
                    </div>
                )}
            </motion.div>
        </motion.div>
    );
};
