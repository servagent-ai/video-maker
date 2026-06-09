#!/usr/bin/env node
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const ignoredDirs = new Set(['.git', 'node_modules', 'outputs', 'coverage', 'dist']);
const ignoredFiles = new Set(['package-lock.json']);

const patterns = [
  ['openai-key', /sk-[A-Za-z0-9_-]{20,}/],
  ['openai-env', new RegExp('OPENAI' + '_API_KEY')],
  ['anthropic-env', new RegExp('ANTHROPIC' + '_API_KEY')],
  ['google-env', new RegExp('GOOGLE' + '_API_KEY')],
  ['github-token-env', new RegExp('(GITHUB|GH)' + '_TOKEN')],
  ['access-token-env', new RegExp('ACCESS' + '_TOKEN')],
  ['private-key', new RegExp('BEGIN ' + '(RSA|OPENSSH|EC|DSA|PRIVATE)' + ' KEY')],
  ['bearer-token', new RegExp('Authorization:\\s*Bearer\\s+[A-Za-z0-9._-]{12,}')],
  ['x-api-key', new RegExp('x-api-key\\s*[:=]\\s*[A-Za-z0-9._-]{12,}', 'i')],
  ['assigned-api-key', new RegExp('api[_-]?key\\s*[:=]\\s*[A-Za-z0-9._-]{12,}', 'i')],
];

const hits = [];
for (const file of walk(root)) {
  const text = readFileSync(file, 'utf8');
  const lines = text.split(/\r?\n/);
  lines.forEach((line, i) => {
    for (const [name, pattern] of patterns) {
      if (pattern.test(line)) hits.push(`${file}:${i + 1}: ${name}`);
    }
  });
}

if (hits.length) {
  for (const hit of hits) console.error(hit);
  process.exit(1);
}

console.log('ok: no secret-shaped values found');

function walk(dir, out = []) {
  for (const ent of readdirSync(dir, { withFileTypes: true })) {
    if (ent.isDirectory() && ignoredDirs.has(ent.name)) continue;
    const p = join(dir, ent.name);
    if (ent.isDirectory()) walk(p, out);
    else if (ent.isFile() && shouldRead(p)) out.push(p);
  }
  return out;
}

function shouldRead(path) {
  if (ignoredFiles.has(path.split('/').pop())) return false;
  const st = statSync(path);
  if (st.size > 1024 * 1024) return false;
  try {
    const chunk = readFileSync(path, { encoding: 'utf8' });
    return !chunk.includes('\u0000');
  } catch {
    return false;
  }
}
