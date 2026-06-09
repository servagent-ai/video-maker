#!/usr/bin/env node
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';

function arg(name, def = undefined) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : def;
}

const renderDir = arg('render-dir');
const outPath = arg('out');
if (!renderDir || !outPath) {
  console.error('usage: node scripts/handoff-side-hustle.mjs --render-dir <dir> --out <handoff.json>');
  process.exit(2);
}

const root = resolve(renderDir);
const specPath = join(root, 'video-maker.spec.json');
const reportPath = join(root, 'quality-report.json');
const videoPath = join(root, 'video.mp4');
const captionsPath = join(root, 'captions.srt');
for (const p of [specPath, reportPath, videoPath, captionsPath]) {
  if (!existsSync(p)) throw new Error(`missing required render artifact: ${p}`);
}
const spec = JSON.parse(readFileSync(specPath, 'utf8'));
const report = JSON.parse(readFileSync(reportPath, 'utf8'));
const novelVideoId = spec.id ?? basename(root);
const handoff = {
  kind: 'side-hustle-video-handoff',
  version: 1,
  pieceId: `video-${novelVideoId}`,
  novelVideoId,
  profile: 'levify-tales',
  platforms: ['youtube'],
  videoPath,
  captionsPath,
  title: spec.title ?? novelVideoId,
  description: spec.description ?? '',
  qualityReportPath: reportPath,
  status: report.status === 'pass' ? 'qa-passed' : report.status === 'fail' ? 'failed' : 'needs-review',
  source: spec.metadata?.source ?? spec.sourceProject ?? null,
  transformative: spec.metadata?.transformative ?? spec.transformative ?? { note: spec.quality?.transformativeNote ?? '' },
};
writeFileSync(outPath, JSON.stringify(handoff, null, 2));
console.log(`wrote ${resolve(outPath)} (${handoff.status})`);
if (handoff.status === 'failed') process.exit(1);
