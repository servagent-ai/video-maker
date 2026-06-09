# Project Requirements Matrix

This is the agent-facing requirements matrix for the two source projects that `video-maker` must satisfy. Treat it as implementation input, not background reading.

## Priority

| Level | Meaning |
| --- | --- |
| `P0` | Required for production. Missing support blocks adoption. |
| `P1` | Required for high-quality iteration. Missing support can ship only with manual review. |
| `P2` | Useful extension. Missing support should not block core delivery. |

## zhibo

### Production Contract

| Area | Requirement | Priority | API/Profile Impact |
| --- | --- | --- | --- |
| Source handoff | Read `.studio.json`, mode metadata, narration, slides, recordings, generated MP4s, and build assets without importing `zhibo` internals. | P0 | `import:zhibo`, source-project import API. |
| Mode coverage | Support `remotion`, `ppt`, `walkthrough`, `terminal`, and `recording` shaped outputs. | P0 | Profile lists mode policies instead of one global style. |
| Aspect policy | Preserve mode intent. Remotion/product/news shorts are portrait; PPT/screen demos may be landscape; do not force all modes into 9:16. | P0 | Render adapter and review package output policy. |
| Subtitles | Domestic upload artifacts need burned captions when the profile says burned. | P0 | QA detects missing burned/sidecar mismatch. |
| Timeline | TTS/audio duration owns scene/beat timing. Fixed beat durations must not cut narration. | P0 | Render adapters retime from measured audio. |
| Visual density | Avoid slow single-page pan and sparse repeated cards. Use UI, screenshots, terminal, browser, diagrams, cards, and conclusion beats. | P0 | Profile density floors and QA issue codes. |
| B-roll | Web/screenshot assets must match title and narration; auth walls, verification pages, and placeholders are invalid. | P1 | Asset QA and source scoring. |
| Browser recording | Leading blank frames must be trimmed; zoom/focus effects must exist in recorded pixels. | P1 | Browser-recording adapter QA. |
| Platform variants | Bilibili, Douyin, WeChat Channels, and Kuaishou need platform-specific variants and metadata. | P1 | Publisher handoff contract. |
| Publishing safety | Kuaishou tag limits, headed mode requirements, hard timeouts, and active-job dedupe must be encoded. | P1 | `zhibo-sau` publisher adapter. |
| Recovery | Half-finished jobs can be recovered only if authored files are absent. | P1 | Import/render job state policy. |

### Mode Policies

| Mode/Profile | Expected Output | Visual Style | Caption Policy | Quality Notes |
| --- | --- | --- | --- | --- |
| `remotion:MIMIC-product-daily` | `1080x1920`, 30fps | Product/news cards, UI frames, bold short-video rhythm. | Burned. | Sample every beat; avoid black late sequences. |
| `remotion:MIMIC-news-broadcast` | `1080x1920`, 30fps | Anchor/news broadcast layout, headline/data cards. | Burned. | Text must remain readable on mobile. |
| `ppt:<theme>` | Preserve source/profile direction, usually `1920x1080` for slide decks. | Theme-specific slides, mascot, SRT/burned subtitle pipeline. | Burned for domestic upload artifact. | Do not shrink slide deck into portrait canvas unless caller requests portrait conversion. |
| `walkthrough:default` | Preserve source direction or requested profile direction. | Browser/app process recording with highlights. | Burned if upload artifact. | Trim blank paint time; reject auth/verification captures. |
| `walkthrough:playwright_video` | Preserve source direction or requested profile direction. | Recorded browser flow. | Burned if upload artifact. | CSS-only transforms are not enough; visible focus must be in pixels. |
| `terminal:default` | Preserve source direction or requested profile direction. | Terminal/code workflow with readable text. | Burned if upload artifact. | Font size and crop must remain readable after platform compression. |
| `recording` | Preserve uploaded recording intent, often portrait. | User-provided recording with transcript/subtitles. | Burned if upload artifact. | Transcript must align to final video, not the pre-processed source. |

### Acceptance Gates

P0 gates:

- `spec-complete`
- `render-integrity`
- `caption-integrity`
- `timeline-audio-fit`
- `whole-timeline-nonblank`
- `visual-density`
- `mode-aspect-preserved`

