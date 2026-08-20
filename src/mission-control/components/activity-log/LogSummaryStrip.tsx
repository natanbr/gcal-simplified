// ============================================================
// Mission Control — Today-at-a-glance strip
// ------------------------------------------------------------
// The five-second surface. Everything a parent needs to know whether today
// looks normal, without reading a single log row:
//   current balances · what moved today · who moved it · anything odd.
// ⚠️  Internal to src/mission-control/ only.
// ============================================================

import React from 'react';
import type { ActivityLogEntry } from '../../types';
import { SOURCE_META, summariseDay, type LogSource } from './logSources';

interface LogSummaryStripProps {
    logs: ActivityLogEntry[];
    bankCount: number;
    gameTokens: number;
    totalTokens: number;
}

const SOURCE_ORDER: LogSource[] = ['local', 'remote', 'scheduler', 'auto'];

function Stat({ label, value, tone = 'neutral', title }: {
    label: string;
    value: string;
    tone?: 'neutral' | 'good' | 'bad' | 'warn';
    title?: string;
}) {
    const toneColor = {
        neutral: '#334155',
        good: '#059669',
        bad: '#e11d48',
        warn: '#b45309',
    }[tone];

    return (
        <div className="flex flex-col items-start min-w-[70px]" title={title}>
            <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">{label}</span>
            <span className="text-lg font-black leading-tight" style={{ color: toneColor }}>{value}</span>
        </div>
    );
}

export function LogSummaryStrip({ logs, bankCount, gameTokens, totalTokens }: LogSummaryStripProps): React.JSX.Element {
    const summary = React.useMemo(() => summariseDay(logs), [logs]);

    const hasAnomaly = summary.unattended > 0 || summary.cheatAttempts > 0;

    return (
        <div className="px-6 py-3 border-b border-slate-100 bg-white">
            <div className="flex items-center gap-6 flex-wrap">
                <Stat label="Bank" value={String(bankCount)} title="Tokens currently in the bank" />
                <Stat label="Total" value={String(totalTokens)} title="Bank plus everything already deposited into goals" />
                <Stat label="Mood tokens" value={String(gameTokens)} title="Game tokens available right now" />

                <div className="h-8 w-px bg-slate-200" />

                <Stat
                    label="Earned today"
                    value={summary.earned ? `+${summary.earned}` : '0'}
                    tone={summary.earned ? 'good' : 'neutral'}
                    title="Bank tokens gained today"
                />
                <Stat
                    label="Spent today"
                    value={summary.spent ? `-${summary.spent}` : '0'}
                    tone={summary.spent ? 'bad' : 'neutral'}
                    title="Bank tokens spent today"
                />

                <div className="h-8 w-px bg-slate-200" />

                {/* Who did what today. A number here that does not match your memory
                    of the day is the fastest signal that something is off. */}
                <div className="flex items-center gap-3">
                    <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">Who</span>
                    <div className="flex items-center gap-2">
                        {SOURCE_ORDER.map(source => {
                            const meta = SOURCE_META[source];
                            const count = summary.bySource[source];
                            return (
                                <span
                                    key={source}
                                    title={`${meta.title} — ${count} today`}
                                    className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[11px] font-black"
                                    style={{
                                        background: count ? meta.bg : 'transparent',
                                        color: count ? meta.color : '#cbd5e1',
                                    }}
                                >
                                    <span>{meta.icon}</span>
                                    <span>{count}</span>
                                </span>
                            );
                        })}
                    </div>
                </div>
            </div>

            {hasAnomaly && (
                <div className="mt-2 flex items-center gap-2 flex-wrap">
                    {summary.unattended > 0 && (
                        <span
                            className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] font-bold bg-amber-50 text-amber-700 border border-amber-200"
                            title="Tokens moved today without anyone pressing anything — the clock or the app itself did it. Normal in small numbers (mission timers, the mood gauge filling)."
                        >
                            ⚠️ {summary.unattended} token {summary.unattended === 1 ? 'change' : 'changes'} with nobody at the controls
                        </span>
                    )}
                    {summary.cheatAttempts > 0 && (
                        <span
                            className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] font-bold bg-red-50 text-red-700 border border-red-200"
                            title="The bank cheat trap was triggered today"
                        >
                            🚨 {summary.cheatAttempts} bank {summary.cheatAttempts === 1 ? 'attempt' : 'attempts'}
                        </span>
                    )}
                </div>
            )}
        </div>
    );
}
