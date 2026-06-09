# Platform Video Production Requirements

Date: 2026-06-09

This document is the backlog for moving platform-video production requirements out of source projects and into `video-maker`.

`video-maker` is the public video capability layer. Source projects such as `zhibo` should keep business context, topic queues, credentials, and platform accounts, but reusable video generation, rendering, QA, review packaging, and publish handoff contracts should live here.

## Current Fit

`video-maker` already satisfies the direction:

- It has a portable `VideoSpec` contract.
- It separates profiles for `zhibo-tech-workflow` and `levify-tales`.
- It documents Remotion, HyperFrames, FFmpeg, QA, and publisher adapter boundaries.
- It has a programmatic QA library and tests.
- It supports multi-agent context through `CLAUDE.md`, `AGENTS.md`, and `GEMINI.md`.

First-pass production APIs now exist, with remaining native-engine upgrades:

- Render adapters exist as public CLIs: `render:remotion`, `render:hyperframes`, `render:levify`, and `render:comparison`.
- Same-content engine comparison now renders requested adapters and writes `review.html` plus `comparison_brief.json`.
- Platform publish handoff exists for `zhibo-sau`, `side-hustle-postiz`, and `manual`; it refuses QA-failed outputs.
- zhibo's latest Remotion style fixes and quality gates are not fully represented here.
- Native Remotion component rendering and native HyperFrames HTML rendering remain adapter upgrades; current first-pass adapters provide stable CLI/output contracts and QA-backed MP4s.
- Daily open-source video-engine research is not yet a first-class `video-maker` workflow.

## Non-Negotiable Test Rule

Every new feature in this file must include tests in the same change.

Minimum acceptable tests:

- Schema/API change: schema validation test plus example spec update.
- Render adapter: unit tests for manifest generation and at least one smoke render or deterministic dry-run fixture.
- QA gate: a red fixture that fails before the gate and a green fixture that passes after the fix.
- Review UI/output generator: file structure test and metadata/layout assertion.
- Publisher handoff: platform-specific metadata test and no-direct-publish-without-QA test.
- Importer: fixture for the source-project layout and idempotency/overwrite test.

Do not mark a requirement done without tests.

## Requirements To Move From zhibo

### R1. Remotion Render Adapter CLI

Status: first-pass implemented through `scripts/render-remotion.mjs`; native Remotion composition integration remains open.

Add a public CLI:

```bash
node scripts/render-remotion.mjs --spec <spec.json> --profile <profile.json> --out <out-dir>
```

Required behavior:

- Read `VideoSpec`.
- Select a Remotion composition/style from spec/profile.
- Generate canonical content from scenes.
- Retiming must use measured audio durations, not fixed beat constants.
- Output `video.mp4`, `render-metadata.json`, optional `captions.srt`, and preview stills.
- Never publish directly.

Tests:

- Manifest/canonical generation preserves scene timing.
- Audio retiming expands an overlong narration beat.
- Dynamic duration is derived from retimed timeline.
- A fixture prevents Remotion `Sequence` global-frame/local-frame regressions.

### R2. HyperFrames Render Adapter CLI

Status: first-pass implemented through `scripts/render-hyperframes.mjs`; native HyperFrames HTML rendering remains open.

Add a public CLI:

```bash
node scripts/render-hyperframes.mjs --spec <spec.json> --profile <profile.json> --out <out-dir>
```

Required behavior:

- Generate or accept an HTML composition.
- Use HyperFrames for deterministic HTML-to-video rendering.
- Output `video.mp4`, `index.html`, `render-metadata.json`, frame hash/sample report, and preview stills.
- Support agent-authored HTML templates without source-project imports.

Tests:

- HTML composition contains required HyperFrames data attributes.
- Timed clips map to scenes.
- Render command can dry-run without network.
- Frame hash metadata shape is stable.

### R3. Same-Content Engine Comparison

Status: implemented through `scripts/render-comparison.mjs`.

Add a command:

```bash
node scripts/render-comparison.mjs --spec <spec.json> --profile <profile.json> --engines remotion,hyperframes --out <out-dir>
```

Required behavior:

- Render the same spec through multiple engines.
- Produce a review page with side-by-side outputs.
- Include a comparison summary for information density, screenshot completeness, transition rhythm, caption readability, and agent edit cost.

Tests:

- Generates one subdirectory per engine.
- Review page links all engine outputs.
- Comparison summary is present and machine-readable.

### R4. Remotion Screenshot Fit Guard

Move zhibo's latest screenshot-ratio fix into reusable requirements.

Required behavior:

