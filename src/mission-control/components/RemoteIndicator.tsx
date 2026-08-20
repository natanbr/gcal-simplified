// ============================================================
// Mission Control — Remote Connection Indicator
// Small brow chip showing whether the phone remote is online.
// Extracted from MissionControl.tsx.
// ⚠️  Internal to src/mission-control/ only.
// ============================================================

import { useRemoteStatus } from '../contexts/RemoteStatusContext';

export function RemoteIndicator() {
    const status = useRemoteStatus();
    const isOnline = status === 'online';

    return (
        <div
            style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                background: 'rgba(255, 255, 255, 0.03)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                borderRadius: 12,
                padding: '6px 12px',
                fontSize: 13,
                fontWeight: 800,
                color: 'var(--mc-text-muted)',
            }}
        >
            <span
                className={isOnline ? 'mc-anim-remote-pulse' : ''}
                style={{
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    backgroundColor: isOnline ? 'var(--mc-green)' : 'var(--mc-red)',
                    boxShadow: isOnline ? '0 0 8px var(--mc-green)' : 'none',
                }}
            />
            <span style={{ color: 'var(--mc-text)' }}>Remote</span>
        </div>
    );
}
