import React from 'react';
import { Check } from 'lucide-react';
import { UserConfig, TaskListSource } from '../../../types';

interface TasksSettingsTabProps {
    config: UserConfig;
    taskLists: TaskListSource[];
    toggleId: (key: 'taskListIds', id: string) => void;
}

export const TasksSettingsTab: React.FC<TasksSettingsTabProps> = ({ config, taskLists, toggleId }) => {
    return (
        <div className="flex flex-col gap-4 animate-in fade-in slide-in-from-right-4 duration-300">
                                 <h3 className="text-xl font-bold text-zinc-900 dark:text-white mb-2">
                                    Task Lists
                                </h3>
                                 <div className="space-y-2">
                                    {taskLists.map(list => {
                                         const isChecked = config.taskListIds.includes(list.id);
                                         return (
                                            <div
                                                key={list.id}
                                                onClick={() => toggleId('taskListIds', list.id)}
                                                className={`p-4 rounded-xl border flex items-center gap-4 cursor-pointer transition-all bg-white dark:bg-zinc-900 ${isChecked ? 'border-green-500 shadow-lg shadow-green-500/10' : 'border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800'}`}
                                            >
                                                <div className={`w-5 h-5 rounded border flex items-center justify-center transition-colors ${isChecked ? 'bg-green-500 border-green-500' : 'border-zinc-400 dark:border-zinc-600'}`}>
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
    );
};
