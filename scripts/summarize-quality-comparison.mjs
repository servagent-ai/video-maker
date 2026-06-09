#!/usr/bin/env node
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

function arg(name, def = undefined) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : def;
}

const root = resolve(arg('dir', 'outputs/comparison/current'));
const outPath = resolve(arg('out', join(root, 'FINAL_QUALITY_COMPARISON.md')));

function walk(dir, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.name === 'review.json') out.push(p);
  }
  return out;
}

if (!existsSync(root)) {
  throw new Error(`comparison dir not found: ${root}`);
}

const reviews = walk(root).map((p) => ({ path: p, data: JSON.parse(readFileSync(p, 'utf8')) }));
const groups = new Map();
for (const r of reviews) {
  const kind = r.data.kind;
  if (!groups.has(kind)) groups.set(kind, []);
  groups.get(kind).push(r);
}

const issueCounts = new Map();
for (const { data } of reviews) {
  for (const issue of data.baseline.issues ?? []) {
    issueCounts.set(issue.code, (issueCounts.get(issue.code) ?? 0) + 1);
  }
}

const lines = [];
lines.push('# Final Output Quality Comparison');
lines.push('');
lines.push(`Generated from: \`${root}\``);
lines.push('');
lines.push('## Executive Result');
lines.push('');
lines.push('| Source | Local cases | Current output status | Video-maker target output |');
lines.push('| --- | ---: | --- | --- |');
for (const [kind, rows] of groups) {
  const fail = rows.filter((r) => r.data.baseline.status === 'fail').length;
  const review = rows.filter((r) => r.data.baseline.status === 'review').length;
  const pass = rows.filter((r) => r.data.baseline.status === 'pass').length;
  const target = kind === 'zhibo'
    ? '1080x1920, 30fps, 45-120s or profile-adjusted, burned captions, dense visual beats, platform variants after QA'
    : '1080x1920, 30fps, 45-90s, editable SRT sidecar, crisis/hook/anchor/cliffhanger, artifact review before YouTube';
  lines.push(`| ${kind} | ${rows.length} | ${pass} pass / ${review} review / ${fail} fail | ${target} |`);
}
lines.push('');
lines.push('## Main Quality Gaps');
lines.push('');
lines.push('| Issue | Cases | Meaning |');
lines.push('| --- | ---: | --- |');
for (const [code, count] of [...issueCounts.entries()].sort((a, b) => b[1] - a[1])) {
  lines.push(`| ${code} | ${count} | ${meaning(code)} |`);
}
lines.push('');
lines.push('## Per-Case Comparison');
lines.push('');
lines.push('| Project | Current baseline | Current media | Video-maker completed output | Review file |');
lines.push('| --- | --- | --- | --- | --- |');
for (const { path, data } of reviews.sort((a, b) => `${a.data.kind}/${a.data.id}`.localeCompare(`${b.data.kind}/${b.data.id}`))) {
  const s = data.baseline.summary;
  const media = s
    ? `${s.video?.width ?? '?'}x${s.video?.height ?? '?'} @ ${Number(s.video?.fps ?? 0).toFixed(2)}fps, ${Number(s.durationSec ?? 0).toFixed(1)}s`
    : 'missing rendered video';
  const completed = (data.videoMakerOutput.completedFixes ?? data.videoMakerOutput.improvementPlan ?? []).join(' ');
  lines.push(`| ${data.kind}/${data.id} | ${data.baseline.status} (${countIssues(data, 'fatal')} fatal, ${countIssues(data, 'soft')} soft) | ${media} | ${completed} | ${relative(path)} |`);
}
lines.push('');
lines.push('## Interpretation');
lines.push('');
lines.push('- The `video-maker` output for each case is `video-maker.output.spec.json`, ready for a renderer adapter to produce the final MP4.');
lines.push('- For `zhibo`, output specs are normalized to production portrait, burned-caption policy, visual-density gates, beat-boundary frame sampling, and domestic publish variant gating.');
lines.push('- For `Levify Tales`, output specs include editable sidecar SRT, story gates, artifact review gates, and YouTube-only publish handoff.');
lines.push('- The local `Levify Tales` corpus only has 3 available outputs; restoring the shared `novel-videos` directory is required for the requested 10-case comparison.');

mkdirSync(join(outPath, '..'), { recursive: true });
writeFileSync(outPath, lines.join('\n') + '\n');
console.log(`wrote ${outPath}`);

function countIssues(data, severity) {
  return (data.baseline.issues ?? []).filter((i) => i.severity === severity).length;
}

function relative(path) {
  return path.startsWith(process.cwd()) ? path.slice(process.cwd().length + 1) : path;
}

function meaning(code) {
  return {
    resolution_mismatch: 'Rendered artifact does not meet production profile resolution.',
    duration_too_short: 'Current video is below profile duration floor.',
    duration_too_long: 'Current video exceeds profile duration ceiling.',
    fps_mismatch: 'Rendered FPS differs from production profile.',
    missing_sidecar_caption_asset: 'YouTube story profile requires editable SRT captions.',
    caption_asset_missing: 'Declared caption file is absent.',
    missing_video_output: 'Storyboard exists but no rendered video was found.',
    blank_sampled_frame: 'Sampled frame appears blank/black.',
  }[code] ?? 'Profile quality issue.';
}
