// ============================================================
// Mission Control — the Remote tab's header, and the re-pairing notice.
// ------------------------------------------------------------
// Reads settings:get once when the tab is shown. While an automatic pairing
// renewal is unanswered (store/pairingRenewal.ts), it tells the parent to scan
// the QR code again; the main process clears the field when the phone's first
// verified message arrives. No timer, no animation: the Remote tab is not
// always mounted, and the notice is static text.
// ============================================================

import { useEffect, useState } from 'react';
import { pendingRenewalAt } from '../store/pairingRenewal';

export const REPAIRED_NOTICE = 'Remote was re-paired for security. Scan this QR code again on the phone.';

export function RemotePairingHeader() {
    const [renewalPending, setRenewalPending] = useState(false);

    useEffect(() => {
        const ipc = window.ipcRenderer;
        if (!ipc) return;
        let live = true;
        ipc.invoke('settings:get')
            .then(config => { if (live) setRenewalPending(pendingRenewalAt(config) !== null); })
            .catch(() => undefined);
        return () => { live = false; };
    }, []);

    return (
        <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, borderBottom: '1px solid var(--mc-border)', paddingBottom: 8 }}>
                <span style={{ fontSize: 18 }}>📱</span>
                <span style={{ fontSize: 13, fontWeight: 900, color: 'var(--mc-text)' }}>Remote Control Pairing</span>
            </div>
            {renewalPending && (
                <div
                    role="status"
                    style={{
                        display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 12,
                        background: 'color-mix(in srgb, var(--mc-amber) 18%, transparent)',
                        border: '1.5px solid var(--mc-amber)',
                        color: 'var(--mc-text)', fontSize: 13, fontWeight: 800,
                    }}
                >
                    <span aria-hidden="true" style={{ fontSize: 18 }}>🔒</span>
                    <span>{REPAIRED_NOTICE}</span>
                </div>
            )}
        </>
    );
}
