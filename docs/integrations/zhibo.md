# zhibo Integration Guide

This guide explains how `zhibo` should use `video-maker`.

## Responsibility Boundary

`video-maker` owns:

- Portable `VideoSpec` shape.
- Mode/profile-aware render adapter entrypoints.
- Source video normalization when `zhibo` already rendered a video.
- Optional external Remotion command bridge.
- QA reports.
- Review packages.
- Publish handoff manifests for downstream `zhibo-sau`.
- Public style/element catalog.

`zhibo` owns:

- Topic queues and business decisions.
- Private Remotion components and source-project templates.
- Credentials, cookies, upload sessions, voice references, and platform accounts.
- Final platform publishing automation.
- Source assets such as screenshots, recordings, narration files, subtitles, and project directories.

Do not commit `zhibo` credentials, cookies, or generated private media into `video-maker`.

## Input Contract

`zhibo` can call `video-maker` in two ways.

### 1. Import An Existing zhibo Project

```bash
npm run import:zhibo -- \
  --project <zhibo-video-project-dir> \
  --out outputs/zhibo/<id>/video-maker.spec.json
```

The importer reads:

- `.studio.json`
- `narrations.json`
- `slides.html` when present
- generated source video when present

It writes a `zhibo-tech-workflow` spec with:

- `mode`
- `metadata.modeProfile`
- `metadata.sourceVideo`
- profile-aware format
- scenes derived from narration/timing

### 2. Write VideoSpec Directly

Use this when `zhibo` already has a canonical content plan.

Required fields:

- `profile`: `zhibo-tech-workflow`
- `mode`: `remotion`, `ppt`, `walkthrough`, `terminal`, or `recording`
- `style.id`: one of `workflow-dense`, `news-broadcast`, `product-daily`, or `slide-deck-dark`
- `format`: portrait or landscape according to mode policy
- `captionPolicy.mode`: `burned`
- `publishTargets`: domestic platform list
- `quality.gates`: profile gates

Example render-specific fields:

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

## Rendering

### Normalize An Existing zhibo Output

```bash
npm run render:zhibo -- \
  --spec outputs/zhibo/<id>/video-maker.spec.json \
  --out outputs/zhibo/<id>/render
```

If `render.sourceVideo` or `metadata.sourceVideo` exists, the adapter normalizes it with mode-aware aspect policy:

- Remotion portrait modes stay `1080x1920`.
- PPT/screen/terminal landscape sources can remain `1920x1080`.
- FPS is normalized to 30.
- QA runs after render.

### Bridge Native zhibo Remotion

Set either `spec.render.externalCommand` or `VIDEO_MAKER_ZHIBO_RENDER_CMD`.

The command receives:

- `VIDEO_MAKER_SPEC`
- `VIDEO_MAKER_OUT_DIR`
- `VIDEO_MAKER_OUTPUT_VIDEO`

It must write the final MP4 to `VIDEO_MAKER_OUTPUT_VIDEO`.

Example:

```bash
VIDEO_MAKER_ZHIBO_RENDER_CMD='pnpm --dir <zhibo-root>/videos/remotion-lab render-from-spec' \
npm run render:zhibo -- \
  --spec outputs/zhibo/<id>/video-maker.spec.json \
  --out outputs/zhibo/<id>/render
```

`video-maker` then probes, samples frames, and writes:

- `video.mp4`
- `video-maker.spec.json`
- `render-manifest.json`
- `quality-report.json`

## QA And Review

Run QA directly:

```bash
npm run qa:video -- \
  --spec outputs/zhibo/<id>/video-maker.spec.json \
  --profile profiles/zhibo-tech-workflow.json \
  --video outputs/zhibo/<id>/render/video.mp4 \
  --out outputs/zhibo/<id>/render/quality-report.json
```

Generate a diverse local review package when source projects are available:

```bash
ZHIBO_VIDEOS_DIR=<zhibo-root>/videos \
npm run review:zhibo-diverse
```

## Publish Handoff

```bash
npm run handoff:publish -- \
  --adapter zhibo-sau \
  --qa outputs/zhibo/<id>/render/quality-report.json \
  --render outputs/zhibo/<id>/render \
  --out outputs/zhibo/<id>/handoff
```

The handoff manifest records platform rules such as:

- Kuaishou hot tags capped at 4.
- Kuaishou/WeChat headed mode requirements.
- WeChat thumbnail requirement.
- Per-platform timeout metadata.

Publishing itself remains in `zhibo` / `social-auto-upload`.
