import React, { useState } from 'react';
import { RefreshCw, LogOut } from 'lucide-react';

interface AccountSettingsTabProps {
    onLogout?: () => void;
    loadData: () => Promise<void>;
}

export const AccountSettingsTab: React.FC<AccountSettingsTabProps> = ({ onLogout, loadData }) => {
    const [isReconnecting, setIsReconnecting] = useState(false);

    return (
        <div className="space-y-8 animate-in fade-in slide-in-from-right-4 duration-300">
            <div>
                <h3 className="text-xl font-bold text-zinc-900 dark:text-white mb-4">Google Account</h3>
                <div className="bg-white dark:bg-zinc-900 p-6 rounded-xl border border-zinc-200 dark:border-zinc-800 flex items-center justify-between gap-4">
                    <div>
                        <h4 className="font-bold text-zinc-800 dark:text-zinc-200 mb-1">Account Connection</h4>
                        <p className="text-sm text-zinc-500 dark:text-zinc-400 max-w-md">
                            If your calendar data isn't loading or you see authentication errors, reconnect your Google account to get a fresh token.
                        </p>
                    </div>
                    <button
                        onClick={async () => {
                            setIsReconnecting(true);
                            try {
                                await window.ipcRenderer.invoke('auth:logout');
                                await window.ipcRenderer.invoke('auth:login');
                                // Reload settings data after re-auth
                                await loadData();
                            } catch (e) {
                                console.error('Reconnect failed', e);
                                // If login was cancelled/failed, trigger logout to show login screen
                                if (onLogout) onLogout();
                            } finally {
                                setIsReconnecting(false);
                            }
                        }}
                        disabled={isReconnecting}
                        className="px-6 py-3 rounded-xl font-bold bg-red-500/10 border border-red-500/30 text-red-500 hover:bg-red-500/20 transition-colors flex items-center gap-2 whitespace-nowrap disabled:opacity-50"
                        data-testid="reconnect-google-button"
                    >
                        {isReconnecting ? (
                            <><RefreshCw size={16} className="animate-spin" /> Reconnecting...</>
                        ) : (
                            <><LogOut size={16} /> Reconnect Account</>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
};