- Any template placing a wide screenshot in a narrow portrait card must support a contain/letterbox fit mode.
- Cropping is allowed only when the template explicitly declares a focus crop.
- Review packages must not hide horizontal screenshot truncation through CSS object-fit on the review page.

Tests:

- Template fixtures for hero-gallery/workflow-cascade/product-daily keep full screenshot visibility.
- A regression fixture where a 16:9 screenshot is placed into a narrow card fails if only the center crop is visible.

### R5. Visual Density Gate

Status: deterministic first-pass implemented in `scripts/lib/video-qa.mjs`.

Add profile-specific visual-density checks for `zhibo-tech-workflow`.

Required behavior:

- Minimum beat count.
- Maximum beat duration.
- Visual-kind variety floor.
- Caption length bounds.
- Scene coverage across the full timeline.
- Chrome/layer count or equivalent information-density signal.

Tests:

- Single-page slow-pan fixture fails.
- Repeated sparse-card fixture fails.
- High-density multi-scene fixture passes.

### R6. Caption Policy Enforcement

Required behavior:

- `zhibo-tech-workflow`: burned captions must be present in the final uploaded MP4.
- `levify-tales`: sidecar SRT must exist and the only output must not irreversibly burn captions.
- Caption timing must not overlap or exceed final duration.
- Portrait and landscape subtitle readability rules must be profile-specific.

Tests:

- Burned-caption-required profile fails when only sidecar exists.
- Sidecar-required profile fails when captions are missing.
- SRT overlap and past-video-end fixtures fail.
- Portrait cue-length/readability fixture fails when line length exceeds profile limit.

### R7. B-roll And Web Capture QA

Required behavior:

- B-roll selection must score against title, narration, and scene text.
- Auth walls, login pages, Cloudflare/verification pages, blank pages, and unrelated fallback pages are fatal.
- Structured cards are preferred when web capture is unreliable.

Tests:

- Topic-mismatched b-roll fixture fails.
- Login/auth-wall screenshot fixture fails.
- Structured-card fallback passes.

### R8. Publisher Handoff Adapter

Status: implemented through `scripts/publish-handoff.mjs`.

Add platform handoff generation, not direct publishing:

```bash
node scripts/publish-handoff.mjs --adapter zhibo-sau --qa <report.json> --render <out-dir> --out <handoff-dir>
```

Required behavior:

- Refuse to create auto-publish handoff unless QA status is `pass`.
- Generate per-platform metadata for Bilibili, Douyin, WeChat Channels, and Kuaishou.
- Encode platform constraints:
  - Kuaishou max 4 hot tags.
  - WeChat Channels thumbnail required.
  - WeChat Channels and Kuaishou may require headed mode in downstream automation.
  - Publisher subprocesses need hard timeout metadata.
- Generate per-platform variant plan.

Tests:

- QA fail blocks handoff.
- Kuaishou tags are capped at 4.
- WeChat handoff includes thumbnail.
- Variant entries are per-platform and unique.

### R9. Daily Open-Source Video Research

Move the daily research workflow into `video-maker`.

Required behavior:

- Search open-source video-generation projects.
- Reject generic high-star repositories without core video-generation terms.
- Download or reuse cached repositories.
- Produce `report.md`, `selected.json`, and `comparison_brief.json`.
- Feed the top candidate into same-content comparison.

Tests:

- Generic awesome-list fixture is rejected.
- HyperFrames/html-to-video fixture is accepted.
- Clone failure can reuse a previous cached copy.
- Report and comparison brief schemas are stable.

### R10. Multi-Agent Project Context Setup

`video-maker` must remain compatible with Codex, Claude Code, and Gemini CLI.

Required behavior:

- `CLAUDE.md` is the canonical context.
- `AGENTS.md` and `GEMINI.md` point to the same content or are byte-identical copies.
- Durable workflow changes must be recorded in docs before handoff.

Tests:

- Run global skill check:

```bash
python /Users/zhen.liu/.codex/skills/multi-agent-context/scripts/sync_context.py . --check
```

## Migration Boundary

Keep in source projects:

- Platform credentials and cookies.
- User-specific voice reference files.
- Topic queues and publishing history.
- Studio UI business state.
- Existing production videos.

Move to `video-maker`:

- Portable video specs.
- Renderer adapter contracts.
- QA gates.
- Review package generation.
- Engine comparison workflow.
- Publish handoff metadata contracts.
- Open-source renderer research workflow.

## Acceptance Standard

`video-maker` is ready to serve as the shared platform-video layer when:

1. One zhibo spec renders through Remotion.
2. The same spec renders through HyperFrames.
3. A side-by-side review page is generated.
4. QA blocks known bad fixtures.
5. A zhibo-sau handoff folder is produced only after QA passes.
6. All new capabilities have tests.
