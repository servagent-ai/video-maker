#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

function arg(name, def = undefined) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : def;
}

const project = arg('project');
const outDir = arg('out');
if (!project || !outDir) {
  console.error('usage: node scripts/review-side-hustle-episode.mjs --project <novel-video-dir> --out <dir>');
  process.exit(2);
}

const out = resolve(outDir);
mkdirSync(out, { recursive: true });
const specPath = join(out, 'video-maker.spec.json');
run('node', ['scripts/import-novel-video.mjs', '--project', project, '--out', specPath], false);
const renderStatus = run('node', ['scripts/render-levify-tales.mjs', '--spec', specPath, '--out', out], true);
const handoffPath = join(out, 'handoff.json');
run('node', ['scripts/handoff-side-hustle.mjs', '--render-dir', out, '--out', handoffPath], true);
writeFileSync(join(out, 'review.html'), buildHtml({ specPath, handoffPath, renderStatus }));
console.log(`wrote ${join(out, 'review.html')}`);

function run(cmd, args, allowFail) {
  const r = spawnSync(cmd, args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (r.status !== 0 && !allowFail) throw new Error(`${cmd} ${args.join(' ')} failed: ${r.stderr || r.stdout}`);
  return { status: r.status, stdout: r.stdout, stderr: r.stderr };
}

function buildHtml({ specPath, handoffPath, renderStatus }) {
  const spec = JSON.parse(readFileSync(specPath, 'utf8'));
  const reportPath = join(out, 'quality-report.json');
  const report = existsSync(reportPath) ? JSON.parse(readFileSync(reportPath, 'utf8')) : null;
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(spec.title ?? spec.id)}</title>
  <style>
    body { margin: 0; background: #101218; color: #f4f7fb; font: 14px/1.45 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    main { display: grid; grid-template-columns: 360px 1fr; gap: 18px; min-height: 100vh; }
    aside { padding: 18px; background: #181c24; border-right: 1px solid #303744; }
    h1 { font-size: 20px; margin: 0 0 10px; }
    a { color: #7fd0ff; }
    .stage { padding: 18px; display: grid; justify-items: center; gap: 12px; }
    video { width: min(420px, 100%); background: #000; border: 1px solid #303744; border-radius: 6px; }
    pre { white-space: pre-wrap; overflow-wrap: anywhere; background: #0b0d11; padding: 12px; border-radius: 6px; }
  </style>
</head>
<body>
  <main>
    <aside>
      <h1>${esc(spec.title ?? spec.id)}</h1>
      <p>Status: ${esc(report?.status ?? (renderStatus.status === 0 ? 'rendered' : 'needs-review'))}</p>
      <p><a href="video-maker.spec.json">Spec</a></p>
      <p><a href="captions.srt">Captions</a></p>
      <p><a href="quality-report.json">QA Report</a></p>
      <p><a href="handoff.json">Handoff</a></p>
      <pre>${esc(JSON.stringify(report?.issues ?? [], null, 2))}</pre>
    </aside>
    <section class="stage">
      <video controls playsinline src="video.mp4"></video>
    </section>
  </main>
</body>
</html>`;
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
