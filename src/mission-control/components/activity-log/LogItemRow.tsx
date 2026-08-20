// ============================================================
// Mission Control — one row of the activity log
// ⚠️  Internal to src/mission-control/ only.
// ============================================================

import React from 'react';
import { ActivityLogEntry } from '../../types';
import { SOURCE_META, sourceOf } from './logSources';
import { renderHighlightedMessage } from './renderHighlightedMessage';

function titleColorFor(log: ActivityLogEntry): string {
    if (log.colorKey === 'cheat') return 'text-red-700';
    if (log.colorKey === 'morning') return 'text-amber-500';
    if (log.colorKey === 'evening') return 'text-purple-500';
    if (log.colorKey === 'recycling') return 'text-emerald-500';
    if (log.colorKey === 'activity') return 'text-blue-500';
    if (log.colorKey === 'bank') return 'text-slate-900';
    if (log.colorKey === 'system') return 'text-slate-500';

    // Fallbacks based on original categorization
    if (log.type === 'manual') return 'text-slate-900';
    if (log.type === 'mission') return 'text-emerald-700';
    if (log.type === 'reward' || log.type === 'responsibility') return 'text-purple-700';
    if (log.type === 'system') return 'text-blue-700';
    return 'text-slate-700';
}

export const LogItemRow = React.memo(function LogItemRow({ log }: { log: ActivityLogEntry }) {
    const titleColor = titleColorFor(log);
    const bgClass = log.colorKey === 'cheat'
        ? 'bg-red-50 hover:bg-red-100 transition-colors'
        : 'hover:bg-slate-50/80 transition-colors';

    const source = sourceOf(log);
    const meta = SOURCE_META[source];

    const timeString = new Date(log.timestamp).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    const dateString = new Date(log.timestamp).toLocaleDateString([], { month: 'short', day: 'numeric' });

    return (
        <tr className={bgClass}>
            <td className="px-6 py-3 whitespace-nowrap align-top">
                <div className="flex items-center gap-2 text-xs">
                    <span className="font-semibold text-slate-500">{dateString}</span>
                    <span className="text-slate-400 font-medium">{timeString}</span>
                </div>
            </td>
            <td className="px-2 py-3 align-top">
                {/* Attribution badge — the column that answers "who did this?" */}
                <span
                    title={meta.title}
                    className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-black whitespace-nowrap"
                    style={{ background: meta.bg, color: meta.color }}
                >
                    <span>{meta.icon}</span>
                    <span className="uppercase tracking-wider">{meta.label}</span>
                </span>
            </td>
            <td className="px-4 py-3">
                <div className={`flex items-center gap-3 font-bold ${titleColor}`}>
                    <span className="text-base leading-none">{log.icon}</span>
                    <span className="tracking-wide">{renderHighlightedMessage(log.message)}</span>
                </div>
            </td>
            <td className="px-6 py-3 text-right align-top">
                <div className="flex flex-col items-end gap-1">
                    <div className="flex items-center gap-2">
                        {log.delta !== undefined && log.delta !== 0 && (
                            <span className={`inline-flex items-center justify-center px-1.5 py-0.5 rounded text-[10px] font-black tracking-wider border ${
                                log.delta > 0
                                    ? 'bg-emerald-50 text-emerald-600 border-emerald-200'
                                    : 'bg-rose-50 text-rose-600 border-rose-200'
                            }`}>
                                {log.delta > 0 ? '+' : ''}{log.delta}
                            </span>
                        )}

                        {log.totalTokens !== undefined && (
                            <div className="flex items-center gap-1 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200" title="Total Tokens (Bank + Goals)">
                                <span className="text-[10px] opacity-60">Σ</span>
                                <span className="text-[10px] font-black text-slate-700">{log.totalTokens}</span>
                            </div>
                        )}
                    </div>

                    <div className="flex items-center gap-2">
                        {log.bankTokens !== undefined && (
                            <div className="flex items-center gap-1 px-1.5 py-0.5" title="Bank Tokens after this event">
                                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-tighter">Bank:</span>
                                <span className="text-[10px] font-black text-slate-600">{log.bankTokens}</span>
                            </div>
                        )}
                        {log.gameTokens !== undefined && (
                            <div className="flex items-center gap-1 px-1.5 py-0.5" title="Mood (game) tokens after this event">
                                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-tighter">🎮</span>
                                <span className="text-[10px] font-black text-slate-600">{log.gameTokens}</span>
                            </div>
                        )}
                    </div>
                </div>
            </td>
        </tr>
    );
});
