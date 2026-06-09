#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  checkSrt,
  checkStoryGates,
  checkVideoAgainstProfile,
  parseSrt,
  probeVideo,
  readJson,
  sampleFrames,
  videoSummary,
  writeReport,
} from './lib/video-qa.mjs';

const ffmpeg = process.env.FFMPEG_BIN ?? '/opt/homebrew/bin/ffmpeg';
const canDrawText = hasFilter('drawtext');

function arg(name, def = undefined) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : def;
}

const specPath = arg('spec');
const outDir = arg('out');
if (!specPath || !outDir) {
  console.error('usage: node scripts/render-levify-tales.mjs --spec <spec.json> --out <dir>');
  process.exit(2);
}

const spec = readJson(specPath);
const specBaseDir = dirname(resolve(specPath));
const profile = readJson('profiles/levify-tales.json');
if (spec.profile !== 'levify-tales') throw new Error(`render-levify-tales requires profile=levify-tales, got ${spec.profile}`);

const out = resolve(outDir);
mkdirSync(out, { recursive: true });
const renderSpecPath = join(out, 'video-maker.spec.json');
const captionsPath = join(out, 'captions.srt');
const videoPath = join(out, 'video.mp4');
const manifestPath = join(out, 'render-manifest.json');

const assetPlan = planAssets(spec);
const retimedSpec = retimeSpecFromAudio(spec, assetPlan);
writeFileSync(renderSpecPath, JSON.stringify(retimedSpec, null, 2));

const captions = buildCaptions(retimedSpec);
writeFileSync(captionsPath, captions);

const renderMode = assetPlan.some((p) => p.image || p.audio) ? 'asset-mode' : 'fallback-mode';
if (renderMode === 'asset-mode') renderAssetVideo(retimedSpec, profile, assetPlan, videoPath, out);
else renderFallbackVideo(retimedSpec, profile, videoPath);

const qaSpec = {
  ...spec,
  assets: [
    ...(retimedSpec.assets ?? []).filter((a) => !/caption|srt/i.test(`${a.role ?? ''} ${a.uri ?? ''}`)),
    { id: 'captions', kind: 'other', uri: captionsPath, role: 'sidecar-captions' },
  ],
};
const summary = videoSummary(probeVideo(videoPath));
const frameStats = sampleFrames(videoPath, summary, { count: 8, excludeTailSec: 0.5 });
const cues = parseSrt(captions);
const issues = [
  ...checkVideoAgainstProfile(qaSpec, profile, summary, frameStats),
  ...checkSrt(cues, summary.durationSec),
  ...checkStoryGates(qaSpec, profile),
];
const report = {
  kind: 'video-quality-report',
  version: 1,
  spec: resolve(specPath),
  profile: resolve('profiles/levify-tales.json'),
  video: videoPath,
  captions: captionsPath,
  status: issues.some((i) => i.severity === 'fatal') ? 'fail' : issues.some((i) => i.severity === 'soft') ? 'review' : 'pass',
  summary,
  frameSamples: frameStats,
  issues,
};
const qualityReportPath = writeReport(report, join(out, 'quality-report.json'));
const manifest = {
  kind: 'video-render-result',
  version: 1,
  status: 'rendered',
  engine: 'ffmpeg-levify-tales',
  renderMode,
  profile: 'levify-tales',
  video: videoPath,
  captions: captionsPath,
  manifest: manifestPath,
  qualityReport: qualityReportPath,
};
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
console.log(`${report.status}: ${videoPath}`);
if (report.status === 'fail') process.exit(1);

