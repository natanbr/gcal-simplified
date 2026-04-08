import React from 'react';

export const LoadingOverlay: React.FC = () => (
    <div
        data-testid="marine-loading-overlay"
        style={{
            position: 'absolute',
            inset: 0,
            zIndex: 50,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(14,19,30,0.85)',
            backdropFilter: 'blur(6px)',
        }}
    >
        <div className="marine-loading-bar" />

        <div style={{
            width: 48, height: 48, marginBottom: 20,
            border: '2px solid var(--mc-border)',
            borderTopColor: 'var(--mc-cyan)',
            borderRadius: '50%',
            animation: 'spin 0.8s linear infinite',
        }} />

        <div style={{
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: '0.16em',
            textTransform: 'uppercase',
            color: 'var(--mc-cyan)',
        }}>
            Fetching Marine Data...
        </div>

        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
);
