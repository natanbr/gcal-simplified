// Child process for src/__tests__/type-laundering-guard.test.ts — read that file first.
// argv: [eslint entry, repo root, marker]; probes, reference, rules and protected
// roots arrive as JSON on stdin; the report is printed after the marker.
// Plain CommonJS because eslint@8 ships no type declarations.
'use strict';
const { loadESLint } = require(process.argv[2]);
const fs = require('fs');
const path = require('path');
const [root, marker] = [process.argv[3], process.argv[4]];
const SOURCE = /\.tsx?$/;
const OTHER_TS = /\.[cm]tsx?$/;
// Comments come from the parser ESLint uses, so a `/*` inside a string cannot
// fake one; directives are read as ESLint 8.57 reads them (lib/shared/directives.js,
// and the ` -- reason` split in lib/linter/config-comment-parser.js).
const estree = require(require.resolve('@typescript-eslint/typescript-estree',
    { paths: [path.dirname(require.resolve('@typescript-eslint/parser', { paths: [root] }))] }));
const DIRECTIVE = /^(eslint(?:-env|-enable|-disable(?:(?:-next)?-line)?)?|exported|globals?)(?:\s|$)/;
let input = '';
process.stdin.on('data', chunk => { input += chunk; });
process.stdin.on('end', async () => {
    try {
        const { probes, reference, rules, protectedRoots, skippable } = JSON.parse(input);
        const ESLint = await loadESLint({ cwd: root });
        const eslint = new ESLint({ cwd: root });
        const lint = {};
        for (const { file, code } of probes) {
            const [result] = await eslint.lintText(code, { filePath: path.join(root, file) });
            lint[file] = result ? result.messages.map(m => ({ ruleId: m.ruleId, line: m.line, fatal: m.fatal === true })) : null;
        }
        const parserOf = c => c.parser || (c.languageOptions && c.languageOptions.parser
            && ((c.languageOptions.parser.meta && c.languageOptions.parser.meta.name) || 'unnamed parser')) || null;
        const signature = async file => {
            const config = (await eslint.calculateConfigForFile(file)) || {};
            return JSON.stringify([parserOf(config), ...rules.map(rule => (config.rules && config.rules[rule]) || null)]);
        };
        const expected = await signature(path.join(root, reference));
        const dirIgnored = dir => eslint.isPathIgnored(path.join(dir, '__sweep__.ts'));
        const relOf = full => path.relative(root, full).split(path.sep).join('/');
        const files = [];
        const pruned = [];
        const hidden = [];
        const unlinted = [];
        // A folder that vanishes mid-walk, cannot be read, or loops is treated as empty:
        // ESLint cannot lint it either, and a crash here would fail a healthy tree.
        const entriesOf = dir => { try { return fs.readdirSync(dir, { withFileTypes: true }); } catch { return []; } };
        const realOf = dir => { try { return fs.realpathSync(dir); } catch { return null; } };
        // ESLint follows links into folders and skips dangling ones; so does everything here.
        const targetOf = (entry, full) => {
            if (!entry.isSymbolicLink()) return entry;
            try { return fs.statSync(full, { throwIfNoEntry: false }) || null; } catch { return null; }
        };
        // Cycles are cut on the current chain only: a link from one source folder
        // into another is still walked, since ESLint lints it under the link's path.
        const enter = (dir, chain) => {
            const real = realOf(dir);
            return real && !chain.has(real) ? new Set(chain).add(real) : null;
        };
        // A folder ESLint skips only matters if TypeScript lives in it: coverage/.tmp,
        // .vscode or Playwright's artifacts must not fail the build.
        const holdsTs = (dir, chain) => {
            const inner = enter(dir, chain);
            return Boolean(inner) && entriesOf(dir).some(entry => {
                if (entry.name === 'node_modules') return false;
                const full = path.join(dir, entry.name);
                const target = targetOf(entry, full);
                if (!target) return false;
                return target.isDirectory() ? holdsTs(full, inner) : SOURCE.test(entry.name) || OTHER_TS.test(entry.name);
            });
        };
        const skipped = (full, rel) => { if (!skippable.includes(rel) && holdsTs(full, new Set())) pruned.push(rel); };
        const walk = async (dir, pruneIgnored, chain) => {
            const inner = enter(dir, chain);
            if (!inner) return;
            for (const entry of entriesOf(dir)) {
                const full = path.join(dir, entry.name);
                const rel = relOf(full);
                if (rel === 'node_modules') continue;
                const target = targetOf(entry, full);
                if (!target) continue;
                const isDir = target.isDirectory();
                if (entry.name.startsWith('.')) {
                    if (isDir && pruneIgnored) skipped(full, rel);
                    else if (isDir || SOURCE.test(entry.name) || OTHER_TS.test(entry.name)) hidden.push(rel);
                    continue;
                }
                if (isDir) {
                    const prune = pruneIgnored && !protectedRoots.includes(rel);
                    if (prune && await dirIgnored(full)) { skipped(full, rel); continue; }
                    await walk(full, prune, inner);
                } else if (SOURCE.test(entry.name)) files.push(full);
                else if (OTHER_TS.test(entry.name)) unlinted.push(rel);
            }
        };
        await walk(root, true, new Set());
        const ignored = [];
        const drifted = [];
        const inline = [];
        for (const file of files) {
            const rel = relOf(file);
            if (await eslint.isPathIgnored(file)) { ignored.push(rel); continue; }
            if ((await signature(file)) !== expected) drifted.push(rel);
            const { comments } = estree.parse(fs.readFileSync(file, 'utf8'), { comment: true, jsx: file.endsWith('.tsx') });
            for (const comment of comments.filter(c => c.type === 'Block')) {
                const value = comment.value.split(/\s-{2,}\s/)[0].trim();
                const directive = DIRECTIVE.exec(value);
                if (!directive) continue;
                const named = value.slice(directive[1].length).split(',')
                    .map(s => s.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean);
                if (directive[1] === 'eslint') inline.push(rel + ': inline rule config');
                else if (directive[1] === 'eslint-disable' && (named.length === 0 || named.some(r => rules.includes(r))))
                    inline.push(rel + ': block eslint-disable');
            }
        }
        process.stdout.write(marker + JSON.stringify({ lint, swept: files.length, ignored, drifted, inline, pruned, hidden, unlinted }));
    } catch (error) {
        process.stderr.write(String((error && error.stack) || error));
        process.exit(2);
    }
});
