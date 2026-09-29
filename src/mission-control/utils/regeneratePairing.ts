/** What `remote:regenerate` resolves to. The main process saves the new pairing to the
 *  settings file before answering; `ok: false` means nothing was written, so the keys
 *  the current QR code carries still pair. `file` is the settings file's full path. */
export type RegenerateKeysResult =
    | { ok: true; roomId: string; remoteKey: string }
    | { ok: false; reason: 'locked' | 'unreadable' | 'write-failed'; code?: string; file: string };

export type RegenerateOutcome =
    | { ok: true; roomId: string; remoteKey: string }
    | { ok: false; message: string };

export const REGENERATE_FAILED_MESSAGE =
    'Keys not changed: the settings file is busy or could not be written. The current QR code still works — try again in a moment.';

/** While no v2 pairing is saved there is no QR code and remote control is offline (a read-only
 *  settings file, say): "the current QR code still works" would be false then. */
export const REGENERATE_FAILED_UNPAIRED_MESSAGE =
    'Keys not changed: the new pairing could not be saved, so remote control stays offline until it can. Try again in a moment.';

/** Takes the IPC object, not a bare `invoke`, so a bridged method keeps its receiver. `paired`:
 *  a saved v2 pairing is shown now, so a refusal leaves a QR code that still works. */
export async function regeneratePairing(
    ipc: { invoke(channel: string): Promise<unknown> },
    { paired }: { paired: boolean } = { paired: true },
): Promise<RegenerateOutcome> {
    try {
        const result = await ipc.invoke('remote:regenerate') as RegenerateKeysResult;
        if (result.ok) return { ok: true, roomId: result.roomId, remoteKey: result.remoteKey };
    } catch (e) {
        console.error('remote:regenerate failed', e);
    }
    return { ok: false, message: paired ? REGENERATE_FAILED_MESSAGE : REGENERATE_FAILED_UNPAIRED_MESSAGE };
}
