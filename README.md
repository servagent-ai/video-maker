# Video Maker

Video Maker is a file-based video production library for agents, content systems, and automation pipelines. It converts portable video specs into rendered MP4s, captions, quality reports, review pages, and publish handoff manifests.

It is built around one rule: source projects own business context and private credentials; Video Maker owns reusable video production capability.

## Why This Exists

Many video automation projects grow around project-specific scripts: one renderer for story shorts, another for workflow videos, another upload script, another review page, and many fragile assumptions about aspect ratio, captions, or platform quirks.

Video Maker centralizes the reusable parts:

- a stable `VideoSpec` input contract
- profile-specific quality rules
- render adapters
- sidecar/burned caption policy
- video QA
- human review packages
- publish handoff manifests

Source projects can keep their own queues, templates, accounts, and creative generation while calling Video Maker through files and CLIs.

## Highlights

- **File-based API**: no private package imports required.
- **Renderer agnostic**: FFmpeg now, Remotion/HyperFrames/native engines can be plugged in behind the same output contract.
- **Profile-aware aspect handling**: portrait shorts stay portrait; landscape PPT/screen/terminal videos are not forced into a tiny portrait frame.
- **Story-video support**: scene frames/audio, sidecar SRT, YouTube Shorts profile, story gates.
- **Workflow-video support**: zhibo mode import, source-video normalization, external Remotion command bridge, domestic platform handoff.
- **Quality gates before publish**: ffprobe, frame sampling, captions, story hooks, visual density, aspect policy, publish target checks.
- **Review artifacts**: side-by-side comparison pages and per-render manifests.
- **Security-aware public repo**: generated media and secret-shaped files are ignored; CI runs a local secret scan.

## Architecture

```text
source project
  -> VideoSpec JSON
  -> profile validation
  -> render adapter
       render:levify | render:zhibo | render:remotion | render:hyperframes
  -> quality-report.json
  -> review.html / comparison_brief.json
  -> publish handoff
       zhibo-sau | side-hustle-postiz | manual
```

Render commands never publish directly. Publishing systems consume handoff manifests after QA passes.

## Requirements

- Node.js 22 or newer for CI parity.
- FFmpeg and FFprobe for rendering and media QA.

Unit and contract tests do not require FFmpeg. Render commands do.

## Install

```bash
git clone https://github.com/servagent-ai/video-maker.git
cd video-maker
npm run validate
npm test
```

## Quick Demo: Levify Story Video

Render the included YouTube Shorts style story spec:

```bash
npm run render:levify -- \
  --spec specs/examples/levify-tales-episode.json \
  --out outputs/demo/levify
```

Output:

```text
outputs/demo/levify/
  video.mp4
  captions.srt
  video-maker.spec.json
  render-manifest.json
  quality-report.json
```

Generate a side-hustle handoff:

```bash
npm run handoff:side-hustle -- \
  --render-dir outputs/demo/levify \
  --out outputs/demo/levify/handoff.json
```

The handoff is YouTube-only by default.

## Quick Demo: Engine Comparison

Render the same spec through two adapter entrypoints:

```bash
npm run render:comparison -- \
  --spec specs/examples/levify-tales-episode.json \
  --profile profiles/levify-tales.json \
  --engines remotion,hyperframes \
  --out outputs/demo/engine-comparison
```

Open:

```text
outputs/demo/engine-comparison/review.html
```

The comparison directory includes one subdirectory per engine plus `comparison_brief.json`.

## Quick Demo: zhibo Source Video

If zhibo already rendered an MP4, Video Maker can normalize and QA it without importing zhibo code.

Example `VideoSpec.render` fields:

```json
{
  "profile": "zhibo-tech-workflow",
  "mode": "ppt",
  "style": { "id": "slide-deck-dark" },
  "render": {
    "adapter": "source-video",
    "sourceVideo": "/path/to/zhibo/output.mp4"
  },
  "metadata": {
    "modeProfile": "ppt:dark-tech"
  }
}
```

