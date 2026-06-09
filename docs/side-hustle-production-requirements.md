# Side Hustle Video Production Requirements

Date: 2026-06-09

This is the task handoff from `company/side-hustle` to `video-maker`. The goal is to move all reusable video-production requirements out of the private platform code and into this public video library.

## Current Fit Assessment

`video-maker` partially satisfies `side-hustle` needs:

- It has a portable `VideoSpec` schema.
- It has a `levify-tales` profile.
- It can import existing novel-video output directories.
- It can run basic ffprobe/SRT/blank-frame QA.
- It has tests for the current QA helpers.

First-pass production APIs now exist, with remaining quality upgrades:

- It can render a `Levify Tales` spec into `video.mp4`, `captions.srt`, `render-manifest.json`, and `quality-report.json` through `scripts/render-levify-tales.mjs`.
- It generates sidecar SRT from scene timings when needed.
- It provides `scripts/handoff-side-hustle.mjs` and `scripts/publish-handoff.mjs --adapter side-hustle-postiz`.
- It enforces deterministic first-pass story gates in code: first-3-second crisis, identity hook, visual anchor, cliffhanger, transformative note, source proper noun leak, and publish target gating.
- It has unit tests for the reusable QA gates and smoke-verified render/handoff commands.
- Remaining upgrades: use real storyboard frames and measured audio clips when present, add fixtures for complete import-render-handoff, and add model-assisted AI artifact review.

## Production Contract To Support

The active `side-hustle` YouTube chain is:

```text
novel-pipeline subprocess
-> .data/novel-videos/<id>/
-> side-hustle content publish store
-> web review/enqueue
-> queue-runner
-> Postiz YouTube integration
-> reconcile
-> YouTube captions upload
```

`video-maker` should own the reusable middle part:

```text
storyboard/captions/audio/frames
-> portable VideoSpec
-> renderable timeline
-> final mp4 + sidecar srt
-> QA report
-> publish handoff manifest
```

`side-hustle` and `novel-pipeline` must remain decoupled. Use file/subprocess contracts only; do not import private project code.

## Required Features

### 1. Levify Tales Render Adapter

Status: implemented first-pass in `scripts/render-levify-tales.mjs`.

Add a render command that turns a validated `levify-tales` `VideoSpec` into:

- `video.mp4`
- `captions.srt`
- `render-manifest.json`
- `quality-report.json`

Minimum CLI shape:

```bash
node scripts/render-levify-tales.mjs --spec <spec.json> --out <dir>
```

Requirements:

- Output 1080x1920, 30fps, H.264, yuv420p, AAC audio.
- Duration must follow measured narration/audio durations when audio assets exist.
- If only storyboard narration exists, generate deterministic placeholder timing that still passes QA.
- Sidecar SRT is required for YouTube; do not burn captions into the only output.
- Render must fail when required frame/audio/caption assets are missing.

Tests required:

- Renders a tiny fixture spec to MP4 with expected resolution/fps/audio.
- Fails on missing required asset.
- Preserves sidecar SRT policy for `levify-tales`.
- Does not overwrite artifacts from another language/render pass.

### 2. Novel Video Import Must Preserve More Source Contract

Status: implemented first-pass in `scripts/import-novel-video.mjs`.

Extend `scripts/import-novel-video.mjs` so imported specs preserve:

- `series.json` fields: `seriesId`, `episode`, `totalEpisodes`, `prevId`, `nextId`.
- existing `video.mp4`, `video-zh.mp4`, `captions.srt`, `captions-zh.srt`, frames, and per-shot audio if present.
- `transformative` object, not only `transformative.note`.
- shot-level `narrationZh` when present.
- source URL/license metadata.

Tests required:

- Fixture with `storyboard.json + series.json + captions.srt` imports all metadata.
- Fixture with both EN/ZH assets namespaces them without collision.
- Fixture without `video.mp4` remains renderable and clearly marked `needs-render`.

### 3. Story Quality Gates For Levify Tales

Status: deterministic first-pass implemented in `scripts/lib/video-qa.mjs`.

Implement deterministic and model-assisted hooks behind stable issue codes:

- `missing_three_second_crisis`
- `missing_identity_hook`
- `missing_visual_anchor`
- `missing_cliffhanger`
- `missing_transformative_note`
- `source_proper_noun_leak`
- `source_wording_too_similar`
- `ai_artifact_review_required`

The first pass can be deterministic:

- Require non-empty `quality.transformativeNote`.
- Require first scene narration or visual text to contain clear crisis/action terms.
- Require last scene narration to contain a question, reveal, threat, or unresolved continuation marker.
- Require at least one scene marked `story.stimPoint === true`.

Tests required:

- Good Levify fixture passes these gates.
- Missing transformative note fails.
- Flat opening fails `missing_three_second_crisis`.
- Closed ending fails `missing_cliffhanger`.

### 4. Side Hustle Publish Handoff

Status: implemented in `scripts/handoff-side-hustle.mjs`.

Add a handoff command that writes a manifest `side-hustle` can consume without importing `video-maker` code:

```bash
node scripts/handoff-side-hustle.mjs --render-dir <dir> --out <handoff.json>
```

Manifest fields:

- `pieceId`: `video-<novelVideoId>`
- `novelVideoId`
- `profile`: `levify-tales`
- `platforms`: `["youtube"]` by default
- `videoPath`
- `captionsPath`
- `title`
- `description`
- `qualityReportPath`
- `status`: `qa-passed | needs-review | failed`
- `source`
- `transformative`

Rules:

- Never mark `qa-passed` when QA has fatal issues.
- YouTube is the only default auto-publish platform.
- The manifest must be idempotent: rerunning it for the same render dir produces stable IDs and paths.

Tests required:

- Passing QA produces `qa-passed`.
- Fatal QA produces `failed`.
- Output manifest is stable across repeated runs.
- Non-YouTube platform defaults are not emitted.

### 5. Review Package For Side Hustle Episodes

Status: implemented first-pass in `scripts/review-side-hustle-episode.mjs`.

Add a command:

```bash
node scripts/review-side-hustle-episode.mjs --project <novel-video-dir> --out <dir>
```

It should produce:

- imported `video-maker.spec.json`
- rendered output if possible
- `quality-report.json`
- `handoff.json`
- `review.html`

Tests required:

- Fixture produces all expected files.
- `review.html` links source storyboard, output video, captions, and QA report.
- Missing video before render is shown as `needs-render`, not silently treated as publishable.

## Acceptance Criteria

`video-maker` is acceptable for `side-hustle` production when:

1. `npm test` passes.
2. `npm run validate` passes.
3. A fixture Levify episode can be imported, rendered, QA checked, and handed off in one scripted flow.
4. The QA report blocks publish on fatal issues.
5. The handoff manifest can be consumed by `side-hustle` without code imports.

## Non-Goals

- Do not move Postiz/YouTube OAuth credentials into `video-maker`.
- Do not make `video-maker` publish directly to YouTube.
- Do not import `side-hustle` or `novel-pipeline` code.
- Do not handle POD, image-text social cards, or non-video persona content.
