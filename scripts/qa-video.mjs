#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  checkSrt,
  checkVideoAgainstProfile,
  parseSrt,
  probeVideo,
  readJson,
  sampleFrames,
  videoSummary,
  writeReport,
} from './lib/video-qa.mjs';

function arg(name, def = undefined) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : def;
}

const specPath = arg('spec');
const videoPath = arg('video');
const profilePath = arg('profile');
const outPath = arg('out');

if (!specPath || !videoPath || !profilePath) {
  console.error('usage: node scripts/qa-video.mjs --spec <spec.json> --profile <profile.json> --video <video.mp4> [--out report.json]');
  process.exit(2);
}

const spec = readJson(specPath);
const profile = readJson(profilePath);
const probe = probeVideo(videoPath);
const summary = videoSummary(probe);
const frameStats = sampleFrames(videoPath, summary, { count: 8, excludeTailSec: 0.75 });
const issues = checkVideoAgainstProfile(spec, profile, summary, frameStats);

for (const asset of spec.assets ?? []) {
  if ((asset.role ?? '').includes('caption') || asset.uri.endsWith('.srt')) {
    const p = resolve(asset.uri);
    if (!existsSync(p)) {
      issues.push({ severity: 'fatal', code: 'caption_asset_missing', message: `caption asset missing: ${asset.uri}` });
    } else {
      const cues = parseSrt(readFileSync(p, 'utf8'));
      if (cues.length === 0) {
        issues.push({ severity: 'fatal', code: 'caption_empty', message: `caption file has no cues: ${asset.uri}` });
      }
      issues.push(...checkSrt(cues, summary.durationSec));
    }
  }
}

const report = {
  kind: 'video-quality-report',
  version: 1,
  spec: resolve(specPath),
  profile: resolve(profilePath),
  video: resolve(videoPath),
  status: issues.some((i) => i.severity === 'fatal') ? 'fail' : issues.some((i) => i.severity === 'soft') ? 'review' : 'pass',
  summary,
  frameSamples: frameStats,
  issues,
};

const written = writeReport(report, outPath);
console.log(`${report.status}: ${written}`);
if (report.status === 'fail') process.exit(1);
