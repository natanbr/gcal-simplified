import React from 'react';

interface Props {
    /** True when the error is because ipcRenderer doesn't exist (browser mode) */
    isIpcError: boolean;
    locationName: string;
    onRetry: () => void;
}

/**
 * Full-panel error state shown when:
 *  1. window.ipcRenderer is absent (browser mode — no Electron)
 *  2. The IPC call itself failed (station unreachable, timeout, etc.)
 *  3. useDataQuality.isValid = false (data loaded but fundamentally unusable)
 *
 * Design: Abyssal Command — dark, informative, not alarming.
 */
export const DataErrorState: React.FC<Props> = ({ isIpcError, locationName, onRetry }) => (
    <div
        data-testid="data-error-state"
        style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 16,
            padding: '40px 24px',
            textAlign: 'center',
            fontFamily: 'Inter, system-ui, sans-serif',
        }}
    >
        {/* Icon */}
        <div style={{ fontSize: 40, lineHeight: 1 }}>
            {isIpcError ? '🖥️' : '🌊'}
        </div>

        {/* Title */}
        <div style={{
            fontSize: 18,
            fontWeight: 700,
            color: 'var(--mc-text, #e2e8f0)',
            letterSpacing: '0.01em',
        }}>
            {isIpcError ? 'Electron Required' : 'Unable to Load Marine Data'}
        </div>

        {/* Description */}
        <div style={{
            fontSize: 13,
            color: 'var(--mc-text-muted, #94a3b8)',
            maxWidth: 360,
            lineHeight: 1.6,
        }}>
            {isIpcError ? (
                <>
                    Marine data for <strong style={{ color: 'var(--mc-text, #e2e8f0)' }}>{locationName}</strong> requires
                    the Electron app to access CHS tide station data.
                    <br /><br />
                    Launch the desktop app with <code style={{
                        background: 'rgba(255,255,255,0.05)',
                        padding: '2px 6px',
                        borderRadius: 4,
                        fontSize: 11,
                    }}>npx electron .</code> while the dev server is running.
                </>
            ) : (
                <>
                    Could not fetch data for <strong style={{ color: 'var(--mc-text, #e2e8f0)' }}>{locationName}</strong>.
                    <br /><br />
                    This may be a temporary issue with the CHS tide station API. Check your internet connection or try a different location.
                </>
            )}
        </div>

        {/* Sources info */}
        <div style={{
            fontSize: 11,
            color: 'var(--mc-text-dim, #64748b)',
            display: 'flex',
            gap: 16,
            flexWrap: 'wrap',
            justifyContent: 'center',
            marginTop: 4,
        }}>
            <span>📡 CHS (Canadian Hydrographic Service)</span>
            <span>🌐 Open-Meteo Marine</span>
        </div>

        {/* Retry button — only shown when not an IPC-missing error */}
        {!isIpcError && (
            <button
                data-testid="retry-btn"
                onClick={onRetry}
                style={{
                    marginTop: 8,
                    padding: '8px 20px',
                    background: 'transparent',
                    border: '1px solid var(--mc-cyan, #44d8f1)',
                    borderRadius: 8,
                    color: 'var(--mc-cyan, #44d8f1)',
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: 'pointer',
                    fontFamily: 'Inter, system-ui, sans-serif',
                    transition: 'background 150ms',
                }}
                onMouseEnter={e => (e.currentTarget.style.background = 'rgba(68,216,241,0.08)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            >
                Try Again
            </button>
        )}
    </div>
);
