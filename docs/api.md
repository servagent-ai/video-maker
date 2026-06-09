# Video Maker API

This document is the public API contract for agents and callers that use `video-maker`.

Every API change must update this file in the same change. If a command, JSON field, profile name, output path, report field, or quality rule changes, update the affected section before handoff.

## API Principles

- `video-maker` is a video production library and orchestration layer, not a publishing script.
- Callers provide portable specs, source-project inputs, or existing videos; `video-maker` returns renderable outputs, review packages, and QA reports.
- Prefer file-based APIs so `zhibo`, `company/side-hustle`, Codex, Claude Code, Gemini CLI, and future agents can call the library without sharing process state.
- Keep render engines pluggable. Current adapters use Remotion-style video, HyperFrames-style HTML/video, and FFmpeg post-processing.
- Do not force one aspect ratio across all modes. Preserve the source or profile intent: portrait shorts stay portrait; PPT/screen/walkthrough modes may remain landscape when the caller or source mode requires it.
- Quality gates are part of the API. A render is not production-ready until the matching QA API returns `pass` or an explicit manual review package is produced.

## Public Artifacts

| Artifact | Path | Stability | Purpose |
| --- | --- | --- | --- |
| Video spec schema | `src/schema/video-spec.schema.json` | Public | Portable input contract for new renders. |
| Profiles | `profiles/*.json` | Public | Production requirements by caller/workflow. |
| Example specs | `specs/examples/*.json` | Public | Agent-readable examples for callers. |
| Requirements matrix | `docs/project-requirements.md` | Public for agents | Executable requirements for `zhibo` and `Levify Tales`. |
| QA library | `scripts/lib/video-qa.mjs` | Public for agents | Video probing, frame sampling, caption checks, profile checks. |
| CLI scripts | `scripts/*.mjs` | Public for agents | File-based APIs for validation, import, render review, QA, and comparison. |
| Review outputs | `outputs/**/review.html` | Public review artifact | Human review UI with source/output comparison. |

## API 1: VideoSpec

Use this API when a caller wants `video-maker` to produce or validate a video from a portable description.

Schema: `src/schema/video-spec.schema.json`

Required top-level fields:

```json
{
  "id": "unique-video-id",
  "profile": "zhibo-tech-workflow",
  "format": {
    "width": 1080,
    "height": 1920,
    "fps": 30,
    "durationSec": 60
  },
  "language": "en",
  "captionPolicy": {
    "mode": "burned",
    "format": "srt",
    "required": true
  },
  "scenes": [],
  "publishTargets": ["kuaishou"],
  "quality": {
    "gates": ["resolution", "fps", "audio", "captions", "nonblank"]
  }
}
```

Current supported profiles:

| Profile | Caller | Expected Use |
| --- | --- | --- |
| `zhibo-tech-workflow` | `zhibo` | AI/news/workflow short videos, burned captions, usually portrait. |
| `levify-tales` | `company/side-hustle` / `novel-pipeline` | English story videos, sidecar captions, YouTube-oriented review. |

Profile JSONs are public contracts. A profile may include:

- `format`: default width, height, FPS, duration bounds, and allowed aspect families.
- `modePolicies`: source-project modes and their output/aspect/caption policy.
- `qualityGates`: gate IDs that QA or render adapters must satisfy.
- `density`: visual rhythm floors.
- `storyGates`: story requirements for narrative videos.
- `platformRules`: allowed automatic publish targets and platform quirks.
- `voice`: default narration constraints.

Optional render/style fields:

- `style.id`: style key from `catalogs/video-styles.json`.
- `style.elements`: required or preferred visual elements for the render.
- `render.engine`: requested render engine.
- `render.adapter`: adapter mode such as `native`, `external-command`, or `source-video`.
- `render.externalCommand`: caller-supplied command for private/native source-project renderers.
- `render.sourceVideo`: already rendered source video to normalize/QA/handoff.
- `render.assetPolicy`: `required` or `fallback-ok`.

Scene-level optional fields:

