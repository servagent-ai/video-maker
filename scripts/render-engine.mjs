#!/usr/bin/env node
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  checkVideoAgainstProfile,
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

const engine = arg('engine', 'ffmpeg');
const specPath = arg('spec');
const profilePath = arg('profile');
const outDir = arg('out');
if (!specPath || !profilePath || !outDir) {
  console.error('usage: node scripts/render-engine.mjs --engine <name> --spec <spec.json> --profile <profile.json> --out <dir>');
  process.exit(2);
}

const spec = readJson(specPath);
const profile = readJson(profilePath);
const out = resolve(outDir);
mkdirSync(out, { recursive: true });

const videoPath = join(out, 'video.mp4');
const specOut = join(out, 'video-maker.spec.json');
const manifestPath = join(out, 'render-manifest.json');
writeFileSync(specOut, JSON.stringify(spec, null, 2));
renderSpec(spec, profile, videoPath);
const summary = videoSummary(probeVideo(videoPath));
const frameStats = sampleFrames(videoPath, summary, { count: 8, excludeTailSec: 0.5 });
const issues = checkVideoAgainstProfile(spec, profile, summary, frameStats);
const report = {
  kind: 'video-quality-report',
  version: 1,
  spec: resolve(specPath),
  profile: resolve(profilePath),
  video: videoPath,
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
  engine,
  engineMode: `${engine}-adapter-via-ffmpeg`,
  video: videoPath,
  manifest: manifestPath,
  qualityReport: qualityReportPath,
};
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
console.log(`${report.status}: ${videoPath}`);
if (report.status === 'fail') process.exit(1);

function renderSpec(spec, profile, output) {
  const width = Number(spec.format?.width ?? profile.format?.width ?? 1080);
  const height = Number(spec.format?.height ?? profile.format?.height ?? 1920);
  const fps = Number(spec.format?.fps ?? profile.format?.fps ?? 30);
  const duration = Number(spec.format?.durationSec ?? timelineDuration(spec));
  const filters = [
    'format=yuv420p',
    `drawbox=x=42:y=42:w=${width - 84}:h=${height - 84}:color=0x69d2ff@0.16:t=3`,
    ...sceneText(spec, width, height),
  ].join(',');
  const args = [
    '-hide_banner', '-y',
    '-f', 'lavfi', '-i', `color=c=0x10141d:s=${width}x${height}:r=${fps}:d=${duration.toFixed(3)}`,
    '-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100',
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
  if (r.status !== 0) throw new Error(`ffmpeg failed: ${r.stderr || r.stdout}`);
}

function sceneText(spec, width, height) {
  const out = [];
  if (canDrawText) {
    out.push(`drawtext=text='${escDraw(spec.title ?? spec.id)}':x=64:y=80:fontsize=${Math.max(28, Math.round(width / 24))}:fontcolor=white:box=1:boxcolor=0x111111@0.42:boxborderw=14`);
  }
  for (const [idx, scene] of (spec.scenes ?? []).entries()) {
    const start = Number(scene.startSec ?? 0);
    const end = start + Number(scene.durationSec ?? 4);
    const lines = wrap(String(scene.narration ?? scene.visual?.prompt ?? scene.id), width >= height ? 46 : 25).slice(0, 4);
    out.push(`drawbox=enable='between(t,${start},${end})':x=${Math.round(width * 0.07)}:y=${Math.round(height * 0.68)}:w=${Math.round(width * 0.86)}:h=${Math.round(height * 0.22)}:color=0x080a0f@0.72:t=fill`);
    if (canDrawText) {
      out.push(`drawtext=enable='between(t,${start},${end})':text='${escDraw(scene.id ?? `scene-${idx + 1}`)}':x=${Math.round(width * 0.09)}:y=${Math.round(height * 0.70)}:fontsize=${Math.max(24, Math.round(width / 34))}:fontcolor=0x69d2ff`);
      lines.forEach((line, i) => {
        out.push(`drawtext=enable='between(t,${start},${end})':text='${escDraw(line)}':x=${Math.round(width * 0.09)}:y=${Math.round(height * (0.74 + i * 0.035))}:fontsize=${Math.max(28, Math.round(width / 28))}:fontcolor=white`);
      });
    }
    out.push(`drawbox=enable='between(t,${start},${end})':x=${Math.round(width * 0.14) + ((idx * 113) % Math.round(width * 0.35))}:y=${Math.round(height * 0.20) + ((idx * 149) % Math.round(height * 0.28))}:w=${Math.round(width * 0.22)}:h=${Math.round(height * 0.10)}:color=0x69d2ff@0.22:t=fill`);
  }
  return out;
}

function timelineDuration(spec) {
  return Math.max(...(spec.scenes ?? []).map((s) => Number(s.startSec ?? 0) + Number(s.durationSec ?? 0)), 1);
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
