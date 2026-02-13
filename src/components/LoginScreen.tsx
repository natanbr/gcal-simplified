import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowRight, Calendar } from 'lucide-react';

export const LoginScreen: React.FC = () => {
    const [isLoading, setIsLoading] = useState(false);

    const handleLogin = async () => {
        setIsLoading(true);
        try {
            // Invoke the IPC handler we defined in main.ts
            await window.ipcRenderer.invoke('auth:login');
            // The success handling will be done by listening to 'auth:success' 
            // or relying on the App component's auth check
        } catch (error) {
            console.error("Login failed", error);
            setIsLoading(false);
        }
    };

    return (
        <div className="h-screen w-screen bg-zinc-950 flex flex-col items-center justify-center relative overflow-hidden">
            {/* Background Gradients */}
            <div className="absolute top-0 left-0 w-full h-full overflow-hidden z-0">
                <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] bg-blue-500/20 rounded-full blur-[120px]" />
                <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] bg-purple-500/20 rounded-full blur-[120px]" />
            </div>

            <div className="z-10 flex flex-col items-center gap-8">
                <motion.div
                    initial={{ scale: 0.9, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ duration: 0.5 }}
                    className="flex flex-col items-center gap-4"
                >
                    <div className="bg-zinc-900/80 p-6 rounded-3xl border border-zinc-800 shadow-2xl">
                        <Calendar size={64} className="text-blue-400" />
                    </div>
                </motion.div>

                <motion.button
                    initial={{ y: 20, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={{ delay: 0.2 }}
                    onClick={handleLogin}
                    disabled={isLoading}
                    data-testid="login-button"
                    className="group relative flex items-center gap-3 px-8 py-4 bg-white text-black rounded-xl font-bold text-lg hover:bg-zinc-200 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    {isLoading ? (
                        <span>Connecting...</span>
                    ) : (
                        <>
                            <span>Sign in with Google</span>
                            <ArrowRight size={20} className="group-hover:translate-x-1 transition-transform" />
                        </>
                    )}
                </motion.button>
                
                <p className="text-zinc-500 text-sm max-w-md text-center">
                    A high-visibility, simplified dashboard for your wall display. <br/>
                    Connect your Google Account to get started.
                </p>
            </div>
        </div>
    );
};