- `scene.audio.uri`: per-scene narration/audio file.
- `scene.audio.durationSec`: measured audio duration used for retiming.
- `scene.visual.image`: direct image path.
- `scene.visual.assetRefs`: references top-level assets by id.
- `scene.metadata`: source-project-specific non-secret metadata.

Validation command:

```bash
npm run validate
node scripts/validate-spec.mjs specs/examples
node scripts/validate-spec.mjs path/to/spec.json
```

Validation output:

- Success: `ok: validated <n> spec file(s)`
- Failure: one error per line and exit code `1`

Agent rule:

- Add new fields to `src/schema/video-spec.schema.json`, examples, and this section together.
- Do not remove or rename fields without a migration note in this document.

## API 2: Source Project Import

Use this API to convert local project outputs into `video-maker` reviewable inputs.

### zhibo Import

Command:

```bash
npm run import:zhibo -- <zhibo-project-dir> <out-dir>
node scripts/import-zhibo-project.mjs <zhibo-project-dir> <out-dir>
```

Accepted source inputs:

- `.studio.json`
- `<project-id>-video-volc.mp4`
- `build/merged_with_subs.mp4`
- `<project-id>-recording-final.mp4`

Mode metadata read from `.studio.json`:

- `mode`
- `composition_id`
- `theme`
- `record_engine`

Output:

- Imported source assets under caller-provided `<out-dir>`
- Metadata describing source mode and detected video

### Novel/Side Hustle Import

Command:

```bash
npm run import:novel -- <novel-project-dir> <out-dir>
node scripts/import-novel-video.mjs <novel-project-dir> <out-dir>
```

Expected use:

- Bring `Levify Tales` / story-video assets into the portable spec/profile QA flow.

Agent rule:

- When a source project adds a new output layout, update the importer and this section in the same change.

## API 3: QA

Use this API to decide whether a video is production-shaped.

Command:

```bash
npm run qa:video -- --spec <spec.json> --profile <profile.json> --video <video.mp4> --out <report.json>
node scripts/qa-video.mjs --spec <spec.json> --profile <profile.json> --video <video.mp4> [--out report.json]
```

Inputs:

- `--spec`: VideoSpec JSON.
- `--profile`: production profile JSON from `profiles/`.
- `--video`: rendered MP4.
- `--out`: optional JSON report path.

Report shape:

```json
{
  "kind": "video-quality-report",
  "version": 1,
  "status": "pass",
  "summary": {
    "durationSec": 60,
    "video": {
      "codec": "h264",
      "width": 1080,
      "height": 1920,
      "fps": 30
    },
    "audio": {
      "codec": "aac",
      "channels": 2
    }
  },
  "frameSamples": [],
  "issues": []
}
```

Status values:

| Status | Meaning |
| --- | --- |
| `pass` | No fatal or soft issues. |
| `review` | No fatal issues, but manual review is required. |
| `fail` | At least one fatal issue; do not publish. |

Current checks:

- Video stream exists.
- Audio stream exists.
- Resolution matches profile/spec.
- FPS matches profile/spec.
- Duration is within profile bounds.
- Sidecar captions exist when required.
- SRT timing does not overlap or exceed video duration.
- Sampled frames are not black/blank.

Required future issue codes from project requirements:

| Code | Severity | Meaning |
| --- | --- | --- |
| `mode_aspect_mismatch` | fatal | Render forced a mode into the wrong aspect, such as shrinking landscape PPT into portrait. |
| `timeline_audio_cutoff` | fatal | A scene/beat is shorter than measured narration audio. |
| `low_visual_density` | fatal or soft by profile | zhibo visual rhythm falls below profile floors. |
| `capture_invalid` | fatal | Browser/screenshot capture is auth wall, verification page, placeholder, or unreadable. |
| `missing_three_second_crisis` | fatal | Levify episode lacks a 3-second crisis hook. |
| `missing_identity_hook` | fatal | Levify episode lacks identity hook. |
| `missing_visual_anchor` | fatal | Levify episode lacks memorable visual anchor. |
| `missing_cliffhanger` | fatal | Levify episode lacks unresolved ending. |
| `missing_transformative_note` | fatal | Transformative safety note is absent. |
| `ai_artifact_fatal` | fatal | Clear AI visual defect in publish-critical frame. |
| `ai_artifact_judge_unavailable` | soft | Artifact judge failed; keep review visible and do not deadlock generation. |