function renderFallbackVideo(spec, profile, output) {
  const width = profile.format.width;
  const height = profile.format.height;
  const fps = profile.format.fps;
  const duration = Number(spec.format?.durationSec ?? timelineDuration(spec));
  const filters = [
    'format=yuv420p',
    ...sceneFilters(spec, width, height),
  ].join(',');
  const args = [
    '-hide_banner', '-y',
    '-f', 'lavfi',
    '-i', `color=c=0x151820:s=${width}x${height}:r=${fps}:d=${duration.toFixed(3)}`,
    '-f', 'lavfi',
    '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100',
    '-vf', filters,
    '-t', duration.toFixed(3),
    '-c:v', 'libx264',
    '-preset', 'slow',
    '-crf', '16',
    '-pix_fmt', 'yuv420p',
    '-c:a', 'aac',
    '-b:a', '192k',
    '-movflags', '+faststart',
    output,
  ];
  const r = spawnSync(ffmpeg, args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (r.status !== 0) throw new Error(`ffmpeg render failed: ${r.stderr || r.stdout}`);
}

function renderAssetVideo(spec, profile, plan, output, outDir) {
  const segmentDir = join(outDir, 'segments');
  mkdirSync(segmentDir, { recursive: true });
  const segmentPaths = [];
  for (const [i, scene] of (spec.scenes ?? []).entries()) {
    const segment = join(segmentDir, `${String(i + 1).padStart(3, '0')}.mp4`);
    renderSegment(scene, profile, plan[i], segment);
    segmentPaths.push(segment);
  }
  const concatPath = join(segmentDir, 'concat.txt');
  writeFileSync(concatPath, segmentPaths.map((p) => `file '${p.replace(/'/g, "'\\''")}'`).join('\n') + '\n');
  const r = spawnSync(ffmpeg, [
    '-hide_banner', '-y',
    '-f', 'concat',
    '-safe', '0',
    '-i', concatPath,
    '-c', 'copy',
    '-movflags', '+faststart',
    output,
  ], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (r.status !== 0) throw new Error(`ffmpeg concat failed: ${r.stderr || r.stdout}`);
}

function renderSegment(scene, profile, item, output) {
  const width = profile.format.width;
  const height = profile.format.height;
  const fps = profile.format.fps;
  const duration = Number(scene.durationSec ?? 4);
  const videoInput = item?.image
    ? ['-loop', '1', '-i', item.image]
    : ['-f', 'lavfi', '-i', `color=c=0x151820:s=${width}x${height}:r=${fps}:d=${duration.toFixed(3)}`];
  const audioInput = item?.audio
    ? ['-i', item.audio]
    : ['-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100'];
  const vf = [
    `scale=${width}:${height}:force_original_aspect_ratio=increase`,
    `crop=${width}:${height}`,
    `fps=${fps}`,
    'format=yuv420p',
  ];
  if (canDrawText) {
    vf.push(`drawtext=text='${escDraw(scene.id ?? '')}':x=72:y=88:fontsize=42:fontcolor=white:box=1:boxcolor=0x111111@0.42:boxborderw=14`);
  }
  const r = spawnSync(ffmpeg, [
    '-hide_banner', '-y',
    ...videoInput,
    ...audioInput,
    '-vf', vf.join(','),
    '-af', `apad,atrim=0:${duration.toFixed(3)}`,
    '-t', duration.toFixed(3),
    '-c:v', 'libx264',
    '-preset', 'slow',
    '-crf', '16',
    '-pix_fmt', 'yuv420p',
    '-c:a', 'aac',
    '-b:a', '192k',
    '-shortest',
    output,
  ], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (r.status !== 0) throw new Error(`ffmpeg segment failed: ${r.stderr || r.stdout}`);
}

function planAssets(spec) {
  const assets = new Map((spec.assets ?? []).map((a) => [a.id, { ...a, uri: resolveAsset(a.uri) }]));
  return (spec.scenes ?? []).map((scene, i) => {
    const id = scene.id ?? `scene-${i + 1}`;
    const refs = scene.visual?.assetRefs ?? [];
    const refAssets = refs.map((ref) => assets.get(ref)).filter(Boolean);
    const image = firstExisting([
      scene.visual?.image,
      ...refAssets.filter((a) => a.kind === 'image').map((a) => a.uri),
      ...findAssetsForScene(spec.assets ?? [], id, i, 'image').map((a) => a.uri),
    ]);
    const audio = firstExisting([
      scene.audio?.uri,
      ...refAssets.filter((a) => a.kind === 'audio').map((a) => a.uri),
      ...findAssetsForScene(spec.assets ?? [], id, i, 'audio').map((a) => a.uri),
    ]);
    return { image, audio };
  });
}

function findAssetsForScene(assets, sceneId, index, kind) {
  const n = String(index + 1).padStart(2, '0');
  const aliases = [sceneId, `shot-${n}`, `scene-${n}`].map((s) => String(s).toLowerCase());
  return assets
    .filter((a) => a.kind === kind)
    .filter((a) => aliases.some((alias) => `${a.id} ${a.role ?? ''} ${a.uri}`.toLowerCase().includes(alias)))
    .map((a) => ({ ...a, uri: resolveAsset(a.uri) }));
}

function firstExisting(paths) {
  return paths.map((p) => p && resolveAsset(p)).find((p) => p && existsSync(p)) ?? null;
}

function resolveAsset(uri) {
  if (!uri) return null;
  return isAbsolute(uri) ? uri : resolve(specBaseDir, uri);
}

function retimeSpecFromAudio(spec, plan) {
  let changed = false;
  let cursor = 0;
  const scenes = (spec.scenes ?? []).map((scene, i) => {
    const audioDur = plan[i]?.audio ? probeDuration(plan[i].audio) : 0;
    const durationSec = Math.max(Number(scene.durationSec ?? 4), audioDur ? audioDur + 0.15 : 0);
    const out = {
      ...scene,
      startSec: Number(cursor.toFixed(3)),
      durationSec: Number(durationSec.toFixed(3)),
    };
    if (audioDur) out.audio = { ...(scene.audio ?? {}), uri: plan[i].audio, durationSec: Number(audioDur.toFixed(3)), paddingSec: 0.15 };
    if (out.startSec !== scene.startSec || out.durationSec !== scene.durationSec) changed = true;
    cursor += durationSec;
    return out;
  });
  const durationSec = Number(cursor.toFixed(3));
  return {
    ...spec,
    scenes,
    format: { ...spec.format, durationSec: changed ? durationSec : spec.format?.durationSec ?? durationSec },
  };
}

function probeDuration(file) {
  const r = spawnSync(process.env.FFPROBE_BIN ?? '/opt/homebrew/bin/ffprobe', [
    '-v', 'error',
    '-show_entries', 'format=duration',
    '-of', 'default=nw=1:nk=1',
    file,
  ], { encoding: 'utf8' });
  const n = Number(r.stdout.trim());
  return r.status === 0 && Number.isFinite(n) ? n : 0;
}

function sceneFilters(spec, width, height) {
  const filters = [
    `drawbox=x=54:y=54:w=${width - 108}:h=${height - 108}:color=0xf0d58a@0.18:t=3`,
  ];
  if (canDrawText) {
    filters.push(`drawtext=text='${escDraw(spec.title ?? spec.id)}':x=72:y=92:fontsize=54:fontcolor=white:box=1:boxcolor=0x111111@0.45:boxborderw=18`);
  }
  for (const scene of spec.scenes ?? []) {
    const start = Number(scene.startSec ?? 0);
    const end = start + Number(scene.durationSec ?? 4);
    const text = wrap(`${scene.narration ?? scene.visual?.prompt ?? scene.id}`, 24).slice(0, 5);
    filters.push(`drawbox=enable='between(t,${start},${end})':x=78:y=1320:w=${width - 156}:h=430:color=0x0c0f14@0.72:t=fill`);
    if (canDrawText) {
      filters.push(`drawtext=enable='between(t,${start},${end})':text='${escDraw(scene.id ?? '')}':x=96:y=1360:fontsize=34:fontcolor=0xf0d58a`);
      text.forEach((line, i) => {
        filters.push(`drawtext=enable='between(t,${start},${end})':text='${escDraw(line)}':x=96:y=${1420 + i * 54}:fontsize=40:fontcolor=white`);
      });
    }
    filters.push(`drawbox=enable='between(t,${start},${end})':x=92:y=${260 + (Number(scene.id?.replace(/\D/g, '') ?? 1) % 5) * 150}:w=${width - 184}:h=110:color=0x3047ff@0.18:t=fill`);
    filters.push(`drawbox=enable='between(t,${start},${end})':x=${140 + ((Number(scene.id?.replace(/\D/g, '') ?? 1) * 137) % 520)}:y=${360 + ((Number(scene.id?.replace(/\D/g, '') ?? 1) * 211) % 520)}:w=260:h=260:color=0xf0d58a@0.24:t=fill`);
  }
  return filters;
}

function buildCaptions(spec) {
  return (spec.scenes ?? []).map((scene, i) => {
    const start = Number(scene.startSec ?? 0);
    const end = start + Number(scene.durationSec ?? 4);
    return `${i + 1}\n${srtTime(start)} --> ${srtTime(end)}\n${String(scene.narration ?? '').trim() || scene.id}\n`;
  }).join('\n');
}

function timelineDuration(spec) {
  return Math.max(...(spec.scenes ?? []).map((s) => Number(s.startSec ?? 0) + Number(s.durationSec ?? 0)), 1);
}

function srtTime(sec) {
  const ms = Math.max(0, Math.round(sec * 1000));
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const r = ms % 1000;
  return `${pad(h)}:${pad(m)}:${pad(s)},${String(r).padStart(3, '0')}`;
}

function pad(n) {
  return String(n).padStart(2, '0');
}

function wrap(text, len) {
  const words = String(text).replace(/\s+/g, ' ').trim().split(' ');
  const lines = [];
  let line = '';
  for (const word of words) {
    if (`${line} ${word}`.trim().length > len && line) {
      lines.push(line);
      line = word;
    } else {
      line = `${line} ${word}`.trim();
    }
  }
  if (line) lines.push(line);
  return lines.length ? lines : [''];
}

function escDraw(text) {
  return String(text).replace(/\\/g, '\\\\').replace(/:/g, '\\:').replace(/'/g, "\\'").replace(/\[/g, '\\[').replace(/\]/g, '\\]');
}

function hasFilter(name) {
  const r = spawnSync(ffmpeg, ['-hide_banner', '-filters'], { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
  return r.status === 0 && new RegExp(`\\b${name}\\b`).test(r.stdout);
}
