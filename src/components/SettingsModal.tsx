import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { X, Save, Check, RefreshCw } from 'lucide-react';
import { CalendarSource, TaskListSource, UserConfig } from '../types';

interface SettingsModalProps {
    onClose: () => void;
    onSave: () => void; // Trigger a refresh
}

export const SettingsModal: React.FC<SettingsModalProps> = ({ onClose, onSave }) => {
    const [isLoading, setIsLoading] = useState(true);
    const [calendars, setCalendars] = useState<CalendarSource[]>([]);
    const [taskLists, setTaskLists] = useState<TaskListSource[]>([]);
    const [config, setConfig] = useState<UserConfig>({ calendarIds: [], taskListIds: [] });

    useEffect(() => {
        const loadData = async () => {
            try {
                setIsLoading(true);
                const [cals, lists, settings] = await Promise.all([
                    window.ipcRenderer.invoke('data:calendars'),
                    window.ipcRenderer.invoke('data:tasklists'),
                    window.ipcRenderer.invoke('settings:get')
                ]);
                
                setCalendars(cals as CalendarSource[]);
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

    const toggleCalendar = (id: string) => {
        setConfig(prev => {
            const exists = prev.calendarIds.includes(id);
            const newIds = exists 
                ? prev.calendarIds.filter(c => c !== id)
                : [...prev.calendarIds, id];
            return { ...prev, calendarIds: newIds };
        });
    };

    const toggleTaskList = (id: string) => {
        setConfig(prev => {
            const exists = prev.taskListIds.includes(id);
            const newIds = exists 
                ? prev.taskListIds.filter(t => t !== id)
                : [...prev.taskListIds, id];
            return { ...prev, taskListIds: newIds };
        });
    };

    // Helper to check if checked.
    // If config.calendarIds is empty, we logicially select 'primary'.
    // BUT we want to show the specific primary calendar as checked if it matches.
    // To simplify: if empty, NOTHING is visually checked, unless we auto-check primary in UI state.
    // Let's implement robust UI: if empty, show as "Default (Primary)".
    // A better UX: Initial load, if config is empty, pre-fill with primary.
    // Actually, backend defaults to primary if empty for *fetching*.
    // For *editing*, we should show what is saved. If empty, show empty.
    
    return (
        <motion.div 
            initial={{ opacity: 0 }} 
            animate={{ opacity: 1 }} 
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-8"
        >
            <motion.div 
                initial={{ scale: 0.95 }} 
                animate={{ scale: 1 }}
                className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-4xl h-[80vh] flex flex-col shadow-2xl overflow-hidden"
            >
                {/* Header */}
                <div className="p-6 border-b border-zinc-800 flex justify-between items-center bg-zinc-900">
                    <h2 className="text-2xl font-bold text-white uppercase tracking-wide">Configuration</h2>
                    <button onClick={onClose} className="p-2 hover:bg-zinc-800 rounded-full text-zinc-400 hover:text-white transition-colors">
                        <X size={24} />
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-8 grid grid-cols-2 gap-12">
                    {/* Calendars Section */}
                    <div className="flex flex-col gap-4">
                        <h3 className="text-lg font-bold text-blue-400 uppercase tracking-widest border-b border-zinc-800 pb-2">
                            Calendars ({calendars.length})
                        </h3>
                        <div className="space-y-2">
                            {calendars.map(cal => {
                                const isChecked = config.calendarIds.includes(cal.id);
                                return (
                                    <div 
                                        key={cal.id} 
                                        onClick={() => toggleCalendar(cal.id)}
                                        className={`p-4 rounded-xl border flex items-center gap-4 cursor-pointer transition-all ${isChecked ? 'bg-blue-500/10 border-blue-500/50' : 'bg-zinc-950 border-zinc-800 hover:bg-zinc-900'}`}
                                    >
                                        <div className={`w-5 h-5 rounded border flex items-center justify-center ${isChecked ? 'bg-blue-500 border-blue-500' : 'border-zinc-600'}`}>
                                            {isChecked && <Check size={14} className="text-white" />}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="font-bold text-zinc-200 truncate">{cal.summary}</div>
                                            {cal.primary && <div className="text-xs text-blue-400 font-mono mt-0.5">PRIMARY</div>}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {/* Task Lists Section */}
                    <div className="flex flex-col gap-4">
                         <h3 className="text-lg font-bold text-green-400 uppercase tracking-widest border-b border-zinc-800 pb-2">
                            Task Lists ({taskLists.length})
                        </h3>
                         <div className="space-y-2">
                            {taskLists.map(list => {
                                 const isChecked = config.taskListIds.includes(list.id);
                                 return (
                                    <div 
                                        key={list.id} 
                                        onClick={() => toggleTaskList(list.id)}
                                        className={`p-4 rounded-xl border flex items-center gap-4 cursor-pointer transition-all ${isChecked ? 'bg-green-500/10 border-green-500/50' : 'bg-zinc-950 border-zinc-800 hover:bg-zinc-900'}`}
                                    >
                                        <div className={`w-5 h-5 rounded border flex items-center justify-center ${isChecked ? 'bg-green-500 border-green-500' : 'border-zinc-600'}`}>
                                            {isChecked && <Check size={14} className="text-white" />}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="font-bold text-zinc-200 truncate">{list.title}</div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    
                    {/* Active Hours Section */}
                    <div className="col-span-2 border-t border-zinc-800 pt-8 mt-4">
                        <h3 className="text-lg font-bold text-orange-400 uppercase tracking-widest mb-4">
                            Active Hours
                        </h3>
                        <div className="flex items-center gap-8 bg-zinc-950 p-6 rounded-xl border border-zinc-800">
                             <div className="flex flex-col gap-2">
                                <label className="text-sm font-bold text-zinc-500 uppercase tracking-wider">Start Time (24h)</label>
                                <input 
                                    type="number" 
                                    min={0} 
                                    max={23}
                                    value={config.activeHoursStart ?? 7}
                                    onChange={(e) => setConfig(prev => ({ ...prev, activeHoursStart: parseInt(e.target.value) }))}
                                    className="bg-zinc-900 border border-zinc-700 rounded-lg px-4 py-2 text-white font-mono text-xl w-32 focus:outline-none focus:border-orange-500 transition-colors"
                                />
                             </div>
                             <div className="h-px w-8 bg-zinc-700" />
                             <div className="flex flex-col gap-2">
                                <label className="text-sm font-bold text-zinc-500 uppercase tracking-wider">End Time (24h)</label>
                                <input 
                                    type="number" 
                                    min={0} 
                                    max={23}
                                    value={config.activeHoursEnd ?? 21}
                                    onChange={(e) => setConfig(prev => ({ ...prev, activeHoursEnd: parseInt(e.target.value) }))}
                                    className="bg-zinc-900 border border-zinc-700 rounded-lg px-4 py-2 text-white font-mono text-xl w-32 focus:outline-none focus:border-orange-500 transition-colors"
                                />
                             </div>
                             <div className="ml-auto text-sm text-zinc-500 max-w-sm">
                                Define the "Active Hours" for your day. Events outside this range will be grouped into "Before" and "After" buckets.
                             </div>
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="p-6 border-t border-zinc-800 bg-zinc-900/50 flex justify-end gap-4">
                    <button onClick={onClose} className="px-6 py-3 rounded-xl font-bold text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors">
                        Cancel
                    </button>
                    <button 
                        onClick={handleSave} 
                        className="px-8 py-3 rounded-xl font-bold bg-white text-black hover:bg-zinc-200 transition-colors flex items-center gap-2"
                    >
                        <Save size={18} />
                        Save Changes
                    </button>
                </div>

                {isLoading && (
                    <div className="absolute inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center flex-col gap-4">
                        <RefreshCw size={48} className="animate-spin text-zinc-500" />
                    </div>
                )}
            </motion.div>
        </motion.div>
    );
};