Agent rule:

- Add every new QA issue code to this section.
- Do not downgrade a fatal quality issue to soft without documenting the reason.

## API 4: Review Package

Use this API when the user needs to review videos directly.

### Existing Project Comparison

Command:

```bash
npm run review:existing
npm run review:page
```

Output:

- `outputs/comparison/current/review.html`
- Per-case `source.mp4`
- Per-case `video-maker.output.mp4`
- Per-case metadata

### Diverse zhibo Mode Review

Command:

```bash
npm run review:zhibo-diverse
node scripts/review-zhibo-diverse.mjs outputs/zhibo-diverse/current
```

Default output:

- `outputs/zhibo-diverse/current/review.html`
- `outputs/zhibo-diverse/current/SUMMARY.md`
- One directory per detected mode/style
- `source.mp4`
- `video-maker.output.mp4`
- `meta.json`

Current zhibo coverage target:

- `remotion:MIMIC-product-daily`
- `remotion:MIMIC-news-broadcast`
- `walkthrough:default`
- `walkthrough:playwright_video`
- `terminal:default`
- PPT themes including `dark-tech`, `midnight-mono`, `soft-pastel`, `forest-deep`, `indigo-print`, `swiss-grid`, `paper-warm`, `sunset-magenta`, and discovered fallback themes.

Output quality policy:

- Portrait sources or portrait profiles output as `1080x1920`.
- Landscape sources output as `1920x1080`.
- Mode-specific aspect policy comes from `profiles/*.json` and `docs/project-requirements.md`.
- FPS is normalized to `30`.
- H.264 output uses high-quality encoding: low CRF, slow preset, yuv420p, faststart.
- Audio uses AAC.
- The review page must show both left source and right `video-maker` output.
- The review page must not force landscape videos into a portrait frame.

Agent rule:

- If a user reports a visual regression in review output, fix the generator first, regenerate the review package, and verify the affected case by file metadata.

## API 5: Render Adapters And Comparison

Use these APIs to render specs and compare engines.

```bash
npm run render:levify -- --spec <spec.json> --out <out-dir>
npm run render:remotion -- --spec <spec.json> --profile <profile.json> --out <out-dir>
npm run render:hyperframes -- --spec <spec.json> --profile <profile.json> --out <out-dir>
npm run render:comparison -- --spec <spec.json> --profile <profile.json> --engines remotion,hyperframes --out <out-dir>
```

Implemented outputs:

- `video.mp4`
- `video-maker.spec.json`
- `captions.srt` for `render:levify`
- `render-manifest.json`
- `quality-report.json`
- `review.html` and `comparison_brief.json` for `render:comparison`

Current adapter status:

| Command | Status | Notes |
| --- | --- | --- |
| `render:levify` | Implemented | FFmpeg-based vertical story renderer with sidecar captions and QA. |
| `render:remotion` | Implemented first-pass | Stable API and QA-backed MP4 output; native Remotion component rendering is the next adapter upgrade. |
| `render:hyperframes` | Implemented first-pass | Stable API and QA-backed MP4 output; native HyperFrames HTML rendering is the next adapter upgrade. |
| `render:comparison` | Implemented | Renders the same spec through requested adapters and writes a side-by-side review package. |

Agent rule:

- Render commands must write a QA report before a result is considered production-ready.
- Native engine upgrades must preserve the same CLI arguments and output file names.
- `render:levify` must prefer scene image/audio assets when present and mark `renderMode=asset-mode`; fallback placeholder visuals must be marked `renderMode=fallback-mode`.
- `render:zhibo` must accept source-video normalization and external command bridge modes without importing private source-project code.

## API 6: Publish Handoff

Use these APIs to generate publish manifests. They do not publish directly.

```bash
npm run handoff:publish -- --adapter zhibo-sau --qa <report.json> --render <out-dir> --out <handoff-dir>
npm run handoff:side-hustle -- --render-dir <dir> --out <handoff.json>
```

`handoff:publish` refuses to write an auto-publish handoff unless QA status is `pass`.

