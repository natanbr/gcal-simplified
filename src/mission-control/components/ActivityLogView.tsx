import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useMCState, useMCDispatch, selectTotalWealth } from '../store/useMCStore';
import { Activity, X, HardDriveDownload } from 'lucide-react';
import { ActivityLogEntry } from '../types';
import { LogItemRow } from './activity-log/LogItemRow';
import { LogSummaryStrip } from './activity-log/LogSummaryStrip';
import { sourceOf } from './activity-log/logSources';

type FilterMode = 'tokens' | 'missions' | 'unattended' | 'remote' | 'all';

const TOKEN_TYPES = new Set<ActivityLogEntry['type']>(['manual', 'reward', 'responsibility']);

const FILTERS: Array<{ id: FilterMode; label: string; title: string }> = [
    { id: 'tokens', label: '💰 Tokens', title: 'Only entries that moved tokens' },
    { id: 'missions', label: '🎯 Missions', title: 'Mission starts, completions and expiries' },
    { id: 'unattended', label: '⚙️ Automatic', title: 'Things the clock or the app did on its own — nobody pressed anything' },
    { id: 'remote', label: '📱 Phone', title: 'Everything sent from the phone remote' },
    { id: 'all', label: '📋 All', title: 'Everything' },
];

function matchesFilter(log: ActivityLogEntry, mode: FilterMode): boolean {
    switch (mode) {
        case 'tokens': return TOKEN_TYPES.has(log.type);
        case 'missions': return log.type === 'mission';
        case 'unattended': {
            const source = sourceOf(log);
            return source === 'scheduler' || source === 'auto' || source === 'system';
        }
        case 'remote': return sourceOf(log) === 'remote';
        case 'all': return true;
    }
}

