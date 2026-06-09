#!/usr/bin/env node
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';

function arg(name, def = undefined) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : def;
}

const root = resolve(arg('dir', 'outputs/comparison/current'));
if (!existsSync(root)) throw new Error(`comparison dir not found: ${root}`);

function walk(dir, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.name === 'review.json') out.push(p);
  }
  return out;
}

for (const reviewPath of walk(root)) {
  const review = JSON.parse(readFileSync(reviewPath, 'utf8'));
  const caseDir = resolve(join(reviewPath, '..'));
  const inputSpec = review.videoMakerOutput.spec;
  const outputSpec = review.kind === 'zhibo'
    ? upgradeZhiboSpec(inputSpec)
    : upgradeTalesSpec(inputSpec, caseDir);
  const outputSpecPath = join(caseDir, 'video-maker.output.spec.json');
  writeFileSync(outputSpecPath, JSON.stringify(outputSpec, null, 2));
  review.videoMakerOutput = {
    status: 'ready-for-render',
    outputSpec: outputSpecPath,
    spec: outputSpec,
    completedFixes: completedFixes(review.kind, inputSpec, outputSpec),
  };
  writeFileSync(reviewPath, JSON.stringify(review, null, 2));
}

console.log(`upgraded outputs under ${root}`);

function upgradeZhiboSpec(spec) {
  const out = structuredClone(spec);
  out.format.width = 1080;
  out.format.height = 1920;
  out.format.fps = 30;
  out.format.durationSec = clamp(out.format.durationSec, 45, 120);
  out.captionPolicy = { mode: 'burned', format: 'srt', required: true };
  out.publishTargets = ['bilibili', 'douyin', 'weixin', 'kuaishou'];
  out.quality = {
    gates: [
      'spec-complete',
      'render-integrity',
      'caption-integrity',
      'plain-language-zh',
      'visual-density',
      'beat-boundary-frame-sampling',
      'platform-variants',
    ],
    requiresManualReview: true,
  };
  out.scenes = retimeScenes(out.scenes, out.format.durationSec);
  out.metadata = {
    ...out.metadata,
    videoMakerUpgrade: {
      renderer: 'remotion',
      outputResolution: '1080x1920',
      outputFps: 30,
      captionPolicy: 'burned',
      renderStatus: 'ready-for-render',
      publishStatus: 'blocked-until-rendered-and-qa-passed',
    },
  };
  return out;
}

function upgradeTalesSpec(spec, caseDir) {
  const out = structuredClone(spec);
  out.format.width = 1080;
  out.format.height = 1920;
  out.format.fps = 30;
  out.format.durationSec = clamp(out.format.durationSec, 45, 90);
  out.captionPolicy = { mode: 'sidecar', format: 'srt', required: true };
  out.publishTargets = ['youtube'];
  out.scenes = retimeScenes(out.scenes, out.format.durationSec);
  const srtPath = join(caseDir, 'video-maker.output.captions.srt');
  writeFileSync(srtPath, buildSrt(out.scenes));
  out.assets = [
    ...(out.assets ?? []).filter((a) => a.role !== 'sidecar-captions'),
    { id: 'captions', kind: 'other', uri: srtPath, role: 'sidecar-captions' },
  ];
  out.quality = {
    gates: [
      'spec-complete',
      'render-integrity',
      'caption-integrity',
      'three-second-crisis',
      'identity-hook',
      'visual-anchor',
      'cliffhanger',
      'transformative-safety',
      'ai-artifact-review',
      'beat-boundary-frame-sampling',
    ],
    transformativeNote: out.quality?.transformativeNote || out.metadata?.transformative?.note || 'Requires human confirmation before publish.',
    requiresManualReview: true,
  };
  out.metadata = {
    ...out.metadata,
    videoMakerUpgrade: {
      renderer: 'ffmpeg-or-remotion',
      outputResolution: '1080x1920',
      outputFps: 30,
      captionPolicy: 'sidecar-srt',
      generatedCaption: srtPath,
      renderStatus: 'ready-for-render',
      publishStatus: 'blocked-until-rendered-and-qa-passed',
    },
  };
  return out;
}

function completedFixes(kind, input, output) {
  const fixes = [
    `set production format to ${output.format.width}x${output.format.height}@${output.format.fps}`,
    `retimed scenes to ${output.format.durationSec.toFixed(3)}s profile duration`,
    `set caption policy to ${output.captionPolicy.mode}`,
    'added beat-boundary frame sampling gate',
    'blocked publish until render QA passes',
  ];
  if (kind === 'zhibo') {
    fixes.push('locked domestic video targets and platform-variant gate');
  } else {
    fixes.push('generated editable sidecar SRT for YouTube handoff');
    fixes.push('locked story gates: crisis, identity hook, visual anchor, cliffhanger, transformative safety');
  }
  if (input.format.width !== output.format.width || input.format.height !== output.format.height) {
    fixes.push('normalized source draft dimensions into production portrait target');
  }
  return fixes;
}

function retimeScenes(scenes, totalDurationSec) {
  const weights = scenes.map((s) => Math.max(1, String(s.narration ?? '').length));
  const totalWeight = weights.reduce((a, b) => a + b, 0);
  let cursor = 0;
  return scenes.map((scene, i) => {
    const durationSec = i === scenes.length - 1
      ? Math.max(0.1, totalDurationSec - cursor)
      : Math.max(0.1, totalDurationSec * weights[i] / totalWeight);
    const out = {
      ...scene,
      startSec: Number(cursor.toFixed(3)),
      durationSec: Number(durationSec.toFixed(3)),
    };
    cursor += durationSec;
    return out;
  });
}

function buildSrt(scenes) {
  return scenes.map((scene, i) => {
    const start = srtTime(scene.startSec);
    const end = srtTime(scene.startSec + scene.durationSec);
    return `${i + 1}\n${start} --> ${end}\n${scene.narration || scene.visual?.prompt || basename(scene.id)}\n`;
  }).join('\n');
}

function srtTime(sec) {
  const ms = Math.max(0, Math.round(sec * 1000));
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const milli = ms % 1000;
  return `${pad(h)}:${pad(m)}:${pad(s)},${String(milli).padStart(3, '0')}`;
}

function pad(n) {
  return String(n).padStart(2, '0');
}

function clamp(n, min, max) {
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, n));
}
