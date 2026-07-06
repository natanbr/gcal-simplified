import { memo } from 'react';
import { motion } from 'framer-motion';

export const Altimeter = memo(function Altimeter({ altitude }: { altitude: number }) {
    const milestones = [
        { height: 50, icon: '☄️', label: 'Belt' },
        { height: 120, icon: '🛰️', label: 'Orbit' },
        { height: 180, icon: '⚡', label: 'Storm' }
    ];

    return (
        <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            width: 84,
            background: 'linear-gradient(180deg, rgba(30, 41, 59, 0.7), rgba(15, 23, 42, 0.9))',
            border: '1.5px solid rgba(56, 189, 248, 0.2)',
            borderRadius: 24,
            padding: '16px 8px',
            position: 'relative',
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5)'
        }}>
            {/* Rescue Destination at the Top */}
            <motion.div 
                /* Keep transition inside animate to prevent infinite background CPU loops when inactive */
                animate={altitude >= 200 ? {
                    scale: [1, 1.2, 1],
                    filter: ['drop-shadow(0 0 5px #4ade80)', 'drop-shadow(0 0 15px #4ade80)', 'drop-shadow(0 0 5px #4ade80)'],
                    transition: { repeat: Infinity, duration: 2 }
                } : {}}
                style={{ fontSize: 28, marginBottom: 8 }}
            >
                🛸
            </motion.div>
            
            {/* The vertical track */}
            <div style={{ 
                flex: 1, 
                width: 10, 
                background: 'rgba(15, 23, 42, 0.8)', 
                borderRadius: 99, 
                position: 'relative', 
                margin: '8px 0 16px 0',
                border: '1px solid rgba(255, 255, 255, 0.1)'
            }}>
                {/* Active progress fill */}
                <div style={{ 
                    position: 'absolute', 
                    bottom: 0, 
                    left: 0, 
                    right: 0, 
                    height: `${Math.min(100, (altitude / 200) * 100)}%`, 
                    background: 'linear-gradient(0deg, #3b82f6, #06b6d4, #4ade80)', 
                    transition: 'height 0.6s cubic-bezier(0.16, 1, 0.3, 1)', 
                    borderRadius: 99,
                    boxShadow: '0 0 10px rgba(59, 130, 246, 0.5)'
                }} />

                {/* Milestones markers along the track */}
                {milestones.map((m, idx) => {
                    const pct = (m.height / 200) * 100;
                    const isActive = altitude >= m.height;
                    return (
                        <div
                            key={idx}
                            style={{
                                position: 'absolute',
                                bottom: `${pct}%`,
                                left: -32,
                                right: -32,
                                height: 0,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                pointerEvents: 'none',
                            }}
                        >
                            <div style={{
                                width: '100%',
                                borderTop: `1px dashed ${isActive ? 'rgba(56, 189, 248, 0.4)' : 'rgba(255, 255, 255, 0.1)'}`,
                                position: 'absolute',
                                top: 0,
                                zIndex: 1
                            }} />
                            
                            <div style={{
                                position: 'absolute',
                                left: -4,
                                display: 'flex',
                                alignItems: 'center',
                                gap: 4,
                                opacity: isActive ? 1 : 0.4,
                                transition: 'opacity 0.3s',
                                zIndex: 2
                            }}>
                                <span style={{ fontSize: 14 }}>{m.icon}</span>
                                <span style={{ fontSize: 9, fontWeight: 900, color: isActive ? '#38bdf8' : '#64748b', textTransform: 'uppercase' }}>
                                    {m.height}m
                                </span>
                            </div>
                        </div>
                    );
                })}

                {/* The Rocket - moves up/down the track */}
                <motion.div
                    animate={{ bottom: `${Math.min(95, (altitude / 200) * 95)}%` }}
                    transition={{ type: 'spring', stiffness: 80, damping: 15 }}
                    style={{
                        position: 'absolute',
                        left: '50%',
                        x: '-50%',
                        rotate: 0, 
                        fontSize: 24,
                        pointerEvents: 'none',
                        zIndex: 10,
                        filter: 'drop-shadow(0 2px 8px rgba(56, 189, 248, 0.6))'
                    }}
                >
                    🚀
                </motion.div>
            </div>

            {/* Earth Icon at the Bottom */}
            <div style={{ fontSize: 20, marginTop: 4 }}>
                🌍
            </div>
        </div>
    );
});
