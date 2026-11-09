import React, { useEffect, useState } from 'react';
import { FolderOpen } from 'lucide-react';

/** What diagnostics:status answers (electron/diagnostics.ts). */
type DiagnosticsStatus = { enabled: false } | { enabled: true; folder: string; hostFolder: string };

const REFUSALS: Record<string, string> = {
    'not-a-directory': 'That is not a folder the app can open. Choose another one.',
    locked: 'The settings file is in use by another program (antivirus or a backup). Try again in a moment.',
    unreadable: 'The settings file could not be read. Try again in a moment.',
    'write-failed': 'The settings file could not be written. Try again in a moment.',
};

function field(value: unknown, key: string): unknown {
    return typeof value === 'object' && value !== null ? Reflect.get(value, key) : undefined;
}

function toStatus(value: unknown): DiagnosticsStatus | null {
    if (field(value, 'enabled') === false) return { enabled: false };
    const folder = field(value, 'folder');
    const hostFolder = field(value, 'hostFolder');
    if (field(value, 'enabled') === true && typeof folder === 'string' && typeof hostFolder === 'string') return { enabled: true, folder, hostFolder };
    return null;
}

/** Settings → General: where this computer writes its diagnostics. Main chooses the folder in a
 *  native dialog; the window never names a path, it only asks. */
export const DiagnosticsFolderRow: React.FC = () => {
    const [status, setStatus] = useState<DiagnosticsStatus | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        let cancelled = false;
        window.ipcRenderer?.invoke('diagnostics:status')
            .then(answer => {
                if (cancelled) return;
                const read = toStatus(answer);
                setStatus(read);
                if (!read) setError('Could not read the diagnostics setting.');
            })
            .catch(() => { if (!cancelled) setError('Could not read the diagnostics setting.'); });
        return () => { cancelled = true; };
    }, []);

    /** Each caller names its channel literally: diagnostics-boundary.test.ts checks choose-folder carries no argument. */
    const change = async (send: (ipc: NonNullable<Window['ipcRenderer']>) => Promise<unknown>) => {
        const ipc = window.ipcRenderer;
        if (!ipc) return;
        setBusy(true);
        setError(null);
        try {
            const answer = await send(ipc);
            const next = toStatus(field(answer, 'status'));
            const reason = field(answer, 'reason');
            if (field(answer, 'ok') === true && next) setStatus(next);
            else if (reason !== 'cancelled') setError(typeof reason === 'string' && REFUSALS[reason] ? REFUSALS[reason] : 'Could not change the diagnostics folder.');
        } catch {
            setError('Could not change the diagnostics folder.');
        } finally {
            setBusy(false);
        }
    };

    const buttonClass = `px-4 py-2 rounded-lg font-bold text-sm transition-all ${busy ? 'bg-zinc-100 dark:bg-zinc-800 text-zinc-400 cursor-not-allowed' : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700'}`;

    return (
        <div className="border-t border-zinc-200 dark:border-zinc-800 pt-8">
            <h3 className="text-lg font-bold text-zinc-900 dark:text-white mb-4 flex items-center gap-2">
                <FolderOpen size={20} className="text-zinc-400" /> Diagnostics
            </h3>
            <div className="bg-white dark:bg-zinc-900 p-6 rounded-xl border border-zinc-200 dark:border-zinc-800 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex flex-col gap-1 min-w-0">
                        <h4 className="text-sm font-bold text-zinc-500 uppercase tracking-wider">Diagnostics folder</h4>
                        <div className="font-mono text-sm text-zinc-800 dark:text-zinc-200 break-all" data-testid="diagnostics-folder">
                            {status?.enabled ? status.hostFolder : 'Off'}
                        </div>
                    </div>
                    <div className="flex gap-2 shrink-0">
                        <button onClick={() => change(ipc => ipc.invoke('diagnostics:choose-folder'))} disabled={busy} className={buttonClass}>
                            Choose folder…
                        </button>
                        {status?.enabled && (
                            <button onClick={() => change(ipc => ipc.invoke('diagnostics:disable'))} disabled={busy} className={buttonClass}>
                                Turn off
                            </button>
                        )}
                    </div>
                </div>
                {error && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p>}
                <p className="text-xs text-zinc-500">
                    When a folder is chosen, this computer writes a record of each quick-game check and a copy of the audit trail
                    into a folder named after it there. Choose a folder your other computer syncs (OneDrive). Nothing else is written.
                </p>
            </div>
        </div>
    );
};
