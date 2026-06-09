#!/usr/bin/env node
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
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

function arg(name, def = undefined) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : def;
}

const specPath = arg('spec');
const outDir = arg('out');
if (!specPath || !outDir) {
  console.error('usage: node scripts/render-zhibo.mjs --spec <spec.json> --out <dir>');
  process.exit(2);
}

const spec = readJson(specPath);
const profile = readJson('profiles/zhibo-tech-workflow.json');
if (spec.profile !== 'zhibo-tech-workflow') throw new Error(`render-zhibo requires profile=zhibo-tech-workflow, got ${spec.profile}`);

const out = resolve(outDir);
mkdirSync(out, { recursive: true });
const videoPath = join(out, 'video.mp4');
const specOut = join(out, 'video-maker.spec.json');
const manifestPath = join(out, 'render-manifest.json');
writeFileSync(specOut, JSON.stringify(spec, null, 2));

const externalCommand = spec.render?.externalCommand ?? process.env.VIDEO_MAKER_ZHIBO_RENDER_CMD;
const sourceVideo = firstExisting([spec.render?.sourceVideo, spec.metadata?.sourceVideo]);
let renderMode;
if (externalCommand) {
  renderMode = 'external-command';
  runExternalCommand(externalCommand, { specPath: resolve(specPath), outDir: out, videoPath });
  if (!existsSync(videoPath)) throw new Error(`external zhibo render command did not write ${videoPath}`);
} else if (sourceVideo) {
  renderMode = 'source-video';
  normalizeSourceVideo(sourceVideo, spec, profile, videoPath);
} else {
  renderMode = 'fallback-engine';
  runFallback(specPath, videoPath, out);
}

const summary = videoSummary(probeVideo(videoPath));
const frameStats = sampleFrames(videoPath, summary, { count: 10, excludeTailSec: 0.5 });
const issues = checkVideoAgainstProfile(spec, profile, summary, frameStats);
const report = {
  kind: 'video-quality-report',
  version: 1,
  spec: resolve(specPath),
  profile: resolve('profiles/zhibo-tech-workflow.json'),
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
  engine: 'zhibo-adapter',
  renderMode,
  video: videoPath,
  manifest: manifestPath,
  qualityReport: qualityReportPath,
};
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
console.log(`${report.status}: ${videoPath}`);
if (report.status === 'fail') process.exit(1);

function normalizeSourceVideo(input, spec, profile, output) {
  const modeProfile = spec.metadata?.modeProfile ?? spec.mode ?? '';
  const modePolicy = resolveModePolicy(profile.modePolicies ?? {}, modeProfile);
  const inputSummary = videoSummary(probeVideo(input));
  const sourceLandscape = inputSummary.video?.width > inputSummary.video?.height;
  const preserveLandscape = modePolicy?.aspect === 'preserve-source' || modePolicy?.aspect === 'preserve-source-or-requested';
  const width = preserveLandscape && sourceLandscape ? 1920 : Number(spec.format?.width ?? profile.format.width);
  const height = preserveLandscape && sourceLandscape ? 1080 : Number(spec.format?.height ?? profile.format.height);
  const fps = Number(spec.format?.fps ?? profile.format.fps);
  const duration = Number(spec.format?.durationSec ?? inputSummary.durationSec);
  const vf = [
    `scale=${width}:${height}:force_original_aspect_ratio=decrease:flags=lanczos`,
    `pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2`,
    'setsar=1',
    `fps=${fps}`,
  ].join(',');
  const r = spawnSync(ffmpeg, [
    '-hide_banner', '-y',
    '-i', input,
    '-vf', vf,
    '-t', duration.toFixed(3),
    '-c:v', 'libx264',
    '-preset', 'slow',
    '-crf', '15',
    '-pix_fmt', 'yuv420p',
    '-c:a', 'aac',
    '-b:a', '192k',
    '-movflags', '+faststart',
    output,
  ], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (r.status !== 0) throw new Error(`zhibo source normalization failed: ${r.stderr || r.stdout}`);
}

function runExternalCommand(command, env) {
  const r = spawnSync(command, [], {
    shell: true,
    stdio: 'inherit',
    env: {
      ...process.env,
      VIDEO_MAKER_SPEC: env.specPath,
      VIDEO_MAKER_OUT_DIR: env.outDir,
      VIDEO_MAKER_OUTPUT_VIDEO: env.videoPath,
    },
  });
  if (r.status !== 0) throw new Error(`external zhibo render command failed with status ${r.status}`);
}

function runFallback(specPath, videoPath, out) {
  const r = spawnSync('node', [
    'scripts/render-engine.mjs',
    '--engine', 'zhibo-fallback',
    '--spec', specPath,
    '--profile', 'profiles/zhibo-tech-workflow.json',
    '--out', out,
  ], { stdio: 'inherit' });
  if (r.status !== 0) throw new Error(`fallback render failed with status ${r.status}`);
  if (!existsSync(videoPath)) throw new Error(`fallback render did not write ${videoPath}`);
}

function resolveModePolicy(policies, modeKey) {
  if (policies[modeKey]) return policies[modeKey];
  for (const [pattern, policy] of Object.entries(policies)) {
    if (pattern.endsWith('*') && String(modeKey).startsWith(pattern.slice(0, -1))) return policy;
  }
  return null;
}

function firstExisting(paths) {
  return paths.map((p) => p && resolve(p)).find((p) => p && existsSync(p)) ?? null;
}
