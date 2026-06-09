#!/usr/bin/env node
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';

function arg(name, def = undefined) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : def;
}

const projectDir = arg('project');
const outPath = arg('out');
if (!projectDir || !outPath) {
  console.error('usage: node scripts/import-novel-video.mjs --project <novel-video-dir> --out <spec.json>');
  process.exit(2);
}

const root = resolve(projectDir);
const id = basename(root);
const storyboardPath = join(root, 'storyboard.json');
if (!existsSync(storyboardPath)) throw new Error(`missing storyboard.json: ${storyboardPath}`);
const sb = JSON.parse(readFileSync(storyboardPath, 'utf8'));
const seriesPath = join(root, 'series.json');
const series = existsSync(seriesPath) ? JSON.parse(readFileSync(seriesPath, 'utf8')) : null;
const shots = Array.isArray(sb.shots) ? sb.shots : [];
const defaultDur = shots.length > 0 ? 78 / shots.length : 8;
const scenes = shots.map((shot, i) => ({
  id: `shot-${String(i + 1).padStart(2, '0')}`,
  startSec: Number((i * defaultDur).toFixed(3)),
  durationSec: Number(defaultDur.toFixed(3)),
  narration: String(shot.narration ?? ''),
  visual: {
    kind: 'ai-keyframe',
    prompt: String(shot.imagePrompt ?? ''),
    assetRefs: ['storyboard'],
  },
  story: {
    stimPoint: shot.stimPoint === true,
    identityHook: shot.identityHook ?? undefined,
    visualAnchor: shot.visualAnchor ?? undefined,
  },
  metadata: {
    narrationZh: shot.narrationZh ?? undefined,
    sourceUrl: shot.sourceUrl ?? undefined,
    license: shot.license ?? undefined,
  },
}));

const assets = [{ id: 'storyboard', kind: 'json', uri: storyboardPath, role: 'storyboard' }];
const captionsPath = join(root, 'captions.srt');
if (existsSync(captionsPath)) assets.push({ id: 'captions', kind: 'other', uri: captionsPath, role: 'sidecar-captions' });
const captionsZhPath = join(root, 'captions-zh.srt');
if (existsSync(captionsZhPath)) assets.push({ id: 'captions-zh', kind: 'other', uri: captionsZhPath, role: 'sidecar-captions zh' });
const videoPath = join(root, 'video.mp4');
if (existsSync(videoPath)) assets.push({ id: 'video', kind: 'video', uri: videoPath, role: 'rendered-video' });
const videoZhPath = join(root, 'video-zh.mp4');
if (existsSync(videoZhPath)) assets.push({ id: 'video-zh', kind: 'video', uri: videoZhPath, role: 'rendered-video zh' });
for (const [i] of shots.entries()) {
  const n = String(i + 1).padStart(2, '0');
  for (const p of [
    join(root, 'frames', `${n}.png`),
    join(root, 'frames', `shot-${n}.png`),
    join(root, 'audio', `${n}.wav`),
    join(root, 'audio', `shot-${n}.wav`),
  ]) {
    if (existsSync(p)) assets.push({ id: `asset-${assets.length + 1}`, kind: p.endsWith('.wav') ? 'audio' : 'image', uri: p, role: p.includes('/audio/') ? `shot-audio shot-${n}` : `shot-frame shot-${n}` });
  }
}

const spec = {
  id,
  profile: 'levify-tales',
  sourceProject: 'side-hustle/novel-pipeline',
  title: sb.title ?? id,
  description: sb.logline ?? `Imported from ${root}`,
  language: 'en-US',
  format: {
    width: 1080,
    height: 1920,
    fps: 30,
    durationSec: scenes.reduce((m, s) => Math.max(m, s.startSec + s.durationSec), 0),
  },
  captionPolicy: {
    mode: 'sidecar',
    format: 'srt',
    required: true,
  },
  assets,
  scenes,
  publishTargets: ['youtube'],
  quality: {
    gates: ['spec-complete', 'render-integrity', 'caption-integrity', 'three-second-crisis', 'identity-hook', 'visual-anchor', 'cliffhanger', 'transformative-safety', 'ai-artifact-review', 'youtube-only-auto-publish', 'artifact-namespace'],
    transformativeNote: sb.transformative?.note ?? '',
    requiresManualReview: true,
  },
  transformative: sb.transformative ?? {},
  metadata: {
    importedFrom: root,
    status: existsSync(videoPath) ? 'has-render' : 'needs-render',
    series: series ? {
      seriesId: series.seriesId ?? series.id ?? null,
      episode: series.episode ?? null,
      totalEpisodes: series.totalEpisodes ?? null,
      prevId: series.prevId ?? null,
      nextId: series.nextId ?? null,
    } : null,
    source: sb.source,
    sourceUrl: sb.sourceUrl ?? sb.source?.url,
    license: sb.license ?? sb.source?.license,
    transformative: sb.transformative,
  },
};

writeFileSync(outPath, JSON.stringify(spec, null, 2));
console.log(`wrote ${resolve(outPath)}`);
