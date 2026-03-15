import React from 'react';
import { AppTask } from '../../../types';

export const TasksPanel: React.FC<{ tasks: AppTask[] }> = ({ tasks }) => {
    return (
        <div className="flex flex-col gap-4">
            {tasks.length === 0 ? (
                <div className="text-zinc-500 text-xl font-medium text-center py-10">No tasks found.</div>
            ) : (
                tasks.map(task => (
                    <div key={task.id} className="w-full bg-white dark:bg-zinc-800/80 p-6 rounded-xl border border-zinc-200 dark:border-zinc-700/50 flex items-center gap-4 shadow-sm">
                        <div className={`w-8 h-8 rounded-full border-2 flex items-center justify-center shrink-0 ${task.status === 'completed' ? 'border-green-500 bg-green-500/20' : 'border-zinc-400 dark:border-zinc-600'}`}>
                            {task.status === 'completed' && <div className="w-4 h-4 bg-green-500 rounded-full" />}
                        </div>
                        <span className={`text-lg font-medium ${task.status === 'completed' ? 'line-through text-zinc-500 dark:text-zinc-600' : 'text-zinc-800 dark:text-zinc-200'}`}>
                            {task.title}
                        </span>
                    </div>
                ))
            )}
        </div>
    );
};
