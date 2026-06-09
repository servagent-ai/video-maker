import { existsSync, readFileSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

export const DEFAULT_FFPROBE = process.env.FFPROBE_BIN ?? '/opt/homebrew/bin/ffprobe';
export const DEFAULT_FFMPEG = process.env.FFMPEG_BIN ?? '/opt/homebrew/bin/ffmpeg';

export function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

export function runJson(cmd, args) {
  const r = spawnSync(cmd, args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (r.status !== 0) {
    throw new Error(`${cmd} failed: ${r.stderr || r.stdout}`);
  }
  return JSON.parse(r.stdout);
}

export function probeVideo(videoPath, ffprobe = DEFAULT_FFPROBE) {
  return runJson(ffprobe, [
    '-v', 'error',
    '-print_format', 'json',
    '-show_format',
    '-show_streams',
    videoPath,
  ]);
}

export function videoSummary(probe) {
  const video = probe.streams.find((s) => s.codec_type === 'video');
  const audio = probe.streams.find((s) => s.codec_type === 'audio');
  const durationSec = Number(probe.format?.duration ?? video?.duration ?? 0);
  const fps = parseRate(video?.avg_frame_rate || video?.r_frame_rate || '0/1');
  return {
    durationSec,
    sizeBytes: Number(probe.format?.size ?? 0),
    bitrate: Number(probe.format?.bit_rate ?? 0),
    video: video ? {
      codec: video.codec_name,
      width: Number(video.width),
      height: Number(video.height),
      fps,
      frames: Number(video.nb_frames ?? Math.round(durationSec * fps)),
      pixFmt: video.pix_fmt,
    } : null,
    audio: audio ? {
      codec: audio.codec_name,
      sampleRate: Number(audio.sample_rate ?? 0),
      channels: Number(audio.channels ?? 0),
      durationSec: Number(audio.duration ?? 0),
      bitrate: Number(audio.bit_rate ?? 0),
    } : null,
  };
}

function parseRate(rate) {
  const [a, b] = String(rate).split('/').map(Number);
  if (!a || !b) return 0;
  return a / b;
}

export function parseSrt(text) {
  const blocks = text.replace(/\r/g, '').split(/\n\s*\n/).filter((b) => b.trim());
  return blocks.map((block) => {
    const lines = block.split('\n');
    const timingLine = lines.find((l) => l.includes('-->')) ?? '';
    const [startRaw, endRaw] = timingLine.split('-->').map((s) => s?.trim());
    return {
      startSec: parseSrtTime(startRaw),
      endSec: parseSrtTime(endRaw),
      text: lines.slice(lines.indexOf(timingLine) + 1).join('\n').trim(),
    };
  }).filter((c) => Number.isFinite(c.startSec) && Number.isFinite(c.endSec));
}

function parseSrtTime(s) {
  const m = String(s ?? '').match(/^(\d+):(\d{2}):(\d{2})[,.](\d{3})$/);
  if (!m) return Number.NaN;
  return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) + Number(m[4]) / 1000;
}

export function checkSrt(cues, videoDurationSec) {
  const issues = [];
  let prevEnd = 0;
  cues.forEach((cue, i) => {
    if (cue.endSec <= cue.startSec) {
      issues.push({ severity: 'fatal', code: 'caption_non_positive_duration', message: `caption ${i + 1} has non-positive duration` });
    }
    if (cue.startSec < prevEnd - 0.001) {
      issues.push({ severity: 'fatal', code: 'caption_overlap', message: `caption ${i + 1} overlaps previous cue` });
    }
    if (cue.endSec > videoDurationSec + 0.25) {
      issues.push({ severity: 'fatal', code: 'caption_past_video_end', message: `caption ${i + 1} ends after video duration` });
    }
    if (cue.text.length > 110) {
      issues.push({ severity: 'soft', code: 'caption_too_long', message: `caption ${i + 1} is ${cue.text.length} chars` });
    }
    prevEnd = cue.endSec;
  });
  return issues;
}

export function sampleFrames(videoPath, summary, opts = {}) {
  const ffmpeg = opts.ffmpeg ?? DEFAULT_FFMPEG;
  const count = opts.count ?? 8;
  const duration = summary.durationSec;
  if (!duration || !summary.video?.fps) return [];
  const safeEnd = Math.max(0, duration - (opts.excludeTailSec ?? 0.75));
  const frames = [];
  for (let i = 0; i < count; i++) {
    const t = count === 1 ? 0 : (safeEnd * i) / (count - 1);
    frames.push(Math.max(0, Math.round(t * summary.video.fps)));
  }
  return signalStatsAtFrames(videoPath, [...new Set(frames)], ffmpeg);
}

function signalStatsAtFrames(videoPath, frames, ffmpeg) {
  if (frames.length === 0) return [];
  const selectExpr = frames.map((n) => `eq(n\\,${n})`).join('+');
  const vf = `select='${selectExpr}',signalstats,metadata=print`;
  const r = spawnSync(ffmpeg, [
    '-hide_banner',
    '-i', videoPath,
    '-vf', vf,
    '-an',
    '-frames:v', String(frames.length),
    '-f', 'null',
    '-',
  ], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (r.status !== 0) {
    return [{ error: r.stderr || r.stdout }];
  }
  const lines = `${r.stdout}\n${r.stderr}`.split('\n');
  const statsFrames = [];
  let current = null;
  for (const line of lines) {
    const fm = line.match(/frame:(\d+)\s+pts:\S+\s+pts_time:([0-9.]+)/);
    if (fm) {
      current = { sampleIndex: statsFrames.length, ptsTime: Number(fm[2]) };
      statsFrames.push(current);
      continue;
    }
    const sm = line.match(/lavfi\.signalstats\.([A-Z]+)=([0-9.]+)/);
    if (sm && current) current[sm[1]] = Number(sm[2]);
  }
  return statsFrames;
}

export function checkVideoAgainstProfile(spec, profile, summary, frameStats) {
  const issues = [];
  const requiredW = profile.format?.width ?? spec.format?.width;
  const requiredH = profile.format?.height ?? spec.format?.height;
  const fps = profile.format?.fps ?? spec.format?.fps;
  const minDur = profile.format?.minDurationSec;
  const maxDur = profile.format?.maxDurationSec;
  const tolerance = 0.75;

  if (!summary.video) issues.push({ severity: 'fatal', code: 'missing_video_stream', message: 'missing video stream' });
  if (spec.captionPolicy?.required && spec.captionPolicy.mode !== 'none' && spec.captionPolicy.mode === 'sidecar') {
    const hasCaptionAsset = (spec.assets ?? []).some((a) => /caption|srt/i.test(`${a.role ?? ''} ${a.uri ?? ''}`));
    if (!hasCaptionAsset) issues.push({ severity: 'fatal', code: 'missing_sidecar_caption_asset', message: 'sidecar captions are required but no caption asset is declared' });
  }
  if (!summary.audio) issues.push({ severity: 'fatal', code: 'missing_audio_stream', message: 'missing audio stream' });
  if (summary.video && (summary.video.width !== requiredW || summary.video.height !== requiredH)) {
    issues.push({
      severity: 'soft',
      code: 'resolution_mismatch',
      message: `expected ${requiredW}x${requiredH}, got ${summary.video.width}x${summary.video.height}`,
    });
  }
  if (summary.video && fps && Math.abs(summary.video.fps - fps) > 0.01) {
    issues.push({ severity: 'soft', code: 'fps_mismatch', message: `expected ${fps}fps, got ${summary.video.fps}` });
  }
  if (minDur && summary.durationSec < minDur - tolerance) {
    issues.push({ severity: 'fatal', code: 'duration_too_short', message: `duration ${summary.durationSec.toFixed(2)}s below ${minDur}s` });
  }
  if (maxDur && summary.durationSec > maxDur + tolerance) {
    issues.push({ severity: 'fatal', code: 'duration_too_long', message: `duration ${summary.durationSec.toFixed(2)}s above ${maxDur}s` });
  }
  for (const f of frameStats) {
    if (f.error) {
      issues.push({ severity: 'soft', code: 'frame_sampling_failed', message: f.error.slice(0, 180) });
      continue;
    }
    const black = Number(f.YAVG ?? 0) < 2 && Number(f.SATAVG ?? 0) < 2;
    const nearBlank = Number(f.YMAX ?? 255) - Number(f.YMIN ?? 0) < 3 && Number(f.SATAVG ?? 0) < 2;
    if (black || nearBlank) {
      issues.push({ severity: 'fatal', code: 'blank_sampled_frame', message: `blank/black sampled frame near ${f.ptsTime?.toFixed?.(2) ?? '?'}s` });
    }
  }
  issues.push(...checkModeAspect(spec, profile, summary));
  issues.push(...checkTimelineAudioFit(spec));
  issues.push(...checkVisualDensity(spec, profile));
  issues.push(...checkStoryGates(spec, profile));
  issues.push(...checkPublishTargets(spec, profile));
  return issues;
}

export function checkModeAspect(spec, profile, summary) {
  const issues = [];
  const modeKey = spec.metadata?.modeProfile ?? spec.metadata?.profile ?? spec.mode;
  if (!modeKey || !summary.video || !profile.modePolicies) return issues;
  const policy = resolveModePolicy(profile.modePolicies, modeKey);
  if (!policy) return issues;
  const actual = summary.video.width >= summary.video.height ? 'landscape' : 'portrait';
  const expected = policy.aspect;
  if (expected === 'portrait' && actual !== 'portrait') {
    issues.push({ severity: 'fatal', code: 'mode_aspect_mismatch', message: `${modeKey} requires portrait output` });
  }
  if (expected === 'landscape' && actual !== 'landscape') {
    issues.push({ severity: 'fatal', code: 'mode_aspect_mismatch', message: `${modeKey} requires landscape output` });
  }
  if (policy.width && policy.height && (summary.video.width !== policy.width || summary.video.height !== policy.height)) {
    issues.push({ severity: 'fatal', code: 'mode_aspect_mismatch', message: `${modeKey} expected ${policy.width}x${policy.height}, got ${summary.video.width}x${summary.video.height}` });
  }
  return issues;
}

function resolveModePolicy(policies, modeKey) {
  if (policies[modeKey]) return policies[modeKey];
  for (const [pattern, policy] of Object.entries(policies)) {
    if (pattern.endsWith('*') && modeKey.startsWith(pattern.slice(0, -1))) return policy;
  }
  return null;
}

export function checkTimelineAudioFit(spec) {
  const issues = [];
  for (const scene of spec.scenes ?? []) {
    const measured = Number(scene.audio?.durationSec ?? scene.timeline?.audioDurationSec ?? 0);
    const padding = Number(scene.audio?.paddingSec ?? scene.timeline?.audioPaddingSec ?? 0.15);
    if (measured > 0 && Number(scene.durationSec) + 0.001 < measured + padding) {
      issues.push({
        severity: 'fatal',
        code: 'timeline_audio_cutoff',
        message: `${scene.id ?? 'scene'} duration ${scene.durationSec}s is shorter than measured audio ${measured}s plus padding`,
      });
    }
  }
  return issues;
}

export function checkVisualDensity(spec, profile) {
  const density = profile.density;
  if (!density) return [];
  const scenes = spec.scenes ?? [];
  const issues = [];
  if (density.minBeatCount && scenes.length < density.minBeatCount) {
    issues.push({ severity: 'fatal', code: 'low_visual_density', message: `expected at least ${density.minBeatCount} beats, got ${scenes.length}` });
  }
  if (density.maxBeatDurationSec) {
    const long = scenes.find((s) => Number(s.durationSec) > density.maxBeatDurationSec);
    if (long) issues.push({ severity: 'fatal', code: 'low_visual_density', message: `${long.id ?? 'scene'} exceeds max beat duration ${density.maxBeatDurationSec}s` });
  }
  if (density.minVisualKindCount) {
    const kinds = new Set(scenes.map((s) => s.visual?.kind).filter(Boolean));
    if (kinds.size < density.minVisualKindCount) {
      issues.push({ severity: 'fatal', code: 'low_visual_density', message: `expected ${density.minVisualKindCount} visual kinds, got ${kinds.size}` });
    }
  }
  return issues;
}

export function checkStoryGates(spec, profile) {
  if (!profile.storyGates) return [];
  const issues = [];
  const scenes = spec.scenes ?? [];
  const allText = scenes.map((s) => `${s.narration ?? ''} ${s.visual?.prompt ?? ''}`).join(' ');
  const first = scenes.find((s) => Number(s.startSec ?? 0) <= 3) ?? scenes[0];
  const firstText = `${first?.narration ?? ''} ${first?.visual?.prompt ?? ''}`.toLowerCase();
  const last = scenes[scenes.length - 1];
  const lastText = `${last?.narration ?? ''} ${last?.visual?.prompt ?? ''}`.toLowerCase();

  if (profile.storyGates.threeSecondCrisis && !/(burn|dead|death|kill|trap|collapse|betray|blood|chase|threat|danger|crisis|woke|body|corpse|monster|enemy|attack|fell|fall)/i.test(firstText)) {
    issues.push({ severity: 'fatal', code: 'missing_three_second_crisis', message: 'first three seconds lack a clear crisis hook' });
  }
  if (profile.storyGates.identityHook && !scenes.some((s) => s.story?.identityHook || /(last survivor|prince|orphan|heir|chosen|exile|hunter|villain|duplicate|immortal)/i.test(`${s.narration ?? ''} ${s.visual?.prompt ?? ''}`))) {
    issues.push({ severity: 'fatal', code: 'missing_identity_hook', message: 'episode lacks identity hook' });
  }
  const anchors = scenes.filter((s) => s.story?.visualAnchor || s.story?.stimPoint === true).length;
  if (profile.storyGates.visualAnchorCountMin && anchors < profile.storyGates.visualAnchorCountMin) {
    issues.push({ severity: 'fatal', code: 'missing_visual_anchor', message: `expected at least ${profile.storyGates.visualAnchorCountMin} visual anchor` });
  }
  if (profile.storyGates.cliffhanger && !/[?？]|why |then |suddenly|but |revealed|door opened|face|secret|next/i.test(lastText)) {
    issues.push({ severity: 'fatal', code: 'missing_cliffhanger', message: 'ending lacks unresolved question or cliffhanger' });
  }
  if (profile.storyGates.transformativeSafety && !(spec.quality?.transformativeNote || spec.transformative?.note || spec.metadata?.transformative?.note)) {
    issues.push({ severity: 'fatal', code: 'missing_transformative_note', message: 'transformative safety note is missing' });
  }
  if (spec.transformative?.sourceProperNouns?.some((name) => new RegExp(`\\b${escapeRegExp(name)}\\b`, 'i').test(allText))) {
    issues.push({ severity: 'fatal', code: 'source_proper_noun_leak', message: 'source proper noun appears in narration or prompt' });
  }
  return issues;
}

export function checkPublishTargets(spec, profile) {
  const allowed = profile.platformRules?.autoPublishTargets;
  if (!Array.isArray(allowed)) return [];
  return (spec.publishTargets ?? [])
    .filter((target) => !allowed.includes(target))
    .map((target) => ({ severity: 'fatal', code: 'publish_target_not_allowed', message: `${target} is not an allowed auto-publish target for ${profile.id}` }));
}

function escapeRegExp(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function writeReport(report, outPath) {
  const target = outPath ?? join(mkdtempSync(join(tmpdir(), 'video-maker-report-')), 'quality-report.json');
  writeFileSync(target, JSON.stringify(report, null, 2));
  return resolve(target);
}