Render:

```bash
npm run render:zhibo -- \
  --spec outputs/zhibo/<id>/video-maker.spec.json \
  --out outputs/zhibo/<id>/render
```

For landscape PPT/screen/terminal modes, the adapter preserves landscape output when the mode policy requires it.

## Public Commands

```bash
npm run validate
npm run security:scan
npm run test:ut
npm run test:ct
npm test

npm run import:novel -- --project <novel-video-dir> --out <spec.json>
npm run import:zhibo -- --project <zhibo-video-dir> --out <spec.json>

npm run render:levify -- --spec <spec.json> --out <out-dir>
npm run render:zhibo -- --spec <spec.json> --out <out-dir>
npm run render:remotion -- --spec <spec.json> --profile <profile.json> --out <out-dir>
npm run render:hyperframes -- --spec <spec.json> --profile <profile.json> --out <out-dir>
npm run render:comparison -- --spec <spec.json> --profile <profile.json> --engines remotion,hyperframes --out <out-dir>

npm run qa:video -- --spec <spec.json> --profile <profile.json> --video <video.mp4> --out <report.json>
npm run handoff:side-hustle -- --render-dir <dir> --out <handoff.json>
npm run handoff:publish -- --adapter <zhibo-sau|side-hustle-postiz|manual> --qa <report.json> --render <out-dir> --out <handoff-dir>
```

## VideoSpec

`VideoSpec` is the stable input. Full schema: [src/schema/video-spec.schema.json](src/schema/video-spec.schema.json).

Minimal story example:

```json
{
  "id": "example-video",
  "profile": "levify-tales",
  "style": { "id": "mythic-short" },
  "title": "He woke inside a silver cocoon",
  "language": "en-US",
  "format": {
    "width": 1080,
    "height": 1920,
    "fps": 30,
    "durationSec": 78
  },
  "captionPolicy": {
    "mode": "sidecar",
    "format": "srt",
    "required": true
  },
  "scenes": [
    {
      "id": "crisis",
      "startSec": 0,
      "durationSec": 8,
      "narration": "The boy opened his eyes inside a silver cocoon, while the building above him burned.",
      "visual": {
        "kind": "ai-keyframe",
        "prompt": "cinematic vertical frame, survivor inside a silver cocoon"
      },
      "story": {
        "identityHook": "last survivor",
        "visualAnchor": "silver cocoon"
      }
    }
  ],
  "publishTargets": ["youtube"],
  "quality": {
    "gates": ["spec-complete", "render-integrity", "caption-integrity"],
    "transformativeNote": "Proper nouns removed and narration rewritten.",
    "requiresManualReview": true
  }
}
```

Optional extensibility fields:

- `style.id`: visual style from [catalogs/video-styles.json](catalogs/video-styles.json)
- `style.elements`: required or preferred visual elements
- `render.engine`: requested engine
- `render.adapter`: `source-video`, `external-command`, `native`, or caller-defined adapter mode
- `render.externalCommand`: bridge to a private renderer
- `render.sourceVideo`: already-rendered video to normalize and QA
- `render.assetPolicy`: `required` or `fallback-ok`
- `scene.audio.uri`: per-scene audio
- `scene.visual.image`: direct scene image
- `scene.visual.assetRefs`: references top-level assets
- `scene.metadata`: non-secret source-project metadata

## Profiles

Profiles define production requirements.

- [profiles/levify-tales.json](profiles/levify-tales.json)
  - `1080x1920`, 30fps, 45-90 seconds
  - sidecar SRT
  - YouTube-only auto-publish
  - story gates: crisis, identity hook, visual anchor, cliffhanger, transformative safety

- [profiles/zhibo-tech-workflow.json](profiles/zhibo-tech-workflow.json)
  - mode-aware portrait/landscape handling
  - burned captions
  - high visual density
  - domestic platform handoff metadata
  - zhibo mode policies for Remotion, PPT, walkthrough, terminal, and recording

