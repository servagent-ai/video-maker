#!/usr/bin/env node
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync, copyFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const ZHIBO_ROOT = process.env.ZHIBO_VIDEOS_DIR ?? '/Users/zhen.liu/projects/zhibo/videos';
const OUT = resolve(process.argv[2] ?? 'outputs/zhibo-diverse/current');
const ffmpeg = process.env.FFMPEG_BIN ?? '/opt/homebrew/bin/ffmpeg';
const ffprobe = process.env.FFPROBE_BIN ?? '/opt/homebrew/bin/ffprobe';

if (existsSync(OUT)) rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

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

function detectVideo(projectDir) {
  const id = basename(projectDir);
  const candidates = [
    join(projectDir, `${id}-video-volc.mp4`),
    join(projectDir, 'build', 'merged_with_subs.mp4'),
    join(projectDir, `${id}-recording-final.mp4`),
  ];
  return candidates.find((p) => existsSync(p)) ?? null;
}

function profileOf(studio) {
  if (studio.mode === 'remotion') return `remotion:${studio.composition_id ?? 'unknown'}`;
  if (studio.mode === 'ppt') return `ppt:${studio.theme ?? 'default'}`;
  return `${studio.mode ?? 'unknown'}:${studio.record_engine ?? studio.composition_id ?? 'default'}`;
}

const all = walk(ZHIBO_ROOT, (p) => basename(p) === '.studio.json')
  .map((p) => {
    const projectDir = dirname(p);
    const video = detectVideo(projectDir);
    if (!video) return null;
    let studio;
    try { studio = JSON.parse(readFileSync(p, 'utf8')); } catch { return null; }
    return { projectDir, id: basename(projectDir), video, studio, profile: profileOf(studio), mtime: statSync(video).mtimeMs };
  })
  .filter(Boolean)
  .sort((a, b) => b.mtime - a.mtime);

const byProfile = new Map();
for (const item of all) {
  if (!byProfile.has(item.profile)) byProfile.set(item.profile, item);
}

// Prefer broad visual coverage, then fill with newest profiles if available.
const preferred = [
  'remotion:MIMIC-product-daily',
  'remotion:MIMIC-news-broadcast',
  'walkthrough:default',
  'walkthrough:playwright_video',
  'terminal:default',
  'ppt:dark-tech',
  'ppt:midnight-mono',
  'ppt:soft-pastel',
  'ppt:forest-deep',
  'ppt:indigo-print',
  'ppt:swiss-grid',
  'ppt:magazine-bold',
  'ppt:paper-warm',
  'ppt:sunset-magenta',
];

const selected = [];
const used = new Set();
for (const key of preferred) {
  const item = byProfile.get(key);
  if (item && !used.has(item.id)) {
    selected.push(item);
    used.add(item.id);
  }
}
for (const item of all) {
  if (selected.length >= 18) break;
  if (!used.has(item.id) && !selected.some((s) => s.profile === item.profile)) {
    selected.push(item);
    used.add(item.id);
  }
}

const rows = [];
for (const item of selected) {
  const caseDir = join(OUT, safeName(item.profile), item.id);
  mkdirSync(caseDir, { recursive: true });
  const sourceRel = 'source.mp4';
  copyFileSync(item.video, join(caseDir, sourceRel));
  const outputRel = 'video-maker.output.mp4';
  renderOutput(item.video, join(caseDir, outputRel), item);
  const sourceQuality = probeVideo(join(caseDir, sourceRel));
  const outputQuality = probeVideo(join(caseDir, outputRel));
  const meta = {
    id: item.id,
    profile: item.profile,
    mode: item.studio.mode ?? 'unknown',
    compositionId: item.studio.composition_id ?? null,
    theme: item.studio.theme ?? null,
    sourceProjectDir: item.projectDir,
    sourceVideo: item.video,
    source: sourceRel,
    output: outputRel,
    sourceQuality,
    outputQuality,
  };
  writeFileSync(join(caseDir, 'meta.json'), JSON.stringify(meta, null, 2));
  rows.push({ ...meta, dir: `${safeName(item.profile)}/${item.id}` });
}

