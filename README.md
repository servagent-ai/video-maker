# Video Maker

Video Maker is a file-based video production library for agents and automation pipelines. It turns portable video specs into rendered artifacts, quality reports, human review pages, and publish handoff manifests.

The project is intentionally renderer-agnostic: Remotion, HyperFrames, FFmpeg, browser recording, and future engines can be plugged in behind the same CLI and JSON contracts.

## What It Provides

- Portable `VideoSpec` JSON contract.
- Production profiles for short-form workflow videos and story videos.
- Render adapter CLIs with stable output files.
- Video QA gates for resolution, FPS, duration, audio, captions, blank frames, story hooks, aspect policy, and publish targets.
- Review packages for human inspection.
- Publish handoff manifests that downstream systems can consume without importing this repo.
- Agent-readable API docs and requirements docs.

## Use Cases

- Build vertical story videos with sidecar captions for YouTube Shorts.
- Normalize and review multi-mode short-video outputs.
- Compare the same content through multiple render adapters.
- Add a QA gate before any video reaches a publish queue.
- Integrate source projects through files instead of private package imports.

## Requirements

- Node.js 22 or newer for CI parity.
- FFmpeg and FFprobe for real rendering and media QA.

The unit and contract tests do not require FFmpeg. Render commands do.

## Quickstart

Clone and validate:

```bash
git clone https://github.com/servagent-ai/video-maker.git
cd video-maker
npm run validate
npm test
```

Render a sample Levify-style story video:

```bash
npm run render:levify -- \
  --spec specs/examples/levify-tales-episode.json \
  --out outputs/dev/levify-example
```

The render directory will contain:

```text
video.mp4
captions.srt
video-maker.spec.json
render-manifest.json
quality-report.json
```

Generate a publish handoff manifest:

```bash
npm run handoff:side-hustle -- \
  --render-dir outputs/dev/levify-example \
  --out outputs/dev/levify-example/handoff.json
```

Compare two render adapters on the same spec:

```bash
npm run render:comparison -- \
  --spec specs/examples/levify-tales-episode.json \
  --profile profiles/levify-tales.json \
  --engines remotion,hyperframes \
  --out outputs/dev/engine-comparison
```

Open `outputs/dev/engine-comparison/review.html` to inspect the side-by-side result.

## Public API

The canonical API document is [docs/api.md](docs/api.md). Every API change must update it in the same change.

Core commands:

```bash
npm run validate
npm run qa:video -- --spec <spec.json> --profile <profile.json> --video <video.mp4> --out <report.json>
npm run import:novel -- --project <novel-video-dir> --out <spec.json>
npm run import:zhibo -- --project <zhibo-video-dir> --out <spec.json>
npm run render:levify -- --spec <spec.json> --out <out-dir>
npm run render:remotion -- --spec <spec.json> --profile <profile.json> --out <out-dir>
npm run render:hyperframes -- --spec <spec.json> --profile <profile.json> --out <out-dir>
npm run render:comparison -- --spec <spec.json> --profile <profile.json> --engines remotion,hyperframes --out <out-dir>
npm run handoff:publish -- --adapter <zhibo-sau|side-hustle-postiz|manual> --qa <report.json> --render <out-dir> --out <handoff-dir>
```

## VideoSpec

A minimal spec looks like this:

```json
{
  "id": "example-video",
  "profile": "levify-tales",
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

Full schema: [src/schema/video-spec.schema.json](src/schema/video-spec.schema.json)

Examples:

- [specs/examples/levify-tales-episode.json](specs/examples/levify-tales-episode.json)
- [specs/examples/zhibo-workflow-short.json](specs/examples/zhibo-workflow-short.json)

## Profiles

Profiles make quality rules explicit:

- [profiles/levify-tales.json](profiles/levify-tales.json): vertical English story videos, sidecar SRT, YouTube-only auto publish.
- [profiles/zhibo-tech-workflow.json](profiles/zhibo-tech-workflow.json): high-density workflow/news videos, burned captions, domestic platform handoff, mode-specific aspect policies.

Important behavior: Video Maker does not force every source into one aspect ratio. Portrait short videos stay portrait; landscape PPT/screen/terminal modes can remain landscape when the profile or mode requires it.

## QA

Run QA against a rendered MP4:

```bash
npm run qa:video -- \
  --spec specs/examples/levify-tales-episode.json \
  --profile profiles/levify-tales.json \
  --video outputs/dev/levify-example/video.mp4 \
  --out outputs/dev/levify-example/quality-report.json
```

QA report statuses:

- `pass`: no fatal or soft issues.
- `review`: no fatal issues, but a human should review.
- `fail`: fatal issue; do not publish.

## Testing

```bash
npm run validate
npm run test:ut
npm run test:ct
npm test
```

- UT covers deterministic QA helpers.
- CT covers public CLI/file contracts such as validation, import, and handoff.
- CI runs validation, UT, and CT on every push and pull request.

## Repository Layout

```text
.github/workflows/
  ci.yml
docs/
  api.md
  architecture.md
  project-requirements.md
  quality-gates.md
  changelog.md
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

## Integration Model

Downstream projects should integrate through files:

1. Write a `VideoSpec`.
2. Run a render adapter.
3. Read `quality-report.json`.
4. If QA passes, generate a handoff manifest.
5. Let the downstream publisher consume that manifest.

Do not publish directly from render commands.

## License

MIT
