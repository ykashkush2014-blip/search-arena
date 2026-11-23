#!/usr/bin/env node
/**
 * check-lines.js — verifies the "30,000 effective lines" budget for Sands of Aether.
 *
 * Counts lines of real source that the game ships or executes:
 *   - every .js file under src/, tools/, tests/ (runtime + pipeline + tests)
 *   - index.html and css/*.css
 * Generated content under src/data/generated/ counts too: those are ES modules
 * baked by tools/gen-content.js and loaded by the game at runtime.
 *
 * Usage: node tools/check-lines.js [--min 30000] [--json]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const GAME_ROOT = path.resolve(__dirname, '..');

function parseArgs(argv) {
  const args = { min: 30000, json: false };
  for (let i = 2; i < argv.length; i += 1) {
    if (argv[i] === '--min' && argv[i + 1]) {
      args.min = Number(argv[i + 1]);
      i += 1;
    } else if (argv[i] === '--json') {
      args.json = true;
    }
  }
  return args;
}

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '.git') continue;
      walk(full, out);
    } else if (entry.isFile()) {
      out.push(full);
    }
  }
  return out;
}

function countFile(file) {
  const text = fs.readFileSync(file, 'utf8');
  const lines = text.split('\n');
  let total = 0;
  let code = 0;
  let blank = 0;
  let comment = 0;
  let inBlock = false;
  for (const line of lines) {
    total += 1;
    const trimmed = line.trim();
    if (inBlock) {
      comment += 1;
      if (trimmed.includes('*/')) inBlock = false;
      continue;
    }
    if (trimmed === '') {
      blank += 1;
      continue;
    }
    if (trimmed.startsWith('/*')) {
      comment += 1;
      if (!trimmed.includes('*/')) inBlock = true;
      continue;
    }
    if (trimmed.startsWith('//') || trimmed.startsWith('#!')) {
      comment += 1;
      continue;
    }
    code += 1;
  }
  return { total, code, blank, comment };
}

function extOf(file) {
  return path.extname(file).toLowerCase();
}

function rel(file) {
  return path.relative(GAME_ROOT, file).split(path.sep).join('/');
}

function main() {
  const args = parseArgs(process.argv);
  const files = walk(GAME_ROOT).filter((f) => ['.js', '.html', '.css'].includes(extOf(f)));

  const byGroup = new Map();
  const byExt = new Map();
  let grand = { total: 0, code: 0, blank: 0, comment: 0 };

  for (const file of files) {
    const counts = countFile(file);
    const r = rel(file);
    const top = r.split('/')[0];
    const group = r.startsWith('src/data/generated') ? 'src/data/generated' : top;
    const g = byGroup.get(group) || { total: 0, code: 0, files: 0 };
    g.total += counts.total;
    g.code += counts.code;
    g.files += 1;
    byGroup.set(group, g);
    const e = extOf(file);
    const x = byExt.get(e) || { total: 0, code: 0, files: 0 };
    x.total += counts.total;
    x.code += counts.code;
    x.files += 1;
    byExt.set(e, x);
    grand.total += counts.total;
    grand.code += counts.code;
    grand.blank += counts.blank;
    grand.comment += counts.comment;
  }

  const report = {
    files: files.length,
    totalLines: grand.total,
    codeLines: grand.code,
    blankLines: grand.blank,
    commentLines: grand.comment,
    required: args.min,
    pass: grand.total >= args.min && grand.code >= Math.floor(args.min * 0.8),
    byGroup: Object.fromEntries([...byGroup.entries()].sort((a, b) => b[1].total - a[1].total)),
    byExt: Object.fromEntries(byExt),
  };

  if (args.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log('=== Sands of Aether — line budget report ===');
    console.log(`files          : ${report.files}`);
    console.log(`total lines    : ${report.totalLines}`);
    console.log(`code lines     : ${report.codeLines}`);
    console.log(`blank lines    : ${report.blankLines}`);
    console.log(`comment lines  : ${report.commentLines}`);
    console.log(`requirement    : >= ${args.min} total lines (and >= ${Math.floor(args.min * 0.8)} code lines)`);
    console.log('--- by group ---');
    for (const [group, g] of Object.entries(report.byGroup)) {
      console.log(`${group.padEnd(24)} ${String(g.total).padStart(7)} lines  (${g.files} files, ${g.code} code)`);
    }
    console.log('--- by extension ---');
    for (const [ext, g] of Object.entries(report.byExt)) {
      console.log(`${ext.padEnd(24)} ${String(g.total).padStart(7)} lines  (${g.files} files, ${g.code} code)`);
    }
    console.log(report.pass ? 'PASS ✅ — 30K line budget met.' : 'FAIL ❌ — line budget NOT met.');
  }
  process.exit(report.pass ? 0 : 1);
}

main();