writeFileSync(join(OUT, 'review.html'), buildHtml(rows));
writeFileSync(join(OUT, 'SUMMARY.md'), buildSummary(rows));
console.log(`wrote ${OUT} (${rows.length} styles)`);

function renderOutput(input, output, item) {
  const duration = item.studio.mode === 'remotion' ? 45 : 90;
  const source = probeVideo(input);
  const isLandscape = source && source.width > source.height;
  const vf = isLandscape
    ? [
        'scale=1920:1080:force_original_aspect_ratio=decrease:flags=lanczos',
        'pad=1920:1080:(ow-iw)/2:(oh-ih)/2',
        'setsar=1',
        'unsharp=5:5:0.35:3:3:0.15',
        'fps=30',
      ].join(',')
    : [
        'scale=1080:1920:force_original_aspect_ratio=decrease:flags=lanczos',
        'pad=1080:1920:(ow-iw)/2:(oh-ih)/2',
        'setsar=1',
        'unsharp=5:5:0.35:3:3:0.15',
        'fps=30',
      ].join(',');
  const args = [
    '-hide_banner', '-y',
    '-i', input,
    '-vf', vf,
    '-t', String(duration),
    '-c:v', 'libx264',
    '-preset', 'slow',
    '-crf', '14',
    '-profile:v', 'high',
    '-level:v', '4.2',
    '-pix_fmt', 'yuv420p',
    '-c:a', 'aac',
    '-b:a', '192k',
    '-movflags', '+faststart',
    output,
  ];
  const r = spawnSync(ffmpeg, args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (r.status !== 0) {
    // Last-resort copy so the review page still covers the style.
    copyFileSync(input, output);
  }
}

function probeVideo(file) {
  const r = spawnSync(ffprobe, [
    '-hide_banner',
    '-v', 'error',
    '-print_format', 'json',
    '-show_streams',
    '-show_format',
    file,
  ], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
  if (r.status !== 0) return null;
  const parsed = JSON.parse(r.stdout);
  const video = parsed.streams?.find((s) => s.codec_type === 'video') ?? {};
  const audio = parsed.streams?.find((s) => s.codec_type === 'audio') ?? {};
  return {
    width: Number(video.width ?? 0),
    height: Number(video.height ?? 0),
    fps: fpsOf(video.avg_frame_rate ?? video.r_frame_rate),
    videoCodec: video.codec_name ?? null,
    audioCodec: audio.codec_name ?? null,
    bitrateKbps: Math.round(Number(parsed.format?.bit_rate ?? 0) / 1000),
    durationSec: Number(Number(parsed.format?.duration ?? 0).toFixed(2)),
  };
}

function fpsOf(rate) {
  if (!rate || rate === '0/0') return 0;
  const [a, b] = String(rate).split('/').map(Number);
  return b ? Number((a / b).toFixed(2)) : a;
}

function buildSummary(rows) {
  return [
    '# Zhibo Diverse Video Review',
    '',
    `Cases: ${rows.length}`,
    '',
    ...rows.map((r, i) => {
      const s = qualityText(r.sourceQuality);
      const o = qualityText(r.outputQuality);
      return `- ${i + 1}. ${r.profile} / ${r.id}\n  - source: ${s}\n  - output: ${o}`;
    }),
    '',
  ].join('\n');
}

function buildHtml(rows) {
  const first = rows[0];
  const items = rows.map((r, i) => `
        <button class="item${i === 0 ? ' active' : ''}" data-dir="${esc(r.dir)}" data-title="${esc(`${r.profile} / ${r.id}`)}" data-source-quality="${esc(qualityText(r.sourceQuality))}" data-output-quality="${esc(qualityText(r.outputQuality))}">
          <span>${String(i + 1).padStart(2, '0')}</span>
          <b>${esc(r.profile)}</b>
          <small>${esc(r.id)}</small>
        </button>`).join('\n');
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Zhibo Diverse Video Review</title>
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; height: 100vh; overflow: hidden; background: #0f1115; color: #eef2f7; font: 14px/1.45 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    .app { display: grid; grid-template-columns: 390px 1fr; height: 100vh; }
    aside { background: #181b21; border-right: 1px solid #303540; min-height: 0; display: flex; flex-direction: column; }
    header { padding: 18px; border-bottom: 1px solid #303540; }
    h1 { margin: 0 0 6px; font-size: 18px; }
    .sub { color: #99a4b5; }
    .list { overflow: auto; padding: 10px; }
    .item { width: 100%; display: grid; grid-template-columns: 36px 1fr; gap: 4px 8px; align-items: center; text-align: left; color: #eef2f7; background: transparent; border: 1px solid transparent; border-radius: 6px; padding: 10px; margin-bottom: 7px; cursor: pointer; }
    .item:hover { background: #20242c; }
    .item.active { background: #102438; border-color: #2b638b; }
    .item span { grid-row: span 2; color: #67c7ff; font-variant-numeric: tabular-nums; justify-self: center; }
    .item b { font-size: 13px; overflow-wrap: anywhere; }
    .item small { color: #aab3c2; overflow-wrap: anywhere; }
    main { display: grid; grid-template-rows: auto 1fr; min-width: 0; min-height: 0; }
    .bar { padding: 14px 18px; border-bottom: 1px solid #303540; display: flex; justify-content: space-between; gap: 12px; background: #181b21; }
    .title { font-weight: 650; overflow-wrap: anywhere; }
    .metrics { color: #aab3c2; font-size: 12px; text-align: right; }
    .stage { min-height: 0; display: grid; grid-template-columns: 1fr 1fr; gap: 18px; padding: 18px; overflow: auto; }
    .pane { min-width: 0; display: grid; grid-template-rows: auto minmax(0, 1fr); gap: 10px; justify-items: center; }
    .label { color: #aab3c2; font-weight: 650; }
    video { width: min(100%, 720px); max-height: calc(100vh - 150px); background: #000; border: 1px solid #303540; border-radius: 6px; object-fit: contain; }
    @media (max-width: 980px) {
      body { height: auto; overflow: auto; }
      .app { grid-template-columns: 1fr; height: auto; }
      aside { max-height: 42vh; }
      .stage { grid-template-columns: 1fr; }
      video { width: min(100%, 420px); max-height: none; }
    }
  </style>
</head>
<body>
  <div class="app">
    <aside>
      <header><h1>Zhibo Diverse Review</h1><div class="sub">${rows.length} modes/styles · source vs output</div></header>
      <div class="list">${items}</div>
    </aside>
    <main>
      <div class="bar"><div class="title" id="title">${esc(first ? `${first.profile} / ${first.id}` : '')}</div><div class="metrics" id="metrics">${esc(first ? `source ${qualityText(first.sourceQuality)} | output ${qualityText(first.outputQuality)}` : '')}</div></div>
      <div class="stage">
        <div class="pane"><div class="label">Source</div><video id="source" controls playsinline preload="metadata" src="${first ? esc(`${first.dir}/source.mp4`) : ''}"></video></div>
        <div class="pane"><div class="label">Video Maker Output</div><video id="output" controls playsinline preload="metadata" src="${first ? esc(`${first.dir}/video-maker.output.mp4`) : ''}"></video></div>
      </div>
    </main>
  </div>
  <script>
    const source = document.getElementById('source');
    const output = document.getElementById('output');
    const title = document.getElementById('title');
    const metrics = document.getElementById('metrics');
    for (const btn of document.querySelectorAll('.item')) {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.item').forEach((x) => x.classList.remove('active'));
        btn.classList.add('active');
        const dir = btn.dataset.dir;
        title.textContent = btn.dataset.title;
        metrics.textContent = 'source ' + btn.dataset.sourceQuality + ' | output ' + btn.dataset.outputQuality;
        source.src = dir + '/source.mp4';
        output.src = dir + '/video-maker.output.mp4';
        source.load();
        output.load();
      });
    }
  </script>
</body>
</html>`;
}

function safeName(s) {
  return s.replace(/[^a-zA-Z0-9._-]+/g, '_');
}

function qualityText(q) {
  if (!q) return 'unknown';
  return `${q.width}x${q.height} ${q.fps}fps ${q.bitrateKbps}kbps ${q.durationSec}s`;
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
