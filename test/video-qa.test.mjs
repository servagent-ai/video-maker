import test from 'node:test';
import assert from 'node:assert/strict';
import {
  checkModeAspect,
  checkPublishTargets,
  checkSrt,
  checkStoryGates,
  checkVideoAgainstProfile,
  parseSrt,
  videoSummary,
} from '../scripts/lib/video-qa.mjs';

const profile = {
  id: 'zhibo-tech-workflow',
  format: {
    width: 1080,
    height: 1920,
    fps: 30,
    minDurationSec: 45,
    maxDurationSec: 120,
  },
};

const spec = {
  captionPolicy: { mode: 'burned', required: true },
  assets: [],
  format: { width: 1080, height: 1920, fps: 30, durationSec: 60 },
};

function summary(over = {}) {
  return {
    durationSec: 60,
    video: {
      width: 1080,
      height: 1920,
      fps: 30,
      codec: 'h264',
      frames: 1800,
      pixFmt: 'yuv420p',
    },
    audio: {
      codec: 'aac',
      sampleRate: 24000,
      channels: 1,
      durationSec: 60,
      bitrate: 96000,
    },
    ...over,
  };
}

test('videoSummary extracts core stream facts from ffprobe JSON', () => {
  const s = videoSummary({
    format: { duration: '12.5', size: '1000', bit_rate: '64000' },
    streams: [
      { codec_type: 'video', codec_name: 'h264', width: 1080, height: 1920, avg_frame_rate: '30/1', nb_frames: '375', pix_fmt: 'yuv420p' },
      { codec_type: 'audio', codec_name: 'aac', sample_rate: '24000', channels: 1, duration: '12.48', bit_rate: '96000' },
    ],
  });
  assert.equal(s.durationSec, 12.5);
  assert.equal(s.video.width, 1080);
  assert.equal(s.video.height, 1920);
  assert.equal(s.video.fps, 30);
  assert.equal(s.audio.codec, 'aac');
});

test('profile check passes a production-shaped video with nonblank samples', () => {
  const issues = checkVideoAgainstProfile(spec, profile, summary(), [
    { ptsTime: 0, YAVG: 80, YMIN: 0, YMAX: 220, SATAVG: 20 },
    { ptsTime: 30, YAVG: 100, YMIN: 4, YMAX: 240, SATAVG: 18 },
  ]);
  assert.deepEqual(issues, []);
});

test('profile check flags missing audio as fatal', () => {
  const issues = checkVideoAgainstProfile(spec, profile, summary({ audio: null }), []);
  assert.equal(issues.find((i) => i.code === 'missing_audio_stream')?.severity, 'fatal');
});

test('profile check flags resolution mismatch as review issue', () => {
  const issues = checkVideoAgainstProfile(spec, profile, summary({ video: { ...summary().video, width: 540, height: 1174 } }), []);
  assert.equal(issues.find((i) => i.code === 'resolution_mismatch')?.severity, 'soft');
});

test('profile check honors spec resolution before profile default', () => {
  const landscapeSpec = { ...spec, format: { width: 1920, height: 1080, fps: 30, durationSec: 60 } };
  const landscapeSummary = summary({ video: { ...summary().video, width: 1920, height: 1080 } });
  const issues = checkVideoAgainstProfile(landscapeSpec, profile, landscapeSummary, [
    { ptsTime: 0, YAVG: 80, YMIN: 0, YMAX: 220, SATAVG: 20 },
  ]);
  assert.equal(issues.find((i) => i.code === 'resolution_mismatch'), undefined);
});

test('profile check flags too short and too long durations as fatal', () => {
  const shortIssues = checkVideoAgainstProfile(spec, profile, summary({ durationSec: 32 }), []);
  assert.equal(shortIssues.find((i) => i.code === 'duration_too_short')?.severity, 'fatal');

  const longIssues = checkVideoAgainstProfile(spec, profile, summary({ durationSec: 180 }), []);
  assert.equal(longIssues.find((i) => i.code === 'duration_too_long')?.severity, 'fatal');
});

