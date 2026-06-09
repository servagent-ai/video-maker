# Target Architecture

## Objective

Build a shared video production system that reuses open-source engines while preserving the existing strengths of `zhibo` and `side-hustle`.

Scope is video only: script/storyboard, assets, narration, captions, rendering, video QA, variants, and video publish handoff. Non-video content pipelines stay outside this project.

The system must eventually output rendered production videos. Specs and QA reports are intermediate artifacts; they exist to drive high-quality rendering and prevent low-quality publishing.

The project owns:

- Portable video specs.
- Profiles for target channels.
- Render adapter selection.
- Asset and narration handoff.
- Quality gates.
- Publish handoff.

The project does not own:

- A custom video rendering engine.
- A full NLE UI.
- Platform login internals.
- Novel/source collection internals.

## High-Level Flow

```text
source project
  -> VideoSpec JSON
  -> profile validation
  -> asset preparation
  -> render adapter
       remotion | hyperframes | ffmpeg | external
  -> QA report
  -> platform variant generation
  -> publisher adapter
       zhibo-sau | side-hustle-postiz | manual
```

## Core Contract

`VideoSpec` is the stable input:

- `id`
- `profile`
- `format`
- `language`
- `captionPolicy`
- `scenes`
- `assets`
- `publishTargets`
- `quality`

Each source project can generate this spec without importing renderer code.

## Render Adapters

### Remotion Adapter

Input:

- `VideoSpec`
- profile tokens
- component catalog
- media asset paths

Output:

- `video.mp4`
- optional `captions.srt`
- preview stills
- render metadata

Use for:

- `zhibo` Remotion gallery-based shorts.
- React component-heavy videos.
- Dense motion graphics and platform variants.

### HyperFrames Adapter

Input:

- `VideoSpec`
- generated HTML composition
- media asset paths

Output:

- deterministic MP4
- frame hash report
- render metadata

Use for:

- Agent-written HTML videos.
- Quick iteration from script/spec to visual output.
- Future design-system-driven video templates.

### FFmpeg Adapter

Input:

- still frames
- audio clips
- sidecar subtitles
- timeline sections

Output:

- assembled MP4
- optional burned-caption MP4

Use for:

- `novel-pipeline` style Ken Burns video.
- final post-processing.
- anti-fingerprint variants.

### External Adapter

Input:

- `VideoSpec`
- provider-specific template params

Output:

- URL or downloaded MP4

Use only as fallback or experiment. Creatomate is allowed here, not as the default core.

## Publisher Adapters

### zhibo-sau

Wraps social-auto-upload flow:

- Bilibili
- Douyin
- WeChat Channels
- Kuaishou

Must preserve platform-specific rules such as headed mode and thumbnail handling.

### side-hustle-postiz

Wraps the existing content publish store and queue runner:

- Register finished video as publish piece.
- Queue only YouTube automatically.
- Reconcile and upload captions after publish.

### manual

Writes a handoff folder:

- `video.mp4`
- `captions.srt`
- `metadata.json`
- `quality-report.json`
- optional `.otio`

## File-Based Integration

Keep both existing projects independent:

- `zhibo` can export/import specs near `videos/<topic>/`.
- `novel-pipeline` can keep writing to shared `novel-videos/<id>/`.
- `side-hustle` can keep scanning finished videos and publishing through its store.

`video-maker` should provide adapter CLIs rather than forcing direct package imports.

## First CLI Shape

```bash
video-maker validate specs/examples/zhibo-workflow-short.json
video-maker render --engine remotion specs/examples/zhibo-workflow-short.json
video-maker render --engine hyperframes specs/examples/zhibo-workflow-short.json
video-maker qa out/<id>/video.mp4 --spec specs/examples/zhibo-workflow-short.json
video-maker publish --adapter zhibo-sau out/<id>/handoff.json
```

## Non-Negotiable Quality Boundary

Publishing cannot happen from a render command directly. It must pass through a quality report. Profiles decide whether soft issues can be manually approved or block the publish queue.

## Failure-Mode Requirements

The architecture is constrained by existing project regressions, not only by ideal workflow design. Before implementing adapters, read `docs/iteration-lessons.md`.

Adapter requirements:

- Remotion adapter must handle `Sequence` local-frame semantics and dynamic duration metadata.
- FFmpeg adapter must namespace intermediates by render pass/language.
- Browser-recording adapter must not rely on CSS effects that are absent from recorded pixels.
- Publisher adapters must use hard timeouts and platform-specific options.
- Importers must preserve source-project contracts and avoid direct cross-project imports.
