// ============================================================
// Mission Control — the Remote tab's pairing panel: header, re-pairing notice,
// QR code and "Regenerate Keys".
// ------------------------------------------------------------
// Reads settings:get once when the tab is shown and draws the QR code from THAT
// read only, never from Mission Control's state: that is loaded from
// localStorage and may still hold a pairing the main process has replaced (the
// leaked v1 key, in a room nobody joins). settings:get hands out a room and key
// only for a pairing marked for protocol v2 (electron/settings-dialog.ts), and
// readPairing checks the marker again. With none there is no QR code, and the
// panel says it is waiting to save a new pairing. The notice shows while an
// automatic renewal is unanswered (store/pairingRenewal.ts). No timer, no
// animation: the Remote tab is not always mounted.
// ============================================================

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { QRCodeCanvas } from 'qrcode.react';
import { pendingRenewalAt } from '../store/pairingRenewal';
import { buildPairingUrl, readPairing, type RemotePairing } from '../utils/pairingUrl';
import { regeneratePairing } from '../utils/regeneratePairing';

export const REPAIRED_NOTICE = 'Remote was re-paired for security. Scan this QR code again on the phone.';
export const NOT_PAIRED_TEXT = 'Remote is not paired yet — waiting to save a new pairing.';

interface PairingRead { pairing: RemotePairing | null; renewalPending: boolean }

/** No bridge, a refused read, or no v2 pairing in it: nothing to draw. */
const NOTHING: PairingRead = { pairing: null, renewalPending: false };

export function RemotePairingPanel() {
    // 'loading' until settings:get answers; an empty box meanwhile, so nothing flashes.
    const [read, setRead] = useState<PairingRead | 'loading'>(() => (window.ipcRenderer ? 'loading' : NOTHING));
    const [regenerateError, setRegenerateError] = useState<string | null>(null);

    useEffect(() => {
        const ipc = window.ipcRenderer;
        if (!ipc) return;
        let live = true;
        ipc.invoke('settings:get')
            .then(config => { if (live) setRead({ pairing: readPairing(config), renewalPending: pendingRenewalAt(config) !== null }); })
            .catch(() => { if (live) setRead(NOTHING); });
        return () => { live = false; };
    }, []);

    const shown = read === 'loading' ? NOTHING : read;
    const url = shown.pairing ? buildPairingUrl(shown.pairing.roomId, shown.pairing.remoteKey) : null;

    const regenerate = async () => {
        if (!window.ipcRenderer) return;
        setRegenerateError(null);
        const outcome = await regeneratePairing(window.ipcRenderer, { paired: shown.pairing !== null });
        if (!outcome.ok) { setRegenerateError(outcome.message); return; }
        setRead({ pairing: { roomId: outcome.roomId, remoteKey: outcome.remoteKey }, renewalPending: shown.renewalPending });
    };

    return (
        <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, borderBottom: '1px solid var(--mc-border)', paddingBottom: 8 }}>
                <span style={{ fontSize: 18 }}>📱</span>
                <span style={{ fontSize: 13, fontWeight: 900, color: 'var(--mc-text)' }}>Remote Control Pairing</span>
            </div>
            {/* "Scan this QR code again" only above a QR code. */}
            {url && shown.renewalPending && (
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
            <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start' }}>
                <div style={{
                    background: 'var(--mc-surface)',
                    padding: 16,
                    borderRadius: 16,
                    boxShadow: '0 8px 24px rgba(130,110,200,0.15)',
                    border: '1.5px solid rgba(130,110,200,0.1)'
                }}>
                    {url ? (
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
                            <QRCodeCanvas value={url} size={180} level="H" includeMargin={false} />
                            <input className="mc-field"
                                type="text"
                                readOnly
                                value={url}
                                onClick={(e) => {
                                    (e.target as HTMLInputElement).select();
                                    navigator.clipboard.writeText((e.target as HTMLInputElement).value);
                                }}
                                style={{
                                    width: '100%',
                                    fontSize: 10,
                                    padding: '6px 8px',
                                    borderRadius: 6,
                                    border: '1px solid rgba(130,110,200,0.3)',
                                    background: 'rgba(130,110,200,0.05)',
                                    color: 'var(--mc-text-muted)',
                                    fontFamily: 'monospace',
                                    cursor: 'copy',
                                    textAlign: 'center'
                                }}
                                title="Click to copy URL"
                            />
                        </div>
                    ) : (
                        <div style={{ width: 180, height: 180, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--mc-text-muted)', fontSize: 12, textAlign: 'center' }}>
                            {read === 'loading' ? null : NOT_PAIRED_TEXT}
                        </div>
                    )}
                </div>

                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <p style={{ fontSize: 14, lineHeight: 1.5, color: 'var(--mc-text)', fontWeight: 600 }}>
                        Scan this code with your phone's camera to open the remote control.
                    </p>
                    <ul style={{ fontSize: 12, color: 'var(--mc-text-muted)', paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 6 }}>
                        <li>Control tokens and missions from anywhere.</li>
                        <li>Trigger special animations (Fireworks!).</li>
                        <li>Secure pairing (keys are stored only on this device).</li>
                    </ul>

                    <div style={{ marginTop: 4, fontSize: 10, color: 'var(--mc-text-muted)', opacity: 0.7 }}>
                        Target: <span style={{ fontFamily: 'monospace' }}>mc-remote.vercel.app</span>
                    </div>

                    <motion.button
                        whileTap={{ scale: 0.95 }}
                        onClick={regenerate}
                        style={{
                            marginTop: 8,
                            background: 'color-mix(in srgb, var(--mc-red) 10%, transparent)',
                            border: '1.5px solid color-mix(in srgb, var(--mc-red) 20%, transparent)',
                            borderRadius: 10,
                            padding: '8px 16px',
                            fontSize: 12,
                            fontWeight: 800,
                            color: 'var(--mc-shield-danger-text)',
                            cursor: 'pointer',
                            width: 'fit-content'
                        }}
                    >
                        🔄 Regenerate Keys
                    </motion.button>
                    {regenerateError && <p role="alert" style={{ margin: 0, fontSize: 12, fontWeight: 700, lineHeight: 1.4, color: 'var(--mc-shield-danger-text)' }}>{regenerateError}</p>}
                </div>
            </div>
        </>
    );
}
