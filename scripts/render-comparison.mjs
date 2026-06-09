#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

function arg(name, def = undefined) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : def;
}

const specPath = arg('spec');
const profilePath = arg('profile');
const engines = String(arg('engines', 'remotion,hyperframes')).split(',').map((s) => s.trim()).filter(Boolean);
const outDir = arg('out');
if (!specPath || !profilePath || !outDir) {
  console.error('usage: node scripts/render-comparison.mjs --spec <spec.json> --profile <profile.json> --engines remotion,hyperframes --out <dir>');
  process.exit(2);
}

const out = resolve(outDir);
mkdirSync(out, { recursive: true });
const results = [];
for (const engine of engines) {
  const dir = join(out, engine);
  const script = engine === 'hyperframes' ? 'scripts/render-hyperframes.mjs' : engine === 'remotion' ? 'scripts/render-remotion.mjs' : 'scripts/render-engine.mjs';
  const args = script === 'scripts/render-engine.mjs'
    ? [script, '--engine', engine, '--spec', specPath, '--profile', profilePath, '--out', dir]
    : [script, '--spec', specPath, '--profile', profilePath, '--out', dir];
  const r = spawnSync('node', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  results.push({ engine, dir, status: r.status === 0 ? 'rendered' : 'failed', stdout: r.stdout, stderr: r.stderr });
}
writeFileSync(join(out, 'comparison_brief.json'), JSON.stringify({ kind: 'video-engine-comparison', version: 1, spec: resolve(specPath), profile: resolve(profilePath), results }, null, 2));
writeFileSync(join(out, 'review.html'), buildHtml(results));
console.log(`wrote ${out}`);
if (results.some((r) => r.status === 'failed')) process.exit(1);

function buildHtml(results) {
  const cells = results.map((r) => `
    <section>
      <h2>${esc(r.engine)} (${esc(r.status)})</h2>
      ${existsSync(join(r.dir, 'video.mp4')) ? `<video controls playsinline src="${esc(`${r.engine}/video.mp4`)}"></video>` : `<pre>${esc(r.stderr || r.stdout)}</pre>`}
      <p><a href="${esc(`${r.engine}/quality-report.json`)}">quality-report.json</a></p>
    </section>`).join('\n');
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Video Engine Comparison</title><style>body{margin:0;background:#101218;color:#f4f7fb;font:14px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:16px;padding:16px}video{width:100%;max-height:78vh;background:#000;border:1px solid #303744;border-radius:6px}pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#05070a;padding:12px;border-radius:6px}a{color:#7fd0ff}</style></head><body><main class="grid">${cells}</main></body></html>`;
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