## Styles And Elements

Reusable style definitions live in [catalogs/video-styles.json](catalogs/video-styles.json).

Built-in styles:

| Style | Profile | Use |
| --- | --- | --- |
| `workflow-dense` | `zhibo-tech-workflow` | High-density AI workflow/news short. |
| `news-broadcast` | `zhibo-tech-workflow` | Portrait news-broadcast layout. |
| `product-daily` | `zhibo-tech-workflow` | Product/update explainer. |
| `slide-deck-dark` | `zhibo-tech-workflow` | Landscape technical slide deck. |
| `mythic-short` | `levify-tales` | Vertical cinematic myth/story short. |
| `cinematic-retelling` | `levify-tales` | Slower narrative retelling with keyframes. |

Elements include:

- `browser-frame`
- `terminal-panel`
- `data-card`
- `comparison-card`
- `diagram-flow`
- `burned-caption-band`
- `caption-sidecar`
- `ken-burns-keyframe`
- `crisis-hook`
- `character-anchor`
- `cliffhanger-card`

## Levify / side-hustle Service Tutorial

This is the YouTube Shorts story-video path.

### Responsibility Boundary

Video Maker is responsible for:

- `levify-tales` profile
- portable spec validation
- scene frame/audio assembly
- retiming scenes from measured audio
- sidecar SRT generation or preservation
- QA report
- review package
- YouTube handoff manifest

`novel-pipeline` is responsible for:

- story collection
- rewrite and transformative safety generation
- character locking
- keyframe generation
- TTS generation
- shot captions

`side-hustle` is responsible for:

- publish store
- review/enqueue UI
- queue runner
- Postiz/YouTube credentials
- reconcile and caption upload results

### Source Directory

Recommended source shape:

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

Only `storyboard.json` is required for import. Rendering quality improves when frames and audio are present.

### Import

```bash
npm run import:novel -- \
  --project <novel-video-dir> \
  --out outputs/levify/<id>/video-maker.spec.json
```

The importer preserves:

- series metadata
- EN/ZH video and captions
- shot frames/audio
- `transformative` object
- shot-level `narrationZh`
- source URL/license metadata

### Render

```bash
npm run render:levify -- \
  --spec outputs/levify/<id>/video-maker.spec.json \
  --out outputs/levify/<id>/render
```

Render modes:

- `asset-mode`: scene images/audio were found and used.
- `fallback-mode`: deterministic placeholder visuals were used because assets were absent.

`render-manifest.json` records the mode.

### Handoff

```bash
npm run handoff:side-hustle -- \
  --render-dir outputs/levify/<id>/render \
  --out outputs/levify/<id>/handoff.json
```

The manifest is YouTube-only by default and should be consumed by side-hustle.

### One-Command Review

```bash
npm run review:side-hustle -- \
  --project <novel-video-dir> \
  --out outputs/levify/<id>/review
```

This writes imported spec, render output when possible, QA report, handoff, and `review.html`.

Detailed guide: [docs/integrations/side-hustle.md](docs/integrations/side-hustle.md)

## zhibo Service Tutorial

This is the AI workflow/news/domestic-platform video path.

### Responsibility Boundary

Video Maker is responsible for:

- `zhibo-tech-workflow` profile
- mode-aware import
- source-video normalization
- external Remotion command bridge
- QA report
- review package
- platform handoff manifest

`zhibo` is responsible for:

- topic queues
- private Remotion components
- business-specific templates
- voice references
- screenshots, recordings, narration, subtitles
- platform credentials/cookies
- actual upload automation

### Import Existing zhibo Project

```bash
npm run import:zhibo -- \
  --project <zhibo-video-project-dir> \
  --out outputs/zhibo/<id>/video-maker.spec.json
```