P1 gates:

- `broll-relevance`
- `capture-validity`
- `platform-variants`
- `publish-timeout`
- `active-job-dedupe`

## side-hustle / Levify Tales

### Production Contract

| Area | Requirement | Priority | API/Profile Impact |
| --- | --- | --- | --- |
| Source handoff | Keep `novel-pipeline` independent; import through shared video output directory only. | P0 | `import:novel`, file/subprocess adapter. |
| Format | Current Shorts target is `1080x1920`, 30fps, 45-90 seconds. | P0 | `levify-tales` profile. |
| Audience | English overseas audience. Male English TTS by default. | P0 | Profile voice defaults and script gates. |
| Hook | First 3 seconds must show an understandable crisis. | P0 | Story gate and prompt tests. |
| Identity | Each episode needs a strong identity hook. | P0 | Story metadata in VideoSpec scenes. |
| Visual anchors | 1-2 memorable visual anchors per episode. | P0 | Storyboard/keyframe requirements. |
| Ending | End on unresolved question or cliffhanger. | P0 | Story gate. |
| Transformative safety | Remove original proper nouns, change details, rewrite narration, keep only generic motifs, and record `transformative.note`. | P0 | Spec quality metadata and QA report. |
| Captions | YouTube needs editable sidecar `.srt`; do not burn irreversible captions into the only output. | P0 | `captionPolicy.mode=sidecar`. |
| AI artifacts | Obvious broken faces/hands or hero-shot artifacts block publish; judge failures stay visible but do not deadlock generation. | P1 | AI artifact QA status: passed/fatal/judge-unavailable. |
| Publishing | YouTube is the only automatic platform. Other platforms remain manual/draft. | P0 | Publisher adapter and publish target gate. |
| Fail-soft daily runs | One failed episode must not poison the full run. Flagged videos stay drafts. | P1 | Batch job state contract. |
| Namespace | Multi-language/render-pass artifacts must be namespaced. | P1 | Render adapter file layout. |

### Acceptance Gates

P0 gates:

- `spec-complete`
- `render-integrity`
- `caption-integrity`
- `three-second-crisis`
- `identity-hook`
- `visual-anchor`
- `cliffhanger`
- `transformative-safety`
- `youtube-only-auto-publish`

P1 gates:

- `ai-artifact-review`
- `judge-unavailable-visible`
- `artifact-namespace`
- `batch-fail-soft`

## Shared API Requirements

| Requirement | zhibo | Levify Tales | API Impact |
| --- | --- | --- | --- |
| File-based handoff | Required | Required | All public APIs use paths and JSON artifacts. |
| Render adapters | Remotion, HyperFrames, FFmpeg, browser recording | FFmpeg, Remotion, HyperFrames | Adapter contract stays engine-agnostic. |
| Caption modes | Burned | Sidecar | Profile-specific caption validation. |
| Aspect handling | Mode/profile specific | Portrait | No global portrait validator for all modes. |
| QA reports | Required before publish | Required before publish | Durable JSON report with fatal/soft/info issues. |
| Human review | Required for new modes/quality regressions | Required for story/artifact concerns | `review.html` package API. |
| Publisher gating | Domestic platform rules | YouTube only | Profile owns allowed auto-publish targets. |

## Implementation Backlog

| Item | Priority | Notes |
| --- | --- | --- |
| Add profile schema for mode policies, density floors, caption style, platform rules, and story gates. | P0 | Current profiles are descriptive; make them machine-checkable. |
| Extend VideoSpec with optional `mode`, `timeline`, `voice`, `story`, `transformative`, and `platformVariants` fields. | P0 | Keep existing examples valid while adding richer contracts. |
| Extend validator beyond fixed portrait output. | P0 | Landscape zhibo PPT/walkthrough must be valid when profile/mode allows it. |
| Add QA issue codes for mode/aspect, audio cutoff, density, capture validity, story gates, and transformative safety. | P0 | Document in `docs/api.md`. |
| Add renderer-native adapters after the review generator stabilizes. | P1 | Review transcode is not a full renderer replacement. |
| Add source-project import tests using representative zhibo and Levify outputs. | P1 | Use local samples, avoid committing large media. |
