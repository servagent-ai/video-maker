#!/usr/bin/env node
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

function arg(name, def = undefined) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : def;
}

const projectDir = arg('project');
const outPath = arg('out');
if (!projectDir || !outPath) {
  console.error('usage: node scripts/import-zhibo-project.mjs --project <zhibo/videos/topic> --out <spec.json>');
  process.exit(2);
}

const root = resolve(projectDir);
const id = basename(root);
const studioPath = join(root, '.studio.json');
const narrationsPath = join(root, 'narrations.json');
if (!existsSync(studioPath)) throw new Error(`missing .studio.json: ${studioPath}`);
if (!existsSync(narrationsPath)) throw new Error(`missing narrations.json: ${narrationsPath}`);

const studio = JSON.parse(readFileSync(studioPath, 'utf8'));
const narrations = JSON.parse(readFileSync(narrationsPath, 'utf8'));
const detectedVideo = detectVideo(root, id);
const detectedSummary = detectedVideo ? probeSummary(detectedVideo) : null;
const detectedDuration = detectedSummary?.durationSec ?? 0;
const hasTimedNarrations = narrations.some((n) => typeof n !== 'string' && Number.isFinite(Number(n.start)) && Number.isFinite(Number(n.end)));
const stringWeights = narrations.map((n) => Math.max(1, String(typeof n === 'string' ? n : n.text ?? '').length));
const totalWeight = stringWeights.reduce((a, b) => a + b, 0);
let cursor = 0;
const scenes = narrations.map((n, i) => {
  let start;
  let end;
  if (typeof n !== 'string' && hasTimedNarrations) {
    start = Number(n.start ?? cursor);
    end = Number(n.end ?? start + 4);
  } else if (detectedDuration > 0) {
    start = cursor;
    const dur = detectedDuration * (stringWeights[i] / totalWeight);
    end = i === narrations.length - 1 ? detectedDuration : start + dur;
    cursor = end;
  } else {
    start = i * 4;
    end = start + 4;
  }
  const text = typeof n === 'string' ? n : String(n.text ?? '');
  return {
    id: `scene-${String(i + 1).padStart(2, '0')}`,
    startSec: start,
    durationSec: Math.max(0.1, end - start),
    narration: text,
    visual: {
      kind: studio.mode === 'remotion' ? 'remotion-components' : studio.mode ?? 'zhibo-scene',
      components: studio.composition_id ? [studio.composition_id] : [],
      assetRefs: existsSync(join(root, 'slides.html')) ? ['slides'] : [],
    },
  };
});

const durationSec = detectedDuration || scenes.reduce((m, s) => Math.max(m, s.startSec + s.durationSec), 0);
const assets = [];
if (existsSync(join(root, 'slides.html'))) assets.push({ id: 'slides', kind: 'html', uri: join(root, 'slides.html'), role: 'source-composition' });
if (existsSync(join(root, 'build/my_voice.wav'))) assets.push({ id: 'voice-ref', kind: 'audio', uri: join(root, 'build/my_voice.wav'), role: 'voice-reference' });

const spec = {
  id,
  profile: 'zhibo-tech-workflow',
  mode: studio.mode ?? 'unknown',
  sourceProject: 'zhibo',
  title: studio.title ?? id,
  description: `Imported from ${root}`,
  language: studio.whisper_language === 'zh' ? 'zh-CN' : 'zh-CN',
  format: {
    width: detectedSummary?.width && detectedSummary.width > detectedSummary.height ? 1920 : 1080,
    height: detectedSummary?.width && detectedSummary.width > detectedSummary.height ? 1080 : 1920,
    fps: 30,
    durationSec,
  },
  captionPolicy: {
    mode: studio.subtitle?.enabled === false ? 'none' : 'burned',
    format: 'srt',
    required: studio.subtitle?.enabled !== false,
  },
  assets,
  scenes,
  publishTargets: ['bilibili', 'douyin', 'weixin', 'kuaishou'],
  quality: {
    gates: ['spec-complete', 'render-integrity', 'caption-integrity', 'plain-language-zh', 'visual-density', 'platform-variants'],
    requiresManualReview: true,
  },
  metadata: {
    importedFrom: root,
    modeProfile: profileOf(studio),
    sourceVideo: detectedVideo,
    studio,
  },
};

writeFileSync(outPath, JSON.stringify(spec, null, 2));
console.log(`wrote ${resolve(outPath)}`);

function detectVideo(root, id) {
  const candidates = [
    join(root, `${id}-video-volc.mp4`),
    join(root, 'build', 'merged_with_subs.mp4'),
    join(root, `${id}-recording-final.mp4`),
  ];
  return candidates.find((p) => existsSync(p)) ?? null;
}

function probeSummary(videoPath) {
  const ffprobe = process.env.FFPROBE_BIN ?? '/opt/homebrew/bin/ffprobe';
  const r = spawnSync(ffprobe, [
    '-v', 'error',
    '-print_format', 'json',
    '-show_streams',
    '-show_format',
    videoPath,
  ], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
  if (r.status !== 0) return null;
  const parsed = JSON.parse(r.stdout);
  const video = parsed.streams?.find((s) => s.codec_type === 'video') ?? {};
  return {
    durationSec: Number(parsed.format?.duration ?? 0),
    width: Number(video.width ?? 0),
    height: Number(video.height ?? 0),
  };
}

function profileOf(studio) {
  if (studio.mode === 'remotion') return `remotion:${studio.composition_id ?? 'unknown'}`;
  if (studio.mode === 'ppt') return `ppt:${studio.theme ?? 'default'}`;
  return `${studio.mode ?? 'unknown'}:${studio.record_engine ?? studio.composition_id ?? 'default'}`;
}
