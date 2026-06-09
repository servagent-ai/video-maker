# Source Project Video Requirements Review

Date: 2026-06-09

## zhibo

Video-related source reviewed:

- `/Users/zhen.liu/projects/zhibo/CLAUDE.md`
- `/Users/zhen.liu/projects/zhibo/videos/remotion-lab/README.md`
- `/Users/zhen.liu/projects/zhibo/.claude/skills/video-new-project.md`
- `/Users/zhen.liu/projects/zhibo/.claude/skills/enrich-video-assets.md`
- `/Users/zhen.liu/projects/zhibo/.claude/skills/upload-video.md`
- `/Users/zhen.liu/projects/zhibo/videos/_assets/*`

### Current Video Goal

Maximize follower growth and collect real Levify leads through short videos. Default content shape is high-density 9:16 Remotion-style short video. Walkthrough videos are used when real browser or terminal process matters.

### Existing Pipeline

Two modes are established:

- `ppt`: script + slides HTML + cloned voice narration + screenshot frames + FFmpeg assembly + SRT/burned subtitles + mascot overlay.
- `recording`: uploaded screen recording + faster-whisper transcript + editable narration segments + burned subtitles + mascot overlay.

The stable contract is already narrow:

- `.studio.json`
- `narrations.json`
- `slides.html`
- `build/my_voice.wav`
- `recording.mp4` for recording mode

### Quality Requirements

- 9:16 portrait, platform-ready.
- Dense visual rhythm: screenshots, UI, data cards, comparison cards, terminal, browser, conclusion cards.
- No return to slow single-page pan videos.
- Subtitles must match the uploaded version. `zhibo` prefers burned subtitles for domestic platforms.
- Voice should use the user reference voice where required, not default generic TTS.
- Avoid TTS-prone Chinese polyphones in final narration.
- Platform variants need subtle anti-fingerprint changes before multi-platform publishing.
- Main platforms: Bilibili, Douyin, WeChat Channels, Kuaishou; Xiaohongshu is not part of the main flow.

### Reusable Assets

- Remotion element gallery in `videos/remotion-lab`.
- Subtitle alignment and burn-in utilities.
- faster-whisper transcription utilities.
- libass FFmpeg build.
- Mascot overlay pipeline.
- Web capture and source enrichment utilities.
- Social-auto-upload handoff and platform-specific publishing knowledge.

### Pain Points To Solve In video-maker

- Make the existing `zhibo` engine reusable without copying per-topic scripts.
- Separate content specs from rendering implementation.
- Add a renderer-agnostic quality report before publish.
- Preserve the existing domestic-platform upload details while hiding them behind a publisher adapter.

## company/side-hustle

Source reviewed:

- `/Users/zhen.liu/projects/company/side-hustle/AGENTS.md`
- `/Users/zhen.liu/projects/company/side-hustle/docs/youtube-content-spec.md`
- `/Users/zhen.liu/projects/company/side-hustle/docs/youtube-growth-strategy.md`
- `/Users/zhen.liu/projects/company/side-hustle/docs/youtube-e2e-audit.md`
- `/Users/zhen.liu/projects/company/side-hustle/packages/content/src/publish/video-source.ts`
- `/Users/zhen.liu/projects/company/side-hustle/packages/content/src/pipeline/queue.ts`
- `/Users/zhen.liu/projects/company/novel-pipeline/CLAUDE.md`
- `/Users/zhen.liu/projects/company/novel-pipeline/src/make-series.ts`
- `/Users/zhen.liu/projects/company/novel-pipeline/src/produce/*`

### Current Video Goal

The real active YouTube channel is `Levify Tales`: English animated retellings of Chinese myths, legends, and serialized web-novel moments. The immediate goal is follower growth through YouTube Shorts / vertical videos.

### Existing Pipeline

The real E2E chain is not legacy `packages/youtube`. It is:

`novel-pipeline subprocess -> shared novel-videos dir -> side-hustle content publish store -> web review/enqueue -> queue-runner -> Postiz YouTube integration -> reconcile -> captions upload`

`novel-pipeline` remains independent and must not be imported into `side-hustle`; the interface is the shared output directory.

### Quality Requirements

- 9:16 vertical video.
- English narration for overseas audience.
- Male English TTS by default.
- 45-90 seconds for current Shorts positioning, though `novel-pipeline` has older 3-5 minute route-C defaults.
- First 3 seconds must show an understandable crisis.
- Strong identity hook.
- 1-2 memorable visual anchors per episode.
- Unresolved question or cliffhanger at the end.
- Transformative safety: remove original proper nouns, change details, rewrite narration, preserve only generic story motifs, and record `transformative.note`.
- Avoid publishing if AI image artifacts are too visible.
- Captions are separate `.srt` for YouTube and easy post-editing, not burned into the MP4.
- YouTube is the only automatic platform for now.

### Reusable Assets

- Novel collector and quality filters.
- Series planner and episode storyboard generator.
- Character appearance locking across episodes.
- Keyframe generation.
- TTS and caption generation.
- FFmpeg Ken Burns assembly.
- Review HTML.
- Publish queue and Postiz/YouTube handoff.

### Pain Points To Solve In video-maker

- Unify short-video spec while preserving the file-based independence of `novel-pipeline`.
- Add stronger render quality gates for AI artifacts, blank frames, caption timing, and hook/cliffhanger checks.
- Support both burned subtitles and sidecar SRT depending on profile.
- Make render profiles explicit so old 3-5 minute defaults do not accidentally leak into Shorts.

## Shared Requirements

Both projects need:

- Portable 9:16 spec.
- Multiple renderer adapters.
- Script/story quality gates.
- Visual QA before publish.
- Subtitle QA.
- Platform-aware outputs.
- File-based handoff to avoid tight coupling.
- Idempotent jobs with review checkpoints.
- Clear distinction between draft, rendered, QA-passed, queued, published, and failed.

## Requirements Matrix

The executable cross-project requirements are maintained in `docs/project-requirements.md`.

That matrix is the source for:

- zhibo mode policies.
- Levify Tales story gates.
- Shared API requirements.
- Implementation backlog derived from both projects.

When source-project behavior changes, update `docs/project-requirements.md`, the affected profile, and `docs/api.md` together.

## Out Of Scope

This project only satisfies video production requirements. It does not own:

- POD product generation.
- Image-text social cards.
- Persona lifestyle content.
- Reddit/Pinterest/Facebook/Instagram copywriting.
- Generic marketing automation.

Any lessons from those areas are included only when they directly protect video production, such as blank media detection or publish gating.

## Iteration-Derived Requirements

The requirements above are not just desired features. They are backed by specific prior regressions in the source projects. See `docs/iteration-lessons.md` before changing architecture or renderer behavior.

Hard requirements added from iteration history:

- Sample every beat and boundary during visual QA.
- Retiming must use measured audio durations.
- Caption mode must be profile-specific and verified against the final publish artifact.
- Blank or undecodable media is fatal.
- AI story videos need hook, identity, visual anchor, cliffhanger, and transformative safety gates.
- Publishing adapters must encode per-platform quirks, timeouts, tag limits, and active-job dedupe.
- Intermediate render artifacts must be namespaced by language/render pass.
- Source projects must stay decoupled through file/subprocess handoff.
