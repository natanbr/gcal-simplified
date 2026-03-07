#!/usr/bin/env node
/**
 * apply-patches.js
 *
 * Applies manual patches to node_modules that fix known compatibility issues.
 * Run this after `npm install` via the `postinstall` npm script.
 *
 * Current patches:
 *   playwright-core 1.58.1 — Electron 36+ compatibility
 *     Problem: Playwright passes --remote-debugging-port=0 as a CLI flag which
 *              Electron 36+ rejects as "bad option", AND propagates
 *              ELECTRON_RUN_AS_NODE=1 from the test runner which prevents the
 *              Electron browser API (app, BrowserWindow, etc.) from initialising.
 *     Fix 1:  Remove --remote-debugging-port=0 from CLI args in electron.js;
 *             delete env.ELECTRON_RUN_AS_NODE before launching the process.
 *     Fix 2:  In loader.js, use app.commandLine.appendSwitch('remote-debugging-port', '0')
 *             instead of the rejected CLI flag, and anchor argv.splice on --inspect=0.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

let patchCount = 0;

function patch(relPath, search, replace, description) {
  const filePath = join(root, relPath);
  let content;
  try {
    content = readFileSync(filePath, 'utf8');
  } catch {
    console.warn(`  ⚠  Skipping (file not found): ${relPath}`);
    return;
  }

  if (content.includes(replace)) {
    console.log(`  ✓  Already patched: ${description}`);
    return;
  }

  if (!content.includes(search)) {
    console.warn(`  ⚠  Cannot apply (search string not found): ${description}`);
    return;
  }

  writeFileSync(filePath, content.replace(search, replace), 'utf8');
  console.log(`  ✔  Applied: ${description}`);
  patchCount++;
}

console.log('\n🔧 Applying node_modules patches...\n');

// ── Patch 1: electron.js — remove --remote-debugging-port=0 CLI flag ──────────
patch(
  'node_modules/playwright-core/lib/server/electron/electron.js',
  `let electronArguments = ["--inspect=0", "--remote-debugging-port=0", ...options.args || []];`,
  `let electronArguments = ["--inspect=0", ...options.args || []];`,
  'playwright-core: remove --remote-debugging-port=0 CLI flag (rejected by Electron 36+)'
);

// ── Patch 2: electron.js — delete ELECTRON_RUN_AS_NODE from env ───────────────
patch(
  'node_modules/playwright-core/lib/server/electron/electron.js',
  `    delete env.NODE_OPTIONS;\n    const { launchedProcess`,
  `    delete env.NODE_OPTIONS;\n    delete env.ELECTRON_RUN_AS_NODE;\n    const { launchedProcess`,
  'playwright-core: delete env.ELECTRON_RUN_AS_NODE before Electron launch'
);

// ── Patch 3: loader.js — fix remote-debugging-port + argv.splice ──────────────
patch(
  'node_modules/playwright-core/lib/server/electron/loader.js',
  `process.argv.splice(1, process.argv.indexOf("--remote-debugging-port=0"));
for (const arg of chromiumSwitches()) {
  const match = arg.match(/--([^=]*)=?(.*)/);
  app.commandLine.appendSwitch(match[1], match[2]);
}`,
  `// [Electron, -r, loader.js[, --no-sandbox], --inspect=0, ...args]
process.argv.splice(1, process.argv.indexOf("--inspect=0"));
app.commandLine.appendSwitch("remote-debugging-port", "0");
for (const arg of chromiumSwitches()) {
  const match = arg.match(/--([^=]*)=?(.*)/);
  if (match) app.commandLine.appendSwitch(match[1], match[2]);
}`,
  'playwright-core: use app.commandLine for remote-debugging-port in loader.js'
);

console.log(`\n${patchCount > 0 ? `✅ ${patchCount} patch(es) applied.` : '✅ All patches were already in place.'}\n`);
