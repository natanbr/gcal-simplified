import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Download, RefreshCw, AlertCircle } from 'lucide-react';

interface UpdateInfo {
    version: string;
    releaseDate: string;
}

interface ProgressInfo {
    percent: number;
    total: number;
    transferred: number;
    bytesPerSecond: number;
    delta: number;
}

export const UpdateNotification: React.FC = () => {
    const [updateAvailable, setUpdateAvailable] = useState<UpdateInfo | null>(null);
    const [isDownloading, setIsDownloading] = useState(false);
    const [downloadProgress, setDownloadProgress] = useState<number>(0);
    const [isReadyToInstall, setIsReadyToInstall] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!window.ipcRenderer) return;

        // Listen for update available
        const cleanupAvailable = window.ipcRenderer.on('update:available', (info) => {
            console.log('Update available:', info);
            setUpdateAvailable(info as UpdateInfo);
        });

        // Listen for update not available
        const cleanupNotAvailable = window.ipcRenderer.on('update:not-available', () => {
            console.log('Update not available');
            setUpdateAvailable(null);
        });

        // Listen for download progress
        const cleanupProgress = window.ipcRenderer.on('update:download-progress', (progress) => {
            const p = progress as ProgressInfo;
            if (p && typeof p.percent === 'number') {
                setDownloadProgress(p.percent);
            }
        });

        // Listen for update downloaded
        const cleanupDownloaded = window.ipcRenderer.on('update:downloaded', () => {
            setIsDownloading(false);
            setIsReadyToInstall(true);
            // Automatically install after a brief delay to show completion
            setTimeout(() => {
                handleInstall();
            }, 1500);
        });

        // Listen for errors
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const cleanupError = window.ipcRenderer.on('update:error', (err: any) => {
            console.error('Update error:', err);
            setIsDownloading(false);
            setError('Update failed');
            setTimeout(() => setError(null), 5000);
        });

        // Trigger an immediate check when this component mounts
        // This solves the race condition if the initial check in main.ts
        // happened before the user logged in.
        window.ipcRenderer.invoke('update:check').then((result: any) => {
            if (result && result.updateInfo) {
                console.log('Update check result:', result.updateInfo);
                setUpdateAvailable(result.updateInfo);
            }
        }).catch(err => {
            console.error('Initial mount update check failed:', err);
        });

        return () => {
            cleanupAvailable();
            cleanupNotAvailable();
            cleanupProgress();
            cleanupDownloaded();
            cleanupError();
        };
    }, []);

    const handleDownload = async () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const info = updateAvailable as any;
        if (!info) return;

        setIsDownloading(true);
        setError(null);
        try {
            await window.ipcRenderer.invoke('update:download');
        } catch (e) {
            console.error("Failed to start download", e);
            setIsDownloading(false);
            setError("Download failed");
        }
    };

    const handleInstall = async () => {
        try {
            await window.ipcRenderer.invoke('update:install');
        } catch (e) {
            console.error("Failed to install", e);
            setError("Install failed");
        }
    };

    if (!updateAvailable && !error) return null;

    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="flex items-center gap-2 mr-4"
            >
                {error ? (
                     <div className="flex items-center gap-2 px-3 py-1.5 bg-red-500/10 border border-red-500/20 rounded-full text-red-500 text-xs font-bold uppercase tracking-wider">
                        <AlertCircle size={14} />
                        <span>{error}</span>
                     </div>
                ) : isReadyToInstall ? (
                    <button
                        onClick={handleInstall}
                        className="flex items-center gap-2 px-4 py-2 bg-green-500 hover:bg-green-600 text-white rounded-full transition-all shadow-lg shadow-green-500/20"
                    >
                        <RefreshCw size={16} className="animate-spin" />
                        <span className="text-xs font-black uppercase tracking-widest">Restarting...</span>
                    </button>
                ) : isDownloading ? (
                     <div className="flex items-center gap-3 px-4 py-2 bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-full">
                         <div className="flex flex-col gap-1 w-24">
                            <div className="flex justify-between items-center text-[10px] text-zinc-500 dark:text-zinc-400 font-mono">
                                <span>DOWNLOADING</span>
                                <span>{Math.round(downloadProgress)}%</span>
                            </div>
                            <div className="h-1 bg-zinc-200 dark:bg-zinc-600 rounded-full overflow-hidden w-full">
                                <motion.div
                                    className="h-full bg-blue-500"
                                    initial={{ width: 0 }}
                                    animate={{ width: `${downloadProgress}%` }}
                                />
                            </div>
                        </div>
                     </div>
                ) : (
                    <button
                        onClick={handleDownload}
                        className="flex items-center gap-2 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-full transition-all shadow-lg shadow-blue-500/20"
                    >
                        <Download size={16} />
                        <div className="flex flex-col items-start leading-none gap-0.5">
                            <span className="text-[9px] font-bold opacity-80 uppercase tracking-widest">Update</span>
                            <span className="text-xs font-black uppercase tracking-widest">v{updateAvailable?.version}</span>
                        </div>
                    </button>
                )}
            </motion.div>
        </AnimatePresence>
    );
};
