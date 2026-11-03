// @vitest-environment node
// ============================================================
// The Electron the app runs on knows British Columbia's permanent UTC-07:00.
// ------------------------------------------------------------
// From 2026-11-01 British Columbia stays on UTC-07:00 all year. The app
// hard-codes no offset: every clock and schedule (the MC dashboard clock,
// missions, the quick-game window, the mood gauge) takes the zone from Windows
// and the zone's rules from the ICU time zone data (tzdata) bundled inside
// Electron. Electron 40 bundles tzdata 2025b, which still moves
// America/Vancouver back to UTC-08:00 in November, and its ICU data does not
// know the new Windows zone "British Columbia Standard Time"; on 2026-11-02 the
// MC dashboard showed the family's time an hour behind.
//
// So this suite runs the Electron binary the project installs, as plain Node
// (ELECTRON_RUN_AS_NODE=1), and asks its own ICU. Every format names its zone
// explicitly, never the host default, so the answer does not depend on the
// zone of the machine running the tests. Los Angeles at the same instant is the
// contrast: still UTC-08:00, which proves the check reads BC's rule rather than
// a broken offset.
// ============================================================

import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { electronBinary } from './electronBinaryTestKit';

/** A Thursday after BC's last switch: 18:00 UTC is 11:00 in BC, 10:00 in Los Angeles. */
const INSTANT = '2026-11-05T18:00:00Z';
/** The oldest tzdata this suite accepts for BC's permanent UTC-07:00. */
const MIN_TZDATA = '2026b';
const TZDATA_VERSION = /^\d{4}[a-z]$/;
const BC_WINDOWS_ZONE = 'British Columbia Standard Time';

const BC_RULE =
    'British Columbia stays on UTC-07:00 permanently from 2026-11-01. The app takes the zone ' +
    'rules from the ICU time zone data bundled inside Electron, and this Electron\'s data is stale: ' +
    'with it every clock and schedule in the app (the MC dashboard clock, missions, the quick-game ' +
    'window, the mood gauge) runs an hour behind in BC. Upgrade Electron to one that bundles tzdata ' +
    `${MIN_TZDATA} or newer (Electron 45 bundles 2026e).`;

/** Evaluated by Electron's own Node. Kept to one expression for `-p`. */
const PROBE = [
    "const offset = zone => new Intl.DateTimeFormat('en-US', { timeZone: zone, timeZoneName: 'longOffset' })",
    `.formatToParts(new Date('${INSTANT}')).find(part => part.type === 'timeZoneName').value;`,
    'JSON.stringify({ electron: process.versions.electron, icu: process.versions.icu, tz: process.versions.tz,',
    "vancouver: offset('America/Vancouver'), losAngeles: offset('America/Los_Angeles') })",
].join(' ');

interface Probe {
    electron: string;
    icu: string;
    tz: string;
    vancouver: string;
    losAngeles: string;
}

function runProbe(binary: string): Probe {
    const result = spawnSync(binary, ['-p', PROBE], {
        env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
        encoding: 'utf8',
        timeout: 30_000,
        windowsHide: true,
    });
    if (result.error) throw new Error(`Could not run ${binary}: ${result.error.message}`);
    if (result.status !== 0) {
        throw new Error(`${binary} exited with ${result.status}: ${result.stderr.trim() || result.stdout.trim()}`);
    }
    const parsed: unknown = JSON.parse(result.stdout.trim());
    if (typeof parsed !== 'object' || parsed === null) throw new Error(`Unexpected probe output: ${result.stdout}`);
    const fields = new Map(Object.entries(parsed));
    const field = (name: keyof Probe): string => {
        const value = fields.get(name);
        if (typeof value !== 'string') throw new Error(`Probe field ${name} is not a string: ${result.stdout}`);
        return value;
    };
    return {
        electron: field('electron'), icu: field('icu'), tz: field('tz'),
        vancouver: field('vancouver'), losAngeles: field('losAngeles'),
    };
}

interface Measured {
    binary: string;
    probe: Probe;
}

let measured: Measured | undefined;

/** One Electron run shared by the cases. A missing binary fails every case; none is skipped. */
function measure(): Measured {
    if (!measured) {
        const binary = electronBinary();
        measured = { binary, probe: runProbe(binary) };
    }
    return measured;
}

const bundled = ({ binary, probe }: Measured) =>
    `Electron ${probe.electron} (ICU ${probe.icu}, tzdata ${probe.tz}, ${binary})`;

describe('Electron\'s bundled time zone data knows British Columbia\'s permanent UTC-07:00', { timeout: 60_000 }, () => {
    it('runs the Electron version the project installs (not a leftover binary)', () => {
        const run = measure();
        const installed: unknown = JSON.parse(readFileSync(createRequire(import.meta.url).resolve('electron/package.json'), 'utf8')).version;
        expect(run.probe.electron, `${bundled(run)} is not the installed electron package.`).toBe(installed);
    });

    it(`bundles tzdata ${MIN_TZDATA} or newer`, () => {
        const run = measure();
        const { tz } = run.probe;
        expect(tz, `${bundled(run)} reports a tzdata version this suite cannot compare.`).toMatch(TZDATA_VERSION);
        // Same shape on both sides (four digits, one letter), so string order is release order.
        expect(tz >= MIN_TZDATA, `${bundled(run)}: tzdata ${tz} is older than ${MIN_TZDATA}. ${BC_RULE}`).toBe(true);
    });

    it(`puts America/Vancouver on GMT-07:00 at ${INSTANT}`, () => {
        const run = measure();
        const { vancouver } = run.probe;
        expect(vancouver, `${bundled(run)} formats America/Vancouver as ${vancouver}. ${BC_RULE}`).toBe('GMT-07:00');
    });

    it('keeps America/Los_Angeles on GMT-08:00 at the same instant (the contrast)', () => {
        const run = measure();
        expect(
            run.probe.losAngeles,
            `${bundled(run)} formats America/Los_Angeles as ${run.probe.losAngeles}; California still falls back ` +
            'in November, so the Vancouver check above is not reading BC\'s rule.',
        ).toBe('GMT-08:00');
    });

    // Windows names zones its own way; ICU maps that name to an IANA zone through
    // its windowsZones table. With the Windows zone the owner must select,
    // "(UTC-07:00) Pacific Time (British Columbia)", an ICU that lacks the
    // mapping cannot find BC at all. The name only exists on Windows, and the
    // ICU data file sits beside the binary there.
    it.runIf(process.platform === 'win32')(`maps the Windows zone "${BC_WINDOWS_ZONE}" in its ICU data`, () => {
        const run = measure();
        const icuData = join(dirname(run.binary), 'icudtl.dat');
        expect(existsSync(icuData), `${icuData} is missing beside the Electron binary.`).toBe(true);
        expect(
            readFileSync(icuData).includes(BC_WINDOWS_ZONE, 0, 'latin1'),
            `${bundled(run)}: ${icuData} does not name the Windows zone "${BC_WINDOWS_ZONE}", so a PC set to ` +
            `"(UTC-07:00) Pacific Time (British Columbia)" is not recognised. ${BC_RULE}`,
        ).toBe(true);
    });
});
