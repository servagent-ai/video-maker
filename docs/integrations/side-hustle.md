# Side Hustle / Levify Tales Integration Guide

This guide explains how `company/side-hustle` and `novel-pipeline` should use `video-maker`.

## Responsibility Boundary

`video-maker` owns:

- Portable `VideoSpec`.
- `levify-tales` profile.
- Story-video render adapter.
- Scene frame/audio assembly.
- Sidecar SRT generation or preservation.
- QA reports.
- Review package generation.
- YouTube-only handoff manifest for side-hustle/Postiz.

`novel-pipeline` owns:

- Story collection and source filtering.
- Story rewrite and transformative safety generation.
- Character locking and keyframe generation.
- TTS generation.
- Per-shot captions when available.
- Shared output directory contents.

`side-hustle` owns:

- Publish store.
- Web review and enqueue UI.
- Queue runner.
- Postiz/YouTube credentials and platform reconciliation.
- YouTube caption upload result tracking.

Do not import private `side-hustle` or `novel-pipeline` code into `video-maker`. Use files only.

## Expected Source Directory

The importer accepts a novel video directory such as:

```text
<novel-video-dir>/
  storyboard.json
  series.json
  captions.srt
  captions-zh.srt
  video.mp4
  video-zh.mp4
  frames/
    shot-01.png
    shot-02.png
  audio/
    shot-01.wav
    shot-02.wav
```

Only `storyboard.json` is required for import. Rendering quality improves when frames/audio/captions are present.

## Import

```bash
npm run import:novel -- \
  --project <novel-video-dir> \
  --out outputs/levify/<id>/video-maker.spec.json
```

The importer preserves:

- `series.json`: `seriesId`, `episode`, `totalEpisodes`, `prevId`, `nextId`
- `video.mp4` and `video-zh.mp4`
- `captions.srt` and `captions-zh.srt`
- shot frames and per-shot audio
- `transformative` object
- shot-level `narrationZh`
- source URL/license metadata

## Direct VideoSpec Input

For generated specs, include:

- `profile`: `levify-tales`
- `style.id`: `mythic-short` or `cinematic-retelling`
- `format`: `1080x1920`, 30fps, 45-90 seconds
- `captionPolicy.mode`: `sidecar`
- `publishTargets`: `["youtube"]`
- `quality.transformativeNote`
- story metadata for crisis, identity hook, visual anchor, and cliffhanger
- image/audio assets referenced by scenes or named with `shot-NN`

Scene asset example:

```json
{
  "id": "shot-01",
  "startSec": 0,
  "durationSec": 6,
  "narration": "The last survivor woke beside a burning corpse.",
  "visual": {
    "kind": "ai-keyframe",
    "assetRefs": ["shot-01-frame"]
  },
  "assets": [],
  "story": {
    "identityHook": "last survivor",
    "visualAnchor": "silver cocoon"
  }
}
```

Top-level assets:

```json
{
  "assets": [
    { "id": "shot-01-frame", "kind": "image", "uri": "frames/shot-01.png", "role": "shot-frame shot-01" },
    { "id": "shot-01-audio", "kind": "audio", "uri": "audio/shot-01.wav", "role": "shot-audio shot-01" }
  ]
}
```

## Render

```bash
npm run render:levify -- \
  --spec outputs/levify/<id>/video-maker.spec.json \
  --out outputs/levify/<id>/render
```

The renderer:

- Uses scene images/audio when present.
- Measures audio duration and retimes scenes so narration is not cut.
- Generates or preserves sidecar SRT.
- Falls back to deterministic placeholder visuals only when assets are absent.
- Writes QA artifacts.

Outputs:

```text
video.mp4
captions.srt
video-maker.spec.json
render-manifest.json
quality-report.json
```

`render-manifest.json` includes `renderMode`:

- `asset-mode`: frames/audio were used.
- `fallback-mode`: deterministic placeholder visuals were used.

## Review

```bash
npm run review:side-hustle -- \
  --project <novel-video-dir> \
  --out outputs/levify/<id>/review
```

This creates:

- imported spec
- rendered output when possible
- QA report
- handoff manifest
- `review.html`

## Handoff To side-hustle

```bash
npm run handoff:side-hustle -- \
  --render-dir outputs/levify/<id>/render \
  --out outputs/levify/<id>/handoff.json
```

The manifest is YouTube-only by default:

```json
{
  "kind": "side-hustle-video-handoff",
  "platforms": ["youtube"],
  "status": "qa-passed"
}
```

If QA has fatal issues, the handoff status is `failed` and downstream systems must not enqueue it.
