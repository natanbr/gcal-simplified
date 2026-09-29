import { SettingsWriteFailure } from '../../../types';

/** A failure whose reason the main process did not state: claim none. */
export const SETTINGS_NOT_LOADED = 'Settings could not be loaded. Try again in a moment.';
export const SETTINGS_NOT_SAVED = 'Settings not saved. Try again.';

/** A refused save: the reason class and the file — never an empty line, even for a reason
 *  this build does not know. */
export function saveFailureMessage({ reason, code, file }: SettingsWriteFailure): string {
    const detail = code ? ` (${code})` : '';
    switch (reason) {
        case 'locked': return `Settings not saved: ${file} is in use by another program (antivirus or a backup). Try again in a moment.`;
        case 'unreadable': return `Settings not saved: ${file} could not be read${detail}. Try again in a moment.`;
        case 'write-failed': return `Settings not saved: ${file} could not be written${detail}. Check free disk space and permissions, then try again.`;
        default: return SETTINGS_NOT_SAVED;
    }
}

/** ipcRenderer.invoke rejects with "Error invoking remote method '<channel>': Error: <message>".
 *  A refused settings:get words its message for the user (reason class and file); any other
 *  rejection gets the reason-free sentence. */
export function loadFailureMessage(rejection: unknown): string {
    const message = rejection instanceof Error ? rejection.message : '';
    return /^Error invoking remote method '[^']+': (?:Error: )?(Settings could not be loaded: [\s\S]+)$/.exec(message)?.[1] ?? SETTINGS_NOT_LOADED;
}
