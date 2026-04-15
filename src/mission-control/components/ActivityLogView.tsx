import { useState } from 'react';
import { createPortal } from 'react-dom';
import { useMCState } from '../store/useMCStore';
import { Activity, X } from 'lucide-react';
import { ActivityLogEntry } from '../types';
import { useMCDispatch } from '../store/useMCStore';

export function ActivityLogView() {
    const { activityLogs, hasUnreviewedCheatAttempt } = useMCState();
    const dispatch = useMCDispatch();
    const [isOpen, setIsOpen] = useState(false);

    const handleOpen = () => {
        setIsOpen(true);
        if (hasUnreviewedCheatAttempt) {
            dispatch({ type: 'CLEAR_CHEAT_FLAG' });
        }
    };

    return (
        <div style={{ position: 'relative' }}>
            <button 
                onClick={handleOpen}
                className="flex items-center gap-2 px-3 py-2 bg-white/80 hover:bg-slate-50 text-slate-700 rounded-lg transition border border-slate-200 backdrop-blur-sm shadow-sm"
                title="Activity Log"
            >
                <Activity size={18} className="text-indigo-500" />
                <span className="text-sm font-bold tracking-wide uppercase opacity-90">Logs</span>
            </button>
            {hasUnreviewedCheatAttempt && <div className="mc-notification-dot" />}

            {isOpen && createPortal(
                <div 
                    className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm"
                    onClick={() => setIsOpen(false)}
                >
                    <div 
                        className="bg-white w-full max-w-2xl rounded-2xl shadow-xl border border-slate-200 flex flex-col max-h-[85vh] overflow-hidden animate-in fade-in zoom-in-95 duration-200"
                        onClick={e => e.stopPropagation()}
                    >
                        
                        {/* Header */}
                        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/50">
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-indigo-100 text-indigo-600 rounded-lg">
                                    <Activity size={20} />
                                </div>
                                <h2 className="text-lg font-bold text-slate-800 tracking-wide">Activity History</h2>
                                <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-slate-200 text-slate-600 uppercase tracking-widest">
                                    7 Days
                                </span>
                            </div>
                            <button 
                                onClick={() => setIsOpen(false)}
                                className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-200/50 rounded-lg transition"
                                title="Close"
                            >
                                <X size={20} />
                            </button>
                        </div>

                        {/* Log List */}
                        <div className="flex-1 overflow-y-auto w-full">
                            {(!activityLogs || activityLogs.length === 0) ? (
                                <div className="flex flex-col items-center justify-center h-48 text-slate-400 gap-3">
                                    <Activity size={32} className="opacity-50" />
                                    <p className="text-sm font-medium">No activity recorded yet</p>
                                </div>
                            ) : (
                                <table className="w-full text-left text-sm text-slate-600">
                                    <thead className="text-xs text-slate-400 uppercase bg-slate-50/50 sticky top-0 border-b border-slate-100">
                                        <tr>
                                            <th className="px-6 py-3 font-bold tracking-wider rounded-tl-lg w-32">Time</th>
                                            <th className="px-6 py-3 font-bold tracking-wider">Event</th>
                                            <th className="px-6 py-3 font-bold tracking-wider rounded-tr-lg text-right w-24">Tokens</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {activityLogs.map(log => (
                                            <LogItemRow key={log.id} log={log} />
                                        ))}
                                    </tbody>
                                </table>
                            )}
                        </div>
                    </div>
                </div>,
                document.body
            )}
        </div>
    );
}

function LogItemRow({ log }: { log: ActivityLogEntry }) {
    // Determine colors based on type
    let titleColor = "text-slate-700";
    let bgClass = "hover:bg-slate-50/80 transition-colors";
    
    // Explicit color key overrides from user request
    if (log.colorKey === 'cheat') {
        titleColor = "text-red-700";
        bgClass = "bg-red-50 hover:bg-red-100 transition-colors";
    }
    else if (log.colorKey === 'morning') titleColor = "text-amber-500"; // Orange
    else if (log.colorKey === 'evening') titleColor = "text-purple-500";
    else if (log.colorKey === 'recycling') titleColor = "text-emerald-500"; // Green
    else if (log.colorKey === 'activity') titleColor = "text-blue-500";
    else if (log.colorKey === 'bank') titleColor = "text-slate-900"; // Black
    else if (log.colorKey === 'system') titleColor = "text-slate-500"; // neutral
    else {
        // Fallbacks based on original categorization
        if (log.type === 'manual') titleColor = "text-slate-900";
        else if (log.type === 'mission') titleColor = "text-emerald-700";
        else if (log.type === 'reward' || log.type === 'responsibility') titleColor = "text-purple-700";
        else if (log.type === 'system') titleColor = "text-blue-700";
    }

    const timeString = new Date(log.timestamp).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    const dateString = new Date(log.timestamp).toLocaleDateString([], { month: 'short', day: 'numeric' });

    return (
        <tr className={bgClass}>
            <td className="px-6 py-3 whitespace-nowrap">
                <div className="flex items-center gap-2 text-xs">
                    <span className="font-semibold text-slate-500">{dateString}</span>
                    <span className="text-slate-400 font-medium">{timeString}</span>
                </div>
            </td>
            <td className="px-6 py-3">
                <div className={`flex items-center gap-3 font-bold ${titleColor}`}>
                    <span className="text-base leading-none">{log.icon}</span>
                    <span className="tracking-wide">{log.message}</span>
                </div>
            </td>
            <td className="px-6 py-3 text-right">
                {log.delta !== undefined && log.delta !== 0 && (
                    <span className={`inline-flex items-center justify-center px-2 py-1 rounded-md text-xs font-black tracking-wider border ${
                        log.delta > 0 
                        ? 'bg-emerald-50 text-emerald-600 border-emerald-200' 
                        : 'bg-rose-50 text-rose-600 border-rose-200'
                    }`}>
                        {log.delta > 0 ? '+' : ''}{log.delta}
                    </span>
                )}
            </td>
        </tr>
    );
}