The importer reads `.studio.json`, `narrations.json`, source video, slides, and voice reference when present.

### Render Existing Source Video

If zhibo already rendered a video:

```json
{
  "render": {
    "adapter": "source-video",
    "sourceVideo": "/path/to/zhibo/output.mp4"
  },
  "metadata": {
    "modeProfile": "ppt:dark-tech"
  }
}
```

Then:

```bash
npm run render:zhibo -- \
  --spec outputs/zhibo/<id>/video-maker.spec.json \
  --out outputs/zhibo/<id>/render
```

For `ppt:*`, `walkthrough:*`, and `terminal:*`, landscape sources can remain `1920x1080`. For portrait Remotion modes, output stays `1080x1920`.

### Bridge zhibo Native Remotion

Use this when zhibo wants to keep its private Remotion renderer.

```bash
VIDEO_MAKER_ZHIBO_RENDER_CMD='pnpm --dir <zhibo-root>/videos/remotion-lab render-from-spec' \
npm run render:zhibo -- \
  --spec outputs/zhibo/<id>/video-maker.spec.json \
  --out outputs/zhibo/<id>/render
```

The external command receives:

- `VIDEO_MAKER_SPEC`
- `VIDEO_MAKER_OUT_DIR`
- `VIDEO_MAKER_OUTPUT_VIDEO`

It must write the final MP4 to `VIDEO_MAKER_OUTPUT_VIDEO`. Video Maker then runs QA and writes the manifest.

### Publish Handoff

```bash
npm run handoff:publish -- \
  --adapter zhibo-sau \
  --qa outputs/zhibo/<id>/render/quality-report.json \
  --render outputs/zhibo/<id>/render \
  --out outputs/zhibo/<id>/handoff
```

The handoff includes platform constraints such as Kuaishou tag cap, headed-mode hints, timeouts, and WeChat thumbnail requirement.

### Diverse Mode Review

When a local zhibo checkout is available:

```bash
ZHIBO_VIDEOS_DIR=<zhibo-root>/videos \
npm run review:zhibo-diverse
```

Detailed guide: [docs/integrations/zhibo.md](docs/integrations/zhibo.md)

## QA

Run QA against a rendered MP4:

```bash
npm run qa:video -- \
  --spec specs/examples/levify-tales-episode.json \
  --profile profiles/levify-tales.json \
  --video outputs/demo/levify/video.mp4 \
  --out outputs/demo/levify/quality-report.json
```

QA statuses:

- `pass`: no fatal or soft issues.
- `review`: no fatal issues, but a human should review.
- `fail`: fatal issue; do not publish.

Current gates include:

- video/audio stream presence
- resolution and FPS
- duration bounds
- sidecar caption presence
- SRT timing
- sampled blank/black frames
- mode/aspect policy
- timeline audio fit
- visual density
- Levify story hooks
- publish target gating

## Testing

```bash
npm run validate
npm run security:scan
npm run test:ut
npm run test:ct
npm test
```

- UT covers deterministic QA helpers.
- CT covers public CLI/file contracts such as validation, import, and handoff.
- CI runs validation, secret scan, UT, and CT on every push and pull request.

## Security

Generated media and local review outputs are ignored under `outputs/`. Do not commit platform cookies, tokens, API keys, private keys, service account files, or source-project credentials.

Run:

```bash
npm run security:scan
```

Security policy: [SECURITY.md](SECURITY.md)

## Repository Layout

```text
.github/workflows/
  ci.yml
catalogs/
  video-styles.json
docs/
  api.md
  integrations/
  project-requirements.md
  quality-gates.md
profiles/
  levify-tales.json
  zhibo-tech-workflow.json
scripts/
  import-*.mjs
  render-*.mjs
  qa-video.mjs
  publish-handoff.mjs
specs/examples/
  *.json
src/schema/
  video-spec.schema.json
test/
  *.test.mjs
```

## License

MIT
