#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';

function arg(name, def = undefined) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : def;
}

const adapter = arg('adapter');
const qaPath = arg('qa');
const renderDir = arg('render');
const outDir = arg('out');
if (!adapter || !qaPath || !renderDir || !outDir) {
  console.error('usage: node scripts/publish-handoff.mjs --adapter <zhibo-sau|side-hustle-postiz|manual> --qa <report.json> --render <out-dir> --out <handoff-dir>');
  process.exit(2);
}

const qa = JSON.parse(readFileSync(qaPath, 'utf8'));
if (qa.status !== 'pass') {
  throw new Error(`refusing publish handoff because QA status is ${qa.status}`);
}

const root = resolve(renderDir);
const out = resolve(outDir);
mkdirSync(out, { recursive: true });
const specPath = join(root, 'video-maker.spec.json');
const spec = existsSync(specPath) ? JSON.parse(readFileSync(specPath, 'utf8')) : {};
const videoPath = qa.video ?? join(root, 'video.mp4');
const captionsPath = qa.captions ?? join(root, 'captions.srt');
const handoff = adapter === 'zhibo-sau'
  ? zhiboHandoff(spec, qa, videoPath, captionsPath)
  : adapter === 'side-hustle-postiz'
    ? sideHustleHandoff(spec, qa, videoPath, captionsPath)
    : manualHandoff(spec, qa, videoPath, captionsPath);
const target = join(out, 'handoff.json');
writeFileSync(target, JSON.stringify(handoff, null, 2));
console.log(`wrote ${target}`);

function zhiboHandoff(spec, qa, videoPath, captionsPath) {
  const id = spec.id ?? basename(resolve(renderDir));
  const platforms = spec.publishTargets ?? ['bilibili', 'douyin', 'weixin', 'kuaishou'];
  return {
    kind: 'publish-handoff',
    version: 1,
    adapter: 'zhibo-sau',
    status: 'qa-passed',
    id,
    videoPath,
    captionsPath: existsSync(captionsPath) ? captionsPath : null,
    qualityReportPath: resolve(qaPath),
    platforms: platforms.map((platform) => ({
      platform,
      title: spec.title ?? id,
      description: spec.description ?? '',
      tags: capTags(platform, spec.metadata?.tags ?? []),
      timeoutSec: platform === 'kuaishou' || platform === 'weixin' ? 1800 : 1200,
      headedMode: platform === 'kuaishou' || platform === 'weixin',
      thumbnailRequired: platform === 'weixin',
      variant: `${id}-${platform}`,
    })),
  };
}

function sideHustleHandoff(spec, qa, videoPath, captionsPath) {
  const id = spec.id ?? basename(resolve(renderDir));
  return {
    kind: 'side-hustle-video-handoff',
    version: 1,
    pieceId: `video-${id}`,
    novelVideoId: id,
    profile: 'levify-tales',
    platforms: ['youtube'],
    videoPath,
    captionsPath: existsSync(captionsPath) ? captionsPath : null,
    title: spec.title ?? id,
    description: spec.description ?? '',
    qualityReportPath: resolve(qaPath),
    status: 'qa-passed',
    source: spec.metadata?.source ?? spec.sourceProject ?? null,
    transformative: spec.metadata?.transformative ?? spec.transformative ?? { note: spec.quality?.transformativeNote ?? '' },
  };
}

function manualHandoff(spec, qa, videoPath, captionsPath) {
  return {
    kind: 'manual-video-handoff',
    version: 1,
    status: 'qa-passed',
    id: spec.id ?? basename(resolve(renderDir)),
    videoPath,
    captionsPath: existsSync(captionsPath) ? captionsPath : null,
    qualityReportPath: resolve(qaPath),
  };
}

function capTags(platform, tags) {
  const clean = tags.map(String).filter(Boolean);
  return platform === 'kuaishou' ? clean.slice(0, 4) : clean;
}