test('profile check flags sampled black or blank frames as fatal', () => {
  const issues = checkVideoAgainstProfile(spec, profile, summary(), [
    { ptsTime: 12, YAVG: 0, YMIN: 0, YMAX: 0, SATAVG: 0 },
  ]);
  assert.equal(issues.find((i) => i.code === 'blank_sampled_frame')?.severity, 'fatal');
});

test('sidecar caption profile requires a declared caption asset', () => {
  const issues = checkVideoAgainstProfile(
    { ...spec, captionPolicy: { mode: 'sidecar', required: true }, assets: [] },
    profile,
    summary(),
    [],
  );
  assert.equal(issues.find((i) => i.code === 'missing_sidecar_caption_asset')?.severity, 'fatal');
});

test('parseSrt parses cue timing and text', () => {
  const cues = parseSrt('1\n00:00:00,000 --> 00:00:02,500\nHello\n\n2\n00:00:02,500 --> 00:00:04,000\nWorld\n');
  assert.equal(cues.length, 2);
  assert.equal(cues[0].startSec, 0);
  assert.equal(cues[0].endSec, 2.5);
  assert.equal(cues[1].text, 'World');
});

test('checkSrt flags overlap, invalid duration, and cue past video end', () => {
  const issues = checkSrt([
    { startSec: 0, endSec: 2, text: 'A' },
    { startSec: 1.5, endSec: 1.25, text: 'B' },
    { startSec: 9, endSec: 12, text: 'C' },
  ], 10);
  assert.equal(issues.find((i) => i.code === 'caption_overlap')?.severity, 'fatal');
  assert.equal(issues.find((i) => i.code === 'caption_non_positive_duration')?.severity, 'fatal');
  assert.equal(issues.find((i) => i.code === 'caption_past_video_end')?.severity, 'fatal');
});

test('mode aspect check preserves landscape ppt and rejects landscape remotion portrait mode', () => {
  const p = {
    modePolicies: {
      'remotion:MIMIC-product-daily': { aspect: 'portrait', width: 1080, height: 1920 },
      'ppt:*': { aspect: 'preserve-source' },
    },
  };
  const landscape = summary({ video: { ...summary().video, width: 1920, height: 1080 } });
  assert.deepEqual(checkModeAspect({ metadata: { modeProfile: 'ppt:dark-tech' } }, p, landscape), []);
  const issues = checkModeAspect({ metadata: { modeProfile: 'remotion:MIMIC-product-daily' } }, p, landscape);
  assert.equal(issues.find((i) => i.code === 'mode_aspect_mismatch')?.severity, 'fatal');
});

test('story gates flag missing Levify requirements and pass a production-shaped hook', () => {
  const levify = {
    id: 'levify-tales',
    storyGates: {
      threeSecondCrisis: true,
      identityHook: true,
      visualAnchorCountMin: 1,
      cliffhanger: true,
      transformativeSafety: true,
    },
  };
  const bad = checkStoryGates({ scenes: [{ startSec: 0, durationSec: 5, narration: 'A calm morning began.', visual: { prompt: 'sunny field' } }], quality: {} }, levify);
  assert.equal(bad.find((i) => i.code === 'missing_three_second_crisis')?.severity, 'fatal');
  assert.equal(bad.find((i) => i.code === 'missing_transformative_note')?.severity, 'fatal');

  const good = checkStoryGates({
    scenes: [
      { startSec: 0, durationSec: 4, narration: 'The last survivor woke beside a burning corpse.', visual: { prompt: 'silver cocoon' }, story: { identityHook: 'last survivor', visualAnchor: 'silver cocoon' } },
      { startSec: 4, durationSec: 50, narration: 'He ran as the enemy closed in.', visual: { prompt: 'chase' } },
      { startSec: 54, durationSec: 10, narration: 'Then the corpse opened its eyes. Why did it have his face?', visual: { prompt: 'duplicate face' } },
    ],
    quality: { transformativeNote: 'Proper nouns removed and narration rewritten.' },
  }, levify);
  assert.deepEqual(good, []);
});

test('publish target gate blocks non-profile automatic targets', () => {
  const issues = checkPublishTargets({ publishTargets: ['youtube', 'douyin'] }, { id: 'levify-tales', platformRules: { autoPublishTargets: ['youtube'] } });
  assert.equal(issues.find((i) => i.code === 'publish_target_not_allowed')?.severity, 'fatal');
});
