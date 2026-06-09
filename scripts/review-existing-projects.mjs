#!/usr/bin/env node
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  checkSrt,
  checkVideoAgainstProfile,
  parseSrt,
  probeVideo,
  readJson,
  sampleFrames,
  videoSummary,
} from './lib/video-qa.mjs';

const ZHIBO_ROOT = process.env.ZHIBO_VIDEOS_DIR ?? 'examples/local/zhibo/videos';
const COMPANY_ROOT = process.env.COMPANY_ROOT ?? 'examples/local/company';
const OUT_ROOT = process.env.VIDEO_MAKER_OUT ?? 'outputs/comparison';

function arg(name, def = undefined) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : def;
}

const limit = Number(arg('limit', '10'));
const outDir = resolve(arg('out', join(OUT_ROOT, new Date().toISOString().replace(/[:.]/g, '-'))));
if (existsSync(outDir)) rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

const zhiboProfile = readJson('profiles/zhibo-tech-workflow.json');
const talesProfile = readJson('profiles/levify-tales.json');

function walk(dir, pred, out = []) {
  let ents = [];
  try { ents = readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of ents) {
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, pred, out);
    else if (pred(p)) out.push(p);
  }
  return out;
}

function runNode(script, args) {
  const r = spawnSync(process.execPath, [script, ...args], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (r.status !== 0) throw new Error(`${script} failed:\n${r.stderr || r.stdout}`);
}

function qa(specPath, profile, videoPath) {
  const spec = readJson(specPath);
  const probe = probeVideo(videoPath);
  const summary = videoSummary(probe);
  const frameSamples = sampleFrames(videoPath, summary, { count: 8, excludeTailSec: 0.75 });
  const issues = checkVideoAgainstProfile(spec, profile, summary, frameSamples);
  for (const asset of spec.assets ?? []) {
    if ((asset.role ?? '').includes('caption') || asset.uri.endsWith('.srt')) {
      if (!existsSync(asset.uri)) {
        issues.push({ severity: 'fatal', code: 'caption_asset_missing', message: `caption asset missing: ${asset.uri}` });
      } else {
        const cues = parseSrt(readFileSync(asset.uri, 'utf8'));
        issues.push(...checkSrt(cues, summary.durationSec));
      }
    }
  }
  return {
    status: issues.some((i) => i.severity === 'fatal') ? 'fail' : issues.some((i) => i.severity === 'soft') ? 'review' : 'pass',
    summary,
    frameSamples,
    issues,
  };
}

function zhiboVideoForProject(projectDir) {
  const id = basename(projectDir);
  const direct = join(projectDir, `${id}-video-volc.mp4`);
  if (existsSync(direct)) return direct;
  const merged = join(projectDir, 'build', 'merged_with_subs.mp4');
  if (existsSync(merged)) return merged;
  return null;
}

function zhiboProjects() {
  return walk(ZHIBO_ROOT, (p) => basename(p) === '.studio.json')
    .map(dirname)
    .filter((d) => existsSync(join(d, 'narrations.json')) && zhiboVideoForProject(d))
    .sort((a, b) => statSync(zhiboVideoForProject(b)).mtimeMs - statSync(zhiboVideoForProject(a)).mtimeMs)
    .slice(0, limit);
}

function novelProjects() {
  return walk(COMPANY_ROOT, (p) => basename(p) === 'storyboard.json')
    .map(dirname)
    .slice(0, limit);
}

function improvementPlan(kind, spec, report) {
  const actions = [];
  const issueCodes = new Set(report.issues.map((i) => i.code));
  if (issueCodes.has('resolution_mismatch')) {
    actions.push('Render final deliverable at profile resolution 1080x1920, or explicitly mark lower-resolution drafts as non-publishable.');
  }
  if (issueCodes.has('duration_too_short')) {
    actions.push('Retune timeline duration to the profile floor; do not publish short drafts as production shorts.');
  }
  if (issueCodes.has('duration_too_long')) {
    actions.push('Cut or split the video so it stays within profile duration bounds.');
  }
  if (issueCodes.has('missing_sidecar_caption_asset') || issueCodes.has('caption_asset_missing')) {
    actions.push('Generate and attach the required sidecar captions before YouTube publish.');
  }
  if (issueCodes.has('blank_sampled_frame')) {
    actions.push('Review sampled frame positions, remove unexpected blank/black sections, and add beat-boundary visual QA.');
  }
  if (kind === 'zhibo') {
    actions.push('Increase visual density using at least four visual units per short: UI/card/browser/terminal/data/conclusion.');
    actions.push('Keep burned subtitles in the final upload artifact and verify the final MP4, not only preview captions.');
    actions.push('Generate per-platform variants only after QA passes.');
  }
  if (kind === 'levify-tales') {
    actions.push('Verify first 3 seconds contain crisis, then identity hook, visual anchor, and cliffhanger.');
    actions.push('Run AI artifact review on hero keyframes before rendering/publishing.');
    actions.push('Keep captions as editable SRT sidecar for YouTube.');
  }
  return [...new Set(actions)];
}

function writeCase(kind, projectDir, videoPath, profile) {
  const id = basename(projectDir);
  const caseDir = join(outDir, kind, id);
  mkdirSync(caseDir, { recursive: true });
  const specPath = join(caseDir, 'video-maker.spec.json');
  if (kind === 'zhibo') {
    runNode('scripts/import-zhibo-project.mjs', ['--project', projectDir, '--out', specPath]);
  } else {
    runNode('scripts/import-novel-video.mjs', ['--project', projectDir, '--out', specPath]);
  }
  const spec = readJson(specPath);
  const report = videoPath ? qa(specPath, profile, videoPath) : {
    status: 'fail',
    summary: null,
    frameSamples: [],
    issues: [{ severity: 'fatal', code: 'missing_video_output', message: 'project has storyboard but no video.mp4 output' }],
  };
  const review = {
    kind,
    id,
    sourceProjectDir: projectDir,
    sourceVideo: videoPath,
    importedSpec: specPath,
    baseline: report,
    videoMakerOutput: {
      spec,
      improvementPlan: improvementPlan(kind, spec, report),
    },
  };
  writeFileSync(join(caseDir, 'review.json'), JSON.stringify(review, null, 2));
  return review;
}

const reviews = [];
for (const projectDir of zhiboProjects()) {
  reviews.push(writeCase('zhibo', projectDir, zhiboVideoForProject(projectDir), zhiboProfile));
}
for (const projectDir of novelProjects()) {
  const videoPath = existsSync(join(projectDir, 'video.mp4')) ? join(projectDir, 'video.mp4') : null;
  reviews.push(writeCase('levify-tales', projectDir, videoPath, talesProfile));
}

const lines = [];
lines.push('# Existing Project Comparison');
lines.push('');
lines.push(`Output dir: \`${outDir}\``);
lines.push('');
lines.push('## Coverage');
lines.push('');
lines.push(`- zhibo cases: ${reviews.filter((r) => r.kind === 'zhibo').length}/${limit}`);
lines.push(`- levify-tales cases: ${reviews.filter((r) => r.kind === 'levify-tales').length}/${limit}`);
if (reviews.filter((r) => r.kind === 'levify-tales').length < limit) {
  lines.push('- levify-tales has fewer than 10 local storyboard/video outputs on this machine; restore the shared novel-videos directory to run the full 10.');
}
lines.push('');
lines.push('## Cases');
lines.push('');
for (const r of reviews) {
  const fatals = r.baseline.issues.filter((i) => i.severity === 'fatal').length;
  const soft = r.baseline.issues.filter((i) => i.severity === 'soft').length;
  lines.push(`- ${r.kind} / ${r.id}: ${r.baseline.status} (${fatals} fatal, ${soft} soft) -> \`${r.kind}/${r.id}/review.json\``);
}
lines.push('');
lines.push('## Review Rule');
lines.push('');
lines.push('The generated `video-maker.spec.json` is our normalized output for review. `review.json` compares the current project artifact against the target production profile and lists the actions required before a higher-quality render/publish pass.');

writeFileSync(join(outDir, 'SUMMARY.md'), lines.join('\n') + '\n');
console.log(`wrote ${outDir}`);