export function ActivityLogView(): React.JSX.Element {
    const state = useMCState();
    const { activityLogs, hasUnreviewedCheatAttempt, bankCount, gameTokens } = state;
    const dispatch = useMCDispatch();
    const [isOpen, setIsOpen] = useState(false);
    const [filterMode, setFilterMode] = useState<FilterMode>('tokens');
    const [visibleCount, setVisibleCount] = useState(30);
    const [confirmClear, setConfirmClear] = useState(false);
    const [exportNote, setExportNote] = useState('');
    const sentinelRef = useRef<HTMLDivElement>(null);

    const handleOpen = () => {
        setIsOpen(true);
        setVisibleCount(30);
        setConfirmClear(false);
        setExportNote('');
        if (hasUnreviewedCheatAttempt) {
            dispatch({ type: 'CLEAR_CHEAT_FLAG' });
        }
    };

    // Reset visibleCount when filterMode changes
    useEffect(() => {
        setVisibleCount(30);
    }, [filterMode]);

    const filteredLogs = useMemo(
        () => (isOpen ? activityLogs.filter(log => matchesFilter(log, filterMode)) : []),
        [isOpen, activityLogs, filterMode]
    );

    const visibleLogs = useMemo(
        () => filteredLogs.slice(0, visibleCount),
        [filteredLogs, visibleCount]
    );

    // Infinite scrolling / Lazy loading
    useEffect(() => {
        if (!isOpen || !sentinelRef.current) return;
        if (visibleCount >= filteredLogs.length) return;

        const observer = new IntersectionObserver(
            (entries) => {
                if (entries[0].isIntersecting) {
                    setVisibleCount(prev => Math.min(prev + 30, filteredLogs.length));
                }
            },
            { rootMargin: '0px 0px 200px 0px', threshold: 0.1 }
        );
        observer.observe(sentinelRef.current);
        return () => observer.disconnect();
    }, [isOpen, visibleCount, filteredLogs.length]);

    /** Pulls the durable on-disk trail — the record CLEAR cannot touch. */
    const handleExport = useCallback(async () => {
        if (!window.ipcRenderer) {
            setExportNote('Only available in the desktop app');
            return;
        }
        try {
            const entries = await window.ipcRenderer.invoke('audit:read', 2000) as unknown[];
            const blob = new Blob([entries.map(e => JSON.stringify(e)).join('\n')], { type: 'application/x-ndjson' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `mission-control-audit-${new Date().toISOString().slice(0, 10)}.ndjson`;
            a.click();
            URL.revokeObjectURL(url);
            setExportNote(`${entries.length} events exported`);
        } catch {
            setExportNote('Export failed');
        }
    }, []);

    const handleClear = useCallback(() => {
        if (!confirmClear) {
            setConfirmClear(true);
            return;
        }
        dispatch({ type: 'CLEAR_LOGS' });
        setConfirmClear(false);
    }, [confirmClear, dispatch]);

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
                        className="bg-white w-full max-w-4xl rounded-2xl shadow-xl border border-slate-200 flex flex-col max-h-[85vh] overflow-hidden animate-in fade-in zoom-in-95 duration-200"
                        onClick={e => e.stopPropagation()}
                    >
                        {/* Header */}
                        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/50">
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-indigo-100 text-indigo-600 rounded-lg">
                                    <Activity size={20} />
                                </div>
                                <h2 className="text-lg font-bold text-slate-800 tracking-wide">Activity History</h2>
                            </div>
                            <div className="flex items-center gap-3">
                                <button
                                    onClick={handleExport}
                                    className="flex items-center gap-1.5 px-3 py-1 text-xs font-bold text-slate-500 hover:bg-slate-200/50 hover:text-slate-700 rounded-md transition"
                                    title="Download the full on-disk trail. This record is append-only — CLEAR does not touch it."
                                >
                                    <HardDriveDownload size={14} />
                                    EXPORT
                                </button>
                                <button
                                    onClick={handleClear}
                                    className={`px-3 py-1 text-xs font-bold rounded-md transition ${
                                        confirmClear
                                            ? 'bg-red-500 text-white hover:bg-red-600'
                                            : 'text-red-500 hover:bg-red-50 hover:text-red-600'
                                    }`}
                                    title="Clears only this on-screen list. The on-disk trail is kept."
                                >
                                    {confirmClear ? 'CONFIRM CLEAR' : 'CLEAR'}
                                </button>
                                <button
                                    onClick={() => setIsOpen(false)}
                                    className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-200/50 rounded-lg transition"
                                    title="Close"
                                >
                                    <X size={20} />
                                </button>
                            </div>
                        </div>

                        {/* Five-second summary */}
                        <LogSummaryStrip
                            logs={activityLogs}
                            bankCount={bankCount}
                            gameTokens={gameTokens}
                            totalTokens={selectTotalWealth(state)}
                        />

                        {/* Filters */}
                        <div className="flex items-center gap-1.5 px-6 py-2 border-b border-slate-100 bg-slate-50/30 flex-wrap">
                            {FILTERS.map(f => (
                                <button
                                    key={f.id}
                                    onClick={() => setFilterMode(f.id)}
                                    title={f.title}
                                    className={`px-3 py-1 text-xs font-bold rounded-md transition-all border ${
                                        filterMode === f.id
                                            ? 'bg-white text-indigo-600 shadow-sm border-slate-200'
                                            : 'text-slate-500 border-transparent hover:text-slate-800 hover:bg-slate-200/40'
                                    }`}
                                >
                                    {f.label}
                                </button>
                            ))}
                            {exportNote && (
                                <span className="ml-auto text-[11px] font-bold text-slate-400">{exportNote}</span>
                            )}
                        </div>

                        {/* Log List */}
                        <div className="flex-1 overflow-y-auto w-full">
                            {filteredLogs.length === 0 ? (
                                <div className="flex flex-col items-center justify-center h-48 text-slate-400 gap-3">
                                    <Activity size={32} className="opacity-50" />
                                    <p className="text-sm font-medium">
                                        {activityLogs.length === 0 ? 'No activity recorded yet' : 'Nothing matches this filter'}
                                    </p>
                                </div>
                            ) : (
                                <>
                                    <table className="w-full text-left text-sm text-slate-600">
                                        <thead className="text-xs text-slate-400 uppercase bg-slate-50/50 sticky top-0 border-b border-slate-100">
                                            <tr>
                                                <th className="px-6 py-3 font-bold tracking-wider w-32">Time</th>
                                                <th className="px-2 py-3 font-bold tracking-wider w-24">Who</th>
                                                <th className="px-4 py-3 font-bold tracking-wider">Event</th>
                                                <th className="px-6 py-3 font-bold tracking-wider text-right w-32">Tokens</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100">
                                            {visibleLogs.map(log => (
                                                <LogItemRow key={log.id} log={log} />
                                            ))}
                                        </tbody>
                                    </table>
                                    {/* Sentinel: must be OUTSIDE <table>, INSIDE scroll container */}
                                    <div ref={sentinelRef} style={{ height: 1 }} />
                                </>
                            )}
                        </div>
                    </div>
                </div>,
                document.body
            )}
        </div>
    );
}
