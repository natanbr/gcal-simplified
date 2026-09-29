// ============================================================
// The Settings dialog's two channels, settings:get and settings:save.
// ------------------------------------------------------------
// The dialog edits a copy of the stored settings, so both ends must be strict:
// it may only load what is really on disk (never the defaults a lock reads as),
// and it may only write settings fields — the remote pairing belongs to the
// main process, and a copy loaded before a Regenerate Keys would put the old,
// revoked pairing back. See CLAUDE.md → "config.json has one writer".
// ============================================================

import { store, type UserConfig, type WriteResult } from './store';

/** Owned by the main process (remote-bridge.ts): the room and key, and the marker saying the
 *  pairing was made for signed messages. */
type PairingField = 'remoteRoomId' | 'remoteKey' | 'remotePairingVersion';

/** The fields the Settings dialog may write. Typed over every field but the pairing, so a new
 *  UserConfig field is a tsc error here until someone decides which side it belongs to. */
const SETTINGS_FIELDS: Record<Exclude<keyof UserConfig, PairingField>, true> = {
    calendarIds: true, taskListIds: true, activeHoursStart: true, activeHoursEnd: true, themeMode: true,
    manualDayStart: true, manualDayEnd: true, sleepEnabled: true, sleepStart: true, sleepEnd: true, weekStartDay: true,
};

function copyField<K extends keyof UserConfig>(from: UserConfig, to: Partial<UserConfig>, key: K): void {
    if (key in from) to[key] = from[key];
}

/** settings:get. Throws while the file cannot be read, so the dialog never offers the defaults
 *  as the user's settings and then saves them back. The dialog shows the message as it is, so
 *  it follows the same reason classes as a refused save and names the file. */
export function loadSettingsForDialog(): UserConfig {
    const current = store.read();
    if (current.kind === 'unreadable') {
        const { reason, code, file } = current.failure;
        throw new Error(reason === 'locked'
            ? `Settings could not be loaded: ${file} is in use by another program (antivirus or a backup). Try again in a moment.`
            : `Settings could not be loaded: ${file} could not be read${code ? ` (${code})` : ''}. Try again in a moment.`);
    }
    return current.config;
}

/** settings:save. Copies only the settings fields and merges them onto the file; a refused
 *  write is a result the dialog explains, never a throw. */
export function saveSettingsFromDialog(config: UserConfig): WriteResult {
    const settings: Partial<UserConfig> = {};
    if (typeof config === 'object' && config !== null) {
        for (const key of Object.keys(SETTINGS_FIELDS) as (keyof typeof SETTINGS_FIELDS)[]) copyField(config, settings, key);
    }
    return store.update(settings);
}
