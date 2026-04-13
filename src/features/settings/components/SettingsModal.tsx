import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { X, Save, Check, RefreshCw, Calendar, User, Settings, CheckSquare, Rocket } from 'lucide-react';
import { CalendarSource, TaskListSource, UserConfig } from '../../../types';
import { AccountSettingsTab } from './AccountSettingsTab';
import { GeneralSettingsTab } from './GeneralSettingsTab';
import { TasksSettingsTab } from './TasksSettingsTab';

interface SettingsModalProps {
    onClose: () => void;
    onSave: () => void; // Trigger a refresh
    onLogout?: () => void; // Trigger a logout and re-login
}

export const SettingsModal: React.FC<SettingsModalProps> = ({ onClose, onSave, onLogout }) => {
    const [isLoading, setIsLoading] = useState(true);
    const [appVersion, setAppVersion] = useState<string>('');
    const [isCheckingUpdates, setIsCheckingUpdates] = useState(false);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [calendars, setCalendars] = useState<CalendarSource[]>([]);
    const [taskLists, setTaskLists] = useState<TaskListSource[]>([]);
    const [config, setConfig] = useState<UserConfig>({ calendarIds: [], taskListIds: [] });

    const [activeSection, setActiveSection] = useState<'account' | 'general' | 'calendars' | 'tasks' | 'mission-control'>('account');

    const loadData = async () => {
        try {
            setIsLoading(true);
            setLoadError(null);
            const [cals, lists, settings, appInfo] = await Promise.all([
                window.ipcRenderer.invoke('data:calendars'),
                window.ipcRenderer.invoke('data:tasklists'),
                window.ipcRenderer.invoke('settings:get'),
                window.ipcRenderer.invoke('app:info')
            ]);

            setCalendars(cals as CalendarSource[]);
            setTaskLists(lists as TaskListSource[]);
            setConfig(settings as UserConfig);
            setAppVersion((appInfo as { version: string }).version);
        } catch (e) {
            console.error("Failed to load settings data", e);
            setLoadError(e instanceof Error ? e.message : 'Failed to load settings data. Check your connection and try again.');
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {

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
                className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl w-full max-w-6xl h-[90vh] flex flex-col shadow-2xl overflow-hidden transition-colors duration-300"
            >
                {/* Header */}
                <div className="p-6 border-b border-zinc-200 dark:border-zinc-800 flex justify-between items-center bg-white dark:bg-zinc-900 transition-colors duration-300">
                    <h2 className="text-2xl font-bold text-zinc-900 dark:text-white uppercase tracking-wide" data-testid="settings-modal-title">Configuration</h2>
                    <button onClick={onClose} className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-full text-zinc-500 dark:text-zinc-400 hover:text-black dark:hover:text-white transition-colors">
                        <X size={24} />
                    </button>
                </div>

                {/* Main Content Area with Sidebar */}
                <div className="flex-1 flex overflow-hidden bg-zinc-50/50 dark:bg-zinc-950/50">
                    {/* Sidebar */}
                    <div className="w-64 flex flex-col border-r border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 gap-2 overflow-y-auto">
                        <button
                            onClick={() => setActiveSection('account')}
                            className={`flex items-center gap-3 px-4 py-3 rounded-xl font-bold text-sm transition-all text-left ${activeSection === 'account' ? 'bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-white' : 'text-zinc-500 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800/50'}`}
                        >
                            <User size={18} className={activeSection === 'account' ? 'text-blue-500' : ''} />
                            Google Account
                        </button>
                        <button
                            onClick={() => setActiveSection('general')}
                            className={`flex items-center gap-3 px-4 py-3 rounded-xl font-bold text-sm transition-all text-left ${activeSection === 'general' ? 'bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-white' : 'text-zinc-500 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800/50'}`}
                        >
                            <Settings size={18} className={activeSection === 'general' ? 'text-purple-500' : ''} />
                            General
                        </button>
                        <button
                            onClick={() => setActiveSection('calendars')}
                            className={`flex items-center gap-3 px-4 py-3 rounded-xl font-bold text-sm transition-all text-left ${activeSection === 'calendars' ? 'bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-white' : 'text-zinc-500 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800/50'}`}
                        >
                            <Calendar size={18} className={activeSection === 'calendars' ? 'text-family-cyan' : ''} />
                            Calendars ({calendars.length})
                        </button>
                         <button
                            onClick={() => setActiveSection('tasks')}
                            className={`flex items-center gap-3 px-4 py-3 rounded-xl font-bold text-sm transition-all text-left ${activeSection === 'tasks' ? 'bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-white' : 'text-zinc-500 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800/50'}`}
                        >
                            <CheckSquare size={18} className={activeSection === 'tasks' ? 'text-green-500' : ''} />
                            Task Lists ({taskLists.length})
                        </button>

                        {/* Divider before Mission Control */}
                        <div className="my-2 border-t border-zinc-100 dark:border-zinc-800" />

                        <button
                            onClick={() => setActiveSection('mission-control')}
                            className={`flex items-center gap-3 px-4 py-3 rounded-xl font-bold text-sm transition-all text-left ${activeSection === 'mission-control' ? 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300' : 'text-zinc-500 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800/50'}`}
                        >
                            <Rocket size={18} className={activeSection === 'mission-control' ? 'text-amber-500' : ''} />
                            Mission Control
                        </button>
                    </div>

                    {/* Content Panel */}
                    <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
                         {/* Error Banner */}
                         {loadError && (
                            <div className="mb-6 bg-red-500/10 border border-red-500/50 rounded-xl p-4 flex items-center justify-between" data-testid="settings-load-error">
                                <span className="text-red-400 text-sm font-medium">{loadError}</span>
                                <button
                                    onClick={() => { setLoadError(null); loadData(); }}
                                    className="px-4 py-1.5 rounded-lg bg-red-500/20 text-red-400 hover:bg-red-500/30 text-sm font-bold transition-colors flex items-center gap-2"
                                >
                                    <RefreshCw size={14} /> Retry
                                </button>
                            </div>
                        )}

                        {activeSection === 'account' && (
                            <AccountSettingsTab onLogout={onLogout} loadData={loadData} />
                        )}

                        {activeSection === 'general' && (
                            <GeneralSettingsTab config={config} setConfig={setConfig} appVersion={appVersion} isCheckingUpdates={isCheckingUpdates} handleCheckUpdates={handleCheckUpdates} />
                        )}

                        {activeSection === 'calendars' && (
                            <div className="flex flex-col gap-4 animate-in fade-in slide-in-from-right-4 duration-300">
                                <h3 className="text-xl font-bold text-zinc-900 dark:text-white mb-2">
                                    Calendars
                                </h3>
                                <div className="space-y-2">
                                    {calendars.map(cal => {
                                        const isChecked = config.calendarIds.includes(cal.id);
                                        return (
                                            <div
                                                key={cal.id}
                                                onClick={() => toggleId('calendarIds', cal.id)}
                                                className={`p-4 rounded-xl border flex items-center gap-4 cursor-pointer transition-all bg-white dark:bg-zinc-900 ${isChecked ? 'border-blue-500 shadow-lg shadow-blue-500/10' : 'border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800'}`}
                                            >
                                                <div className={`w-5 h-5 rounded border flex items-center justify-center transition-colors ${isChecked ? 'bg-blue-500 border-blue-500' : 'border-zinc-400 dark:border-zinc-600'}`}>
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
                        )}

                        {activeSection === 'tasks' && (
                            <TasksSettingsTab config={config} taskLists={taskLists} toggleId={toggleId} />
                        )}

                        {activeSection === 'mission-control' && (
                            <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                                <div>
                                    <h3 className="text-xl font-bold text-zinc-900 dark:text-white mb-1 flex items-center gap-2">
                                        <Rocket size={20} className="text-amber-500" /> Mission Control
                                    </h3>
                                    <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-6">
                                        The Big Kid Command Center — token economy, goal pedestals, missions &amp; privileges.
                                    </p>
                                </div>

                                <div className="bg-gradient-to-br from-amber-50 to-yellow-50 dark:from-amber-900/20 dark:to-yellow-900/10 border border-amber-200 dark:border-amber-800/40 rounded-2xl p-6 flex items-center justify-between gap-6">
                                    <div>
                                        <div className="text-2xl mb-2">⭐🏆🎮</div>
                                        <h4 className="font-bold text-zinc-800 dark:text-zinc-200 mb-1">Open Mission Control</h4>
                                        <p className="text-sm text-zinc-500 dark:text-zinc-400 max-w-sm">
                                            Switch to the full-screen kid dashboard. The calendar app will reload when you return.
                                        </p>
                                    </div>
                                    <motion.button
                                        data-testid="open-mission-control-btn"
                                        whileTap={{ scale: 0.95 }}
                                        whileHover={{ scale: 1.03 }}
                                        onClick={() => { window.location.href = window.location.href.split('?')[0] + '?mc=1'; }}
                                        className="px-8 py-4 rounded-2xl font-black text-base bg-gradient-to-b from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 text-amber-900 shadow-lg shadow-amber-400/30 transition-all flex items-center gap-3 whitespace-nowrap border border-amber-300"
                                    >
                                        <Rocket size={20} />
                                        Launch!
                                    </motion.button>
                                </div>

                                <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-4 space-y-1">
                                    <p className="text-xs text-zinc-400 font-mono">
                                        💡 Direct URL: add <span className="text-amber-600 dark:text-amber-400 font-bold select-all">?mc=1</span> to the address bar.
                                    </p>
                                    <p className="text-xs text-zinc-400 font-mono">
                                        🧪 Inside Mission Control, use the <span className="font-bold text-yellow-600 dark:text-yellow-400">☀️ AM</span> and <span className="font-bold text-purple-500">🌙 PM</span> buttons in the top bar to manually trigger a routine for testing.
                                    </p>
                                </div>
                            </div>
                        )}
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
