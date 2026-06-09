# Iteration Lessons From Source Projects

Date: 2026-06-09

This document records problems the source projects already solved through iteration. Treat these as requirements. Do not rediscover these failures in `video-maker`.

## zhibo Lessons

### 1. Render Review Must Inspect The Whole Timeline

Past failure:

- A Remotion news video looked fine at beat 0, but later beats rendered black.
- The root cause was Remotion `Sequence` frame relativity: inside `<Sequence from=X>`, `useCurrentFrame()` returns local frames, not global frames.

Requirement:

- QA must sample every beat and beat boundary, not only frame 0.
- Remotion adapter tests must guard local-frame vs global-frame usage.
- A render is not “good” until sampled frames across the whole timeline are nonblank and content-appropriate.

### 2. Audio Duration Owns Timeline Duration

Past failure:

- Fixed 4-second Remotion beats cut off narration when TTS clips were longer.

Requirement:

- Timeline retiming must happen after TTS duration measurement.
- Each beat duration must be at least measured audio duration plus profile padding.
- Final duration must derive from the retimed canonical timeline, not a hardcoded composition constant.

### 3. Captions Must Match The Publish Artifact

Past failure:

- Some Remotion videos had no burned subtitles.
- Some vertical videos used landscape subtitle style and overflowed.

Requirement:

- Caption policy is profile-level and mandatory.
- `zhibo-tech-workflow` requires burned captions in the uploaded MP4.
- Vertical subtitle style and cue length must be selected from resolution/aspect ratio, not copied by memory.
- QA must compare caption timings against the actual video duration.

### 4. Visual Density Must Be Testable

Past failure:

- Videos regressed to single-page slow pan, repeated sparse cards, or low information density.

Requirement:

- Profiles must define visual-density floors: beat count, beat duration, visual kind variety, caption length, scene coverage, and chrome/layer count.
- Auto-generated content that fails density should not render or publish.

### 5. B-roll Must Be Content-Driven And Validated

Past failure:

- Topic-mismatched fallback b-roll, such as bash/agent videos showing Notion screenshots.
- Captured web pages could be Cloudflare or login/verification pages.

Requirement:

- B-roll/source selection must score against title + narration corpus.
- Captured pages must be rejected if they look like auth walls, verification pages, placeholders, or unreadable scaled screenshots.
- Structured cards are preferred over arbitrary webpage screenshots when page capture is unreliable.

### 6. Browser Recording Needs Pixel-Level Effects, Not CSS Assumptions

Past failure:

- Playwright video recording ignored CSS transform zoom, so focus zoom did not appear in output.
- Browser recordings included leading blank paint time.

Requirement:

- Focus zoom must be burned into pixels through FFmpeg crop/scale or an equivalent post-process if browser recording cannot capture it.
- Browser recording must use prewarm-context patterns and leading blank trimming.
- Anchor selection must prefer text rects and recenter near viewport edges.

### 7. Publishing Must Be Queue-Safe And Platform-Specific

Past failure:

- Kuaishou headless publishing loop could hang for hours.
- Kuaishou allows only 4 hot tags.
- WeChat Channels and Kuaishou need headed mode in current automation.
- Retry daemons could enqueue duplicates if active jobs were ignored.

Requirement:

- Publisher adapters must encode per-platform rules.
- Every publish subprocess must have a hard timeout.
- Retry logic must check active queued/running jobs before enqueueing.
- Platform-specific variants and actual sent tags must be recorded.

### 8. Recover Half-Finished Jobs, But Never Overwrite Authored Work

Past failure:

- Failed create jobs left half directories that blocked retry.

Requirement:

- Recovery is allowed only when authored files are absent.
- Existing authored `script.md`, `narrations.json`, or project metadata must block overwrite.

## side-hustle / novel-pipeline Video Lessons

### 1. Keep External Generators Decoupled

Past resolution:

- `novel-pipeline` is independent and hands off through `SH_NOVEL_VIDEOS_DIR`.
- `side-hustle` reads finished artifacts and never imports `novel-pipeline`.

Requirement:

- `video-maker` must support file-based import/export and subprocess adapters.
- Do not force source projects into a single monorepo dependency graph.

### 2. Story Quality Is A Product Requirement

Past resolution:

- `Levify Tales` requires a 3-second crisis, identity hook, visual anchor, cliffhanger, and transformative safety note.
- Prompt tests pin front-loaded conflict, limited scenery budget, shot vocabulary, camera movement, shot rhythm, and character locking.

Requirement:

- Story gates are not optional LLM taste checks; they are profile requirements.
- Prompt contracts should be tested as text when model output is nondeterministic.

### 3. Sidecar Captions Are Required For YouTube Story Videos

Past resolution:

- `novel-pipeline` keeps captions as editable `.srt` sidecars.
- SRT cue timing uses measured TTS clip durations, not estimated text length.
- Missing captions upload fails soft after publish; missing video/captions should still be visible for review.

Requirement:

- `levify-tales` must not burn irreversible captions into the only output.
- Caption QA must support sidecar SRT and fail-soft upload outcomes.

### 4. AI Visual Artifacts Need A Gate, But The Gate Can Fail Open

Past resolution:

- Keyframe quality parsing extracts JSON verdicts and carries fatal defect/category.
- Unparseable judge output defaults non-fatal so generation does not deadlock, but review remains visible.

Requirement:

- AI artifact review should block clear defects but must not make the whole pipeline unrecoverable when the judge fails.
- QA reports must distinguish “passed”, “fatal defect”, and “judge unavailable”.

### 5. Blank Or Missing Video Visuals Are Unpublishable

Past failure:

- Flat near-uniform visuals, missing assets, or undecodable media could enter publish paths in adjacent content workflows.

Requirement:

- Blank/missing video frames, still keyframes, and source images used in video are fatal publish blockers.
- Unreadable or undecodable media must be treated as blank.

### 6. Multi-Language Outputs Need Namespaced Artifacts

Past failure:

- EN and ZH passes writing the same clip filenames could corrupt concat outputs.

Requirement:

- Adapter intermediate files must be namespaced by language/profile/render pass.
- Concat lists must use the same namespace.

### 7. Video Automation Must Be Fail-Soft And Platform-Gated

Past resolution:

- Daily video generation/render continues when one episode fails.
- Non-YouTube platforms are not auto-enqueued until their integrations are stable.
- Flagged videos stay drafts and never enqueue.

Requirement:

- Automatic publishing must be per-profile/per-platform gated.
- A single video render/generation failure must not poison the whole daily run.
- Flagged artifacts cannot publish without explicit human action.

## Resulting Design Rule

`video-maker` must start from tested failure modes:

- Define profile-specific constraints.
- Validate spec before render.
- Validate output before publish.
- Keep renderers replaceable.
- Keep source projects decoupled.
- Treat QA reports as durable artifacts, not console logs.
