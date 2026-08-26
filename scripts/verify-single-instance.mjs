// ============================================================
// Standalone smoke check: the app refuses to run twice.
// ------------------------------------------------------------
// This is the one fix no unit test can truly verify — the lock is enforced by
// Electron and the OS, not by a code path we can call. It is deliberately NOT
// part of the Playwright suite: that suite shares a userData directory and is
// already flaky, and this check needs to control process lifetimes precisely.
//
//   node scripts/verify-single-instance.mjs
//
// Requires a current build:  npx tsc && npx vite build
// Requires NO other copy of the app running — including the real one you use
// daily, which holds the very lock this test is about. The script detects that
// case and tells you, rather than reporting a false failure.
// ============================================================

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import electronPath from 'electron';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const mainJs = path.join(repoRoot, 'dist-electron', 'main.js');

if (!existsSync(mainJs)) {
    console.error('✗ dist-electron/main.js missing. Run: npx tsc && npx vite build');
    process.exit(1);
}

// ELECTRON_ENABLE_LOGGING is required on Windows: Electron is built as a GUI
// subsystem app, so main-process console output does not reach piped stdio
// without it. Without this the script sees "(no output)" and cannot tell a
// refusal from a crash.
const env = { ...process.env, E2E_HEADLESS: '1', ELECTRON_ENABLE_LOGGING: '1' };

const REFUSAL = /Another instance is already running/;
const BOOTED = /RemoteBridge\] Initializing|RemoteBridge\] --- INIT CALLED ---/;

const wait = ms => new Promise(r => setTimeout(r, ms));

function launch() {
    const child = spawn(electronPath, [mainJs], { env, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    child.stdout.on('data', d => { output += d.toString(); });
    child.stderr.on('data', d => { output += d.toString(); });
    return { child, out: () => output };
}

let failures = 0;
function check(name, ok, detail = '') {
    console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`);
    if (!ok) failures++;
}

async function shutdown(...children) {
    for (const c of children) {
        try { c.kill(); } catch { /* already gone */ }
    }
    await wait(1500);
    // SIGTERM is advisory on Windows; make sure nothing is left holding the lock
    // for the next run of this script.
    for (const c of children) {
        if (c.exitCode === null) {
            try { process.kill(c.pid, 'SIGKILL'); } catch { /* already gone */ }
        }
    }
    await wait(500);
}

console.log('Launching first instance...');
const first = launch();
await wait(8000);

// Precondition: if the FIRST instance lost the lock, something else already
// holds it (your everyday app, or an orphan from a previous run). Any result
// after this point would be meaningless.
if (REFUSAL.test(first.out())) {
    console.error('\n⚠  Another copy of the app is already running — it holds the lock.');
    console.error('   Quit it (and any orphaned electron.exe) and re-run this script.');
    await shutdown(first.child);
    process.exit(2);
}

check('first instance acquires the lock and keeps running', first.child.exitCode === null);

console.log('Launching second instance...');
const second = launch();
const secondExit = await Promise.race([
    new Promise(resolve => second.child.on('exit', resolve)),
    wait(15000).then(() => 'TIMEOUT'),
]);

check(
    'second instance exits instead of starting',
    secondExit !== 'TIMEOUT',
    secondExit === 'TIMEOUT' ? 'still running after 15s — the lock is NOT holding' : `exit code ${secondExit}`
);
check('second instance logged the refusal', REFUSAL.test(second.out()));
check(
    'second instance never reached bootstrap (no window, no Supabase channel)',
    !BOOTED.test(second.out())
);
check('first instance survived the second launch', first.child.exitCode === null);

await shutdown(second.child, first.child);

console.log(failures === 0 ? '\nPASS — single-instance lock verified' : `\nFAIL — ${failures} check(s) failed`);
process.exit(failures === 0 ? 0 : 1);
