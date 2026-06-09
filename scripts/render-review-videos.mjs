#!/usr/bin/env node
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

function arg(name, def = undefined) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : def;
}

const root = resolve(arg('dir', 'outputs/comparison/current'));
const ffmpeg = process.env.FFMPEG_BIN ?? '/opt/homebrew/bin/ffmpeg';
if (!existsSync(root)) throw new Error(`comparison dir not found: ${root}`);

function walk(dir, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.name === 'review.json') out.push(p);
  }
  return out;
}

const rendered = [];
const skipped = [];

for (const reviewPath of walk(root)) {
  const review = JSON.parse(readFileSync(reviewPath, 'utf8'));
  const caseDir = resolve(join(reviewPath, '..'));
  const specPath = join(caseDir, 'video-maker.output.spec.json');
  if (!existsSync(specPath)) {
    skipped.push({ id: `${review.kind}/${review.id}`, reason: 'missing output spec; run npm run upgrade:outputs first' });
    continue;
  }
  const spec = JSON.parse(readFileSync(specPath, 'utf8'));
  const sourceVideo = review.sourceVideo;
  if (!sourceVideo || !existsSync(sourceVideo)) {
    skipped.push({ id: `${review.kind}/${review.id}`, reason: 'missing source video' });
    continue;
  }
  const outVideo = join(caseDir, 'video-maker.output.mp4');
  const targetDuration = Number(spec.format.durationSec);
  const sourceDuration = Number(review.baseline.summary?.durationSec ?? targetDuration);
  const tempo = sourceDuration > 0 && targetDuration > 0 ? sourceDuration / targetDuration : 1;
  const setpts = sourceDuration > 0 && targetDuration > 0 ? targetDuration / sourceDuration : 1;
  const vf = [
    `scale=${spec.format.width}:${spec.format.height}:force_original_aspect_ratio=decrease`,
    `pad=${spec.format.width}:${spec.format.height}:(ow-iw)/2:(oh-ih)/2`,
    `setsar=1`,
    `fps=${spec.format.fps}`,
    `setpts=${setpts.toFixed(8)}*PTS`,
  ].join(',');
  const af = atempoChain(tempo);
  const args = [
    '-hide_banner',
    '-y',
    '-i', sourceVideo,
    '-vf', vf,
    '-af', af,
    '-t', targetDuration.toFixed(3),
    '-c:v', 'libx264',
    '-preset', 'medium',
    '-crf', '18',
    '-pix_fmt', 'yuv420p',
    '-c:a', 'aac',
    '-b:a', '160k',
    '-movflags', '+faststart',
    outVideo,
  ];
  const r = spawnSync(ffmpeg, args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (r.status !== 0) {
    skipped.push({ id: `${review.kind}/${review.id}`, reason: `ffmpeg failed: ${(r.stderr || r.stdout).slice(0, 240)}` });
    continue;
  }
  rendered.push({ id: `${review.kind}/${review.id}`, video: outVideo, targetDuration });
}

const lines = [];
lines.push('# Direct Video Review Outputs');
lines.push('');
lines.push(`Generated from: \`${root}\``);
lines.push('');
lines.push('## Videos');
lines.push('');
for (const r of rendered) {
  lines.push(`- ${r.id}: [video-maker.output.mp4](${relative(r.video)}) (${r.targetDuration.toFixed(1)}s)`);
}
if (skipped.length) {
  lines.push('');
  lines.push('## Skipped');
  lines.push('');
  for (const s of skipped) lines.push(`- ${s.id}: ${s.reason}`);
}
writeFileSync(join(root, 'VIDEO_REVIEW.md'), lines.join('\n') + '\n');
console.log(`rendered ${rendered.length}, skipped ${skipped.length}`);

function relative(path) {
  return path.startsWith(process.cwd()) ? path.slice(process.cwd().length + 1) : path;
}

function atempoChain(tempo) {
  if (!Number.isFinite(tempo) || tempo <= 0) return 'anull';
  const parts = [];
  let t = tempo;
  while (t < 0.5) {
    parts.push(0.5);
    t /= 0.5;
  }
  while (t > 2) {
    parts.push(2);
    t /= 2;
  }
  parts.push(t);
  return parts.map((p) => `atempo=${p.toFixed(8)}`).join(',');
}
