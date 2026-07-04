import { motion } from 'framer-motion';

interface GameSelectorOverlayProps {
    onSelect: (game: 'snake' | 'blocks') => void;
    onClose: () => void;
}

export function GameSelectorOverlay({ onSelect, onClose }: GameSelectorOverlayProps) {
    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{
                position: 'fixed', inset: 0, zIndex: 1000,
                background: 'rgba(0, 0, 0, 0.85)', backdropFilter: 'blur(6px)',
                display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}
        >
            <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.92, opacity: 0 }}
                transition={{ type: 'spring', stiffness: 300, damping: 24 }}
                style={{
                    background: 'linear-gradient(145deg, #1e293b, #0f172a)',
                    border: '2px solid rgba(255, 255, 255, 0.08)',
                    borderRadius: 28,
                    padding: '32px 36px 36px',
                    width: 'min(580px, 90vw)',
                    boxShadow: '0 25px 80px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.06)',
                    display: 'flex', flexDirection: 'column', gap: 24,
                    position: 'relative'
                }}
            >
                {/* Close Button */}
                <button
                    onClick={onClose}
                    style={{
                        position: 'absolute', top: 20, right: 20,
                        background: 'rgba(255, 255, 255, 0.06)', border: 'none',
                        borderRadius: '50%', width: 32, height: 32,
                        color: '#94a3b8', cursor: 'pointer', fontSize: 14,
                        display: 'flex', alignItems: 'center', justifyContent: 'center'
                    }}
                >
                    ✕
                </button>

                {/* Title */}
                <div style={{ textAlign: 'center', marginTop: 8 }}>
                    <h2 style={{ fontSize: 22, fontWeight: 900, color: '#f8fafc', margin: '0 0 6px', fontFamily: "'Nunito', sans-serif" }}>
                        Choose Quick Game 🕹️
                    </h2>
                    <p style={{ fontSize: 13, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', margin: 0 }}>
                        Select a game to play and earn your bonus
                    </p>
                </div>

                {/* Game Cards Grid */}
                <div style={{ display: 'flex', gap: 18, width: '100%' }}>
                    {/* Snake Game Card */}
                    <motion.button
                        whileHover={{ scale: 1.04, border: '2px solid rgba(74, 222, 128, 0.4)' }}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => onSelect('snake')}
                        style={{
                            flex: 1, height: 180, borderRadius: 20,
                            background: 'linear-gradient(135deg, rgba(34, 197, 94, 0.05), rgba(22, 163, 74, 0.1))',
                            border: '2px solid rgba(34, 197, 94, 0.15)',
                            padding: 20, cursor: 'pointer', display: 'flex',
                            flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                            gap: 12, textAlign: 'center', transition: 'border-color 0.2s'
                        }}
                    >
                        <span style={{ fontSize: 48 }}>🐍</span>
                        <div>
                            <div style={{ fontSize: 16, fontWeight: 900, color: '#4ade80', fontFamily: "'Nunito', sans-serif" }}>
                                Snake Game
                            </div>
                            <p style={{ fontSize: 11, color: '#94a3b8', margin: '4px 0 0', lineHeight: 1.3 }}>
                                Guide the snake, eat healthy food, and dodge obstacles!
                            </p>
                        </div>
                    </motion.button>

                    {/* Space Rescue Blocks Card */}
                    <motion.button
                        whileHover={{ scale: 1.04, border: '2px solid rgba(56, 189, 248, 0.4)' }}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => onSelect('blocks')}
                        style={{
                            flex: 1, height: 180, borderRadius: 20,
                            background: 'linear-gradient(135deg, rgba(56, 189, 248, 0.05), rgba(2, 132, 199, 0.1))',
                            border: '2px solid rgba(56, 189, 248, 0.15)',
                            padding: 20, cursor: 'pointer', display: 'flex',
                            flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                            gap: 12, textAlign: 'center', transition: 'border-color 0.2s'
                        }}
                    >
                        <span style={{ fontSize: 48 }}>🚀</span>
                        <div>
                            <div style={{ fontSize: 16, fontWeight: 900, color: '#38bdf8', fontFamily: "'Nunito', sans-serif" }}>
                                Space Rescue
                            </div>
                            <p style={{ fontSize: 11, color: '#94a3b8', margin: '4px 0 0', lineHeight: 1.3 }}>
                                Drag and drop space debris blocks to clear the rocket path!
                            </p>
                        </div>
                    </motion.button>
                </div>
            </motion.div>
        </motion.div>
    );
}