Supported adapters:

| Adapter | Output |
| --- | --- |
| `zhibo-sau` | Per-platform manifest for Bilibili, Douyin, WeChat Channels, and Kuaishou. Kuaishou tags are capped at 4; Kuaishou/WeChat mark headed-mode requirements. |
| `side-hustle-postiz` | YouTube-only handoff manifest for `Levify Tales`. |
| `manual` | Manual review/publish handoff folder. |

Side-hustle handoff shape:

```json
{
  "kind": "side-hustle-video-handoff",
  "version": 1,
  "pieceId": "video-<novelVideoId>",
  "novelVideoId": "<id>",
  "profile": "levify-tales",
  "platforms": ["youtube"],
  "videoPath": "path/to/video.mp4",
  "captionsPath": "path/to/captions.srt",
  "qualityReportPath": "path/to/quality-report.json",
  "status": "qa-passed"
}
```

## API 7: Programmatic QA Library

Use this API from Node scripts or future render adapters.

Module:

```js
import {
  checkSrt,
  checkVideoAgainstProfile,
  parseSrt,
  probeVideo,
  readJson,
  sampleFrames,
  videoSummary,
  writeReport
} from './scripts/lib/video-qa.mjs';
```

Functions:

| Function | Input | Output |
| --- | --- | --- |
| `readJson(path)` | JSON file path | Parsed object |
| `probeVideo(videoPath, ffprobe?)` | MP4 path | Raw ffprobe JSON |
| `videoSummary(probe)` | Raw ffprobe JSON | Normalized duration/video/audio summary |
| `sampleFrames(videoPath, summary, opts?)` | MP4 path and summary | Signal stats for sampled frames |
| `parseSrt(text)` | SRT text | Cue list with seconds |
| `checkSrt(cues, videoDurationSec)` | Cue list and duration | Issue list |
| `checkVideoAgainstProfile(spec, profile, summary, frameStats)` | Spec/profile/video facts | Issue list |
| `writeReport(report, outPath?)` | Report object | Written report path |

Agent rule:

- Keep these functions deterministic and file-based.
- Prefer adding new checks here instead of duplicating QA logic in render scripts.

## API 8: Render Adapter Contract

Use this contract when adding real render engines.

Input:

```json
{
  "specPath": "path/to/video-spec.json",
  "profilePath": "profiles/zhibo-tech-workflow.json",
  "outDir": "outputs/<run-id>",
  "assetsDir": "path/to/assets",
  "engine": "remotion"
}
```

Expected adapter output:

```json
{
  "kind": "video-render-result",
  "version": 1,
  "status": "rendered",
  "engine": "remotion",
  "video": "outputs/<run-id>/video-maker.output.mp4",
  "captions": "outputs/<run-id>/captions.srt",
  "manifest": "outputs/<run-id>/manifest.json",
  "qualityReport": "outputs/<run-id>/quality-report.json"
}
```

Required adapter behavior:

- Read VideoSpec and profile.
- Preserve the requested aspect ratio and mode intent.
- Use profile quality settings for resolution, FPS, duration, caption policy, and audio.
- Write an MP4 before QA.
- Run the QA API before returning a production-ready result.
- Never publish directly.

Planned adapter names:

| Adapter | Role |
| --- | --- |
| `remotion` | React/component videos and zhibo-style dynamic layouts. |
| `hyperframes` | Agent-authored HTML video scenes. |
| `ffmpeg` | Assembly, normalization, caption burn-in, transcode, muxing. |
| `otio` | Timeline interchange for external editor handoff. |

Agent rule:

- New adapters must document their command, input JSON, output JSON, failure modes, and QA handoff in this file.

## API Change Checklist

Before finishing any API-affecting change:

- Update `docs/api.md`.
- Update `README.md` if the public command list or project role changed.
- Update `CLAUDE.md`; `AGENTS.md` and `GEMINI.md` link to it.
- Update examples under `specs/examples/` if VideoSpec fields changed.
- Update tests when QA behavior, validation behavior, or report shape changes.
- Run `npm run test:ut` and `npm run test:ct`.
- Regenerate affected review packages when output behavior changed.
