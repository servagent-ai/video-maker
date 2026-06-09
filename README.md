# video-maker

Shared video production layer for `zhibo` and `company/side-hustle`.

The project goal is to reuse mature open-source video tooling as much as possible while keeping output quality high. This repo owns the portable video contracts, render adapters, video quality gates, and iteration plan. Rendering engines and video publishers stay pluggable.

Scope is video only: scripts, storyboards, assets, narration, captions, rendering, QA, variants, and video publish handoff.

## Public API

This repo is a video production library and orchestration layer. Public file-based APIs are documented in [docs/api.md](docs/api.md): VideoSpec, source project import, QA, review package generation, programmatic QA helpers, and render adapter contracts.

Every API change must update [docs/api.md](docs/api.md) in the same change. API changes include command signatures, JSON fields, profile names, output paths, report fields, render adapter behavior, and QA issue codes.

## Direction

- Primary mission: produce high-quality videos for both local source projects, not just analyze them.
- Coverage target: `zhibo` AI workflow/video-platform pipeline and `company/side-hustle` `Levify Tales` story-video pipeline.
- Continuous improvement: keep renderers and QA adapters thin so capability can improve as high-quality open-source projects evolve.
- Default render engine for React/motion libraries: Remotion.
- Default render engine for agent-authored HTML video: HyperFrames.
- Timeline interchange target: OpenTimelineIO-compatible manifest when manual editor handoff is needed.
- Media processing: FFmpeg, with a libass-capable build for burned captions.
- Speech/subtitle analysis: Whisper/faster-whisper style transcription and alignment.

## Repository Layout

```text
docs/
  changelog.md               Version and change record.
  open-source-research.md    Research and selection notes.
  source-project-review.md   zhibo and side-hustle video requirements.
  platform-video-requirements.md  Production backlog migrated from source projects.
  project-requirements.md    Executable zhibo and Levify Tales requirements matrix.
  architecture.md            Target architecture and adapter boundaries.
  quality-gates.md           Video quality checks that must pass before publish.
  api.md                     Public API contract for callers and agents.
  side-hustle-production-requirements.md
                             Production handoff requirements from side-hustle.
  iteration-lessons.md       Prior regressions from source projects that define hard requirements.
  iteration-plan.md          Practical migration and build plan.
profiles/
  zhibo-tech-workflow.json   9:16 AI workflow short-video profile.
  levify-tales.json          9:16 English story-series profile.
specs/examples/
  *.json                     Example portable video specs.
src/schema/
  video-spec.schema.json     First portable video spec contract.
scripts/
  validate-spec.mjs          Dependency-free spec validator.
```

## Commands

```bash
npm run validate
npm test
npm run render:levify -- --spec specs/examples/levify-tales-episode.json --out outputs/dev/levify-example
npm run render:comparison -- --spec specs/examples/levify-tales-episode.json --profile profiles/levify-tales.json --engines remotion,hyperframes --out outputs/dev/engine-comparison
npm run handoff:side-hustle -- --render-dir outputs/dev/levify-example --out outputs/dev/levify-example/handoff.json
```

The validator intentionally starts small: it checks the current portable contract without forcing either existing project to change immediately.
