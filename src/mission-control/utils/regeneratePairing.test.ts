import { describe, it, expect, vi, onTestFinished } from 'vitest';
import { regeneratePairing, REGENERATE_FAILED_MESSAGE, REGENERATE_FAILED_UNPAIRED_MESSAGE } from './regeneratePairing';

const ipcAnswering = (answer: () => Promise<unknown>) => ({ invoke: vi.fn(answer) });

describe('regeneratePairing', () => {
    it('hands back the new keys when the main process saved them', async () => {
        const ipc = ipcAnswering(() => Promise.resolve({ ok: true, roomId: 'room-new', remoteKey: 'key-new' }));

        await expect(regeneratePairing(ipc)).resolves.toEqual({ ok: true, roomId: 'room-new', remoteKey: 'key-new' });
        expect(ipc.invoke).toHaveBeenCalledWith('remote:regenerate');
    });

    // The main process writes the new pairing to the settings file first. When it
    // could not, it returns ok:false and nothing changed: the old QR still pairs.
    it.each(['locked', 'unreadable', 'write-failed'])('says the keys did not change when the save was refused (%s)', async reason => {
        const ipc = ipcAnswering(() => Promise.resolve({ ok: false, reason, code: 'EBUSY', file: 'C:\\settings-file.json' }));

        await expect(regeneratePairing(ipc)).resolves.toEqual({ ok: false, message: REGENERATE_FAILED_MESSAGE });
    });

    it('says the same when the call itself fails', async () => {
        const quiet = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        onTestFinished(() => quiet.mockRestore());
        const ipc = ipcAnswering(() => Promise.reject(new Error('IPC failed')));

        await expect(regeneratePairing(ipc)).resolves.toEqual({ ok: false, message: REGENERATE_FAILED_MESSAGE });
    });

    it('tells the parent the current QR code still works', () => {
        expect(REGENERATE_FAILED_MESSAGE).toBe(
            'Keys not changed: the settings file is busy or could not be written. The current QR code still works — try again in a moment.',
        );
    });
});

describe('regeneratePairing — with no saved v2 pairing (nothing drawn as a QR code)', () => {
    // A read-only settings file: the automatic renewal can never be saved, so the Remote tab shows
    // no QR code and remote control is offline. "The current QR code still works" would be false.
    it('says the new pairing could not be saved and remote control stays offline until it can', async () => {
        const ipc = ipcAnswering(() => Promise.resolve({ ok: false, reason: 'write-failed', code: 'EROFS', file: 'C:\\settings-file.json' }));

        await expect(regeneratePairing(ipc, { paired: false })).resolves.toEqual({ ok: false, message: REGENERATE_FAILED_UNPAIRED_MESSAGE });
        expect(REGENERATE_FAILED_UNPAIRED_MESSAGE).toBe(
            'Keys not changed: the new pairing could not be saved, so remote control stays offline until it can. Try again in a moment.',
        );
    });

    it('keeps the "current QR code still works" message while a v2 pairing is shown', async () => {
        const ipc = ipcAnswering(() => Promise.resolve({ ok: false, reason: 'locked', code: 'EBUSY', file: 'C:\\settings-file.json' }));

        await expect(regeneratePairing(ipc, { paired: true })).resolves.toEqual({ ok: false, message: REGENERATE_FAILED_MESSAGE });
    });

    it('hands back the new keys the same way when the save worked', async () => {
        const ipc = ipcAnswering(() => Promise.resolve({ ok: true, roomId: 'room-new', remoteKey: 'key-new' }));

        await expect(regeneratePairing(ipc, { paired: false })).resolves.toEqual({ ok: true, roomId: 'room-new', remoteKey: 'key-new' });
    });
});
