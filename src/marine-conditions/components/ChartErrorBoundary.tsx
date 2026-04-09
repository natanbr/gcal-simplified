import React from 'react';

interface State { hasError: boolean; message?: string }
interface Props { children: React.ReactNode }

/**
 * A9: ErrorBoundary for TideCurrentChart.
 * Prevents a Recharts crash (bad data, parseSafe failure, etc.) from
 * bubbling up and killing the entire Marine Conditions dashboard.
 */
export class ChartErrorBoundary extends React.Component<Props, State> {
    constructor(props: Props) {
        super(props);
        this.state = { hasError: false };
    }

    static getDerivedStateFromError(error: Error): State {
        return { hasError: true, message: error.message };
    }

    override render(): React.ReactNode {
        if (this.state.hasError) {
            return (
                <div
                    style={{
                        height: '100%',
                        minHeight: 120,
                        background: 'rgba(255,255,255,0.03)',
                        borderRadius: 10,
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 8,
                        color: 'var(--mc-text-dim)',
                        fontSize: 12,
                        padding: 24,
                    }}
                >
                    <span style={{ fontSize: 22 }}>📉</span>
                    <span style={{ color: 'var(--mc-caution)', fontWeight: 600 }}>
                        Chart failed to render
                    </span>
                    <span style={{ fontSize: 11, textAlign: 'center', maxWidth: 260 }}>
                        An unexpected error occurred while drawing the chart.
                        Tide and current data is still available in the event list.
                    </span>
                </div>
            );
        }
        return this.props.children;
    }
}
