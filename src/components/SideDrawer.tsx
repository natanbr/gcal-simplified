import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';

interface SideDrawerProps {
    isOpen: boolean;
    onClose: () => void;
    title: React.ReactNode;
    children: React.ReactNode;
}

export const SideDrawer: React.FC<SideDrawerProps> = ({ isOpen, onClose, title, children }) => {
    // We need to render the portal into document.body
    // But we need to ensure the theme is respected.
    // Since portal renders outside the main app tree, it might lose context if context was used,
    // but we use 'class' strategy on html/body, so it should be fine.

    // We add a state to ensure we are mounted on client
    const [mounted, setMounted] = useState(false);
    useEffect(() => setMounted(true), []);

    // Ensure document is available (for SSR safety, though likely Client-side)
    if (typeof document === 'undefined') return null;
    if (!mounted) return null;

    return createPortal(
        <AnimatePresence>
            {isOpen && (
                <>
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[100]"
                        onClick={onClose}
                    />
                    <motion.div
                        initial={{ x: '100%' }}
                        animate={{ x: 0 }}
                        exit={{ x: '100%' }}
                        transition={{ type: 'spring', damping: 30, stiffness: 300 }}
                        className="fixed top-0 right-0 h-full w-[90%] max-w-2xl bg-white dark:bg-zinc-900 border-l border-zinc-200 dark:border-zinc-700/50 shadow-2xl z-[101] flex flex-col text-zinc-900 dark:text-zinc-100 transition-colors duration-300"
                    >
                        <div className="p-6 border-b border-zinc-200 dark:border-zinc-800 flex justify-between items-center bg-white/95 dark:bg-zinc-900/95 backdrop-blur-md z-10 sticky top-0 transition-colors duration-300">
                            <div className="text-2xl font-black text-zinc-900 dark:text-white" data-testid="drawer-title">{title}</div>
                            <button
                                onClick={onClose}
                                className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-full transition-colors text-zinc-500 dark:text-zinc-400"
                                data-testid="close-drawer-button"
                            >
                                <X size={24} />
                            </button>
                        </div>
                        <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
                            {children}
                        </div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>,
        document.body
    );
};
