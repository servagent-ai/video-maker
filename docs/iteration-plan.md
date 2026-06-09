# Iteration Plan

## Phase 0: Contract And Review Baseline

Status: started in this repo.

Deliverables:

- Portable `VideoSpec` schema.
- `zhibo` and `Levify Tales` profiles.
- Example specs.
- Open-source research and source-project review docs.
- Minimal spec validator.

Success:

- Existing projects can point to these docs and agree on the same contract vocabulary.

## Phase 1: Import Existing Outputs

Build read-only importers:

- `zhibo`: read `.studio.json`, `script.md`, `narrations.json`, `slides.html`, and local build outputs into a `VideoSpec`.
- `novel-pipeline`: read `storyboard.json`, `series.json`, `video.mp4`, `captions.srt`, frames, and audio into a `VideoSpec`.

Success:

- No existing pipeline changes required.
- Imported specs validate.
- QA can run against already-rendered videos.
- Importers preserve known contracts from `docs/iteration-lessons.md`, including caption mode, measured durations, and language/pass namespaces.

Current implementation:

- `scripts/import-zhibo-project.mjs`
- `scripts/import-novel-video.mjs`

## Phase 2: Shared QA CLI

Implement:

- ffprobe-based duration/resolution/audio checks.
- SRT parser.
- blank-frame sampling.
- beat and beat-boundary frame sampling.
- blank/undecodable image detection.
- auth-wall / verification-page detection for captured webpage assets.
- profile-specific script checks.
- quality report JSON.

Success:

- `zhibo` and `side-hustle` can block publish based on the same report format.
- Old known failures from `docs/iteration-lessons.md` are represented as tests or fixtures.

Current implementation:

- `scripts/qa-video.mjs` probes MP4s, validates profile basics, samples frames for blank/black detection, and checks sidecar SRT timing when present.

## Phase 3: Renderer Adapters

Implement render adapters in this order:

1. FFmpeg adapter for existing still-frame + audio workflows.
2. Remotion adapter for `zhibo` profile and remotion-lab catalog.
3. HyperFrames adapter for agent-authored HTML compositions.

`company/side-hustle` production requirements are tracked in
`docs/side-hustle-production-requirements.md`. New render/handoff features for
that project must include tests in the same change.

Success:

- One example spec can render through Remotion.
- One example spec can render through HyperFrames.
- Output reports compare duration, resolution, captions, and frame hashes.
- Same-content comparison can render Remotion and HyperFrames outputs from one spec and generate a review page.

Detailed requirements: `docs/platform-video-requirements.md` R1-R4.

## Phase 4: Publisher Handoff

Implement handoff adapters:

- `zhibo-sau`: write platform-ready handoff JSON and variants.
- `side-hustle-postiz`: register finished video as publish piece.
- `manual`: export an editor handoff folder.

Success:

- Rendered videos never publish without a QA report.
- Sidecar SRT and burned-caption policies are respected per profile.
- zhibo handoff encodes platform-specific rules such as Kuaishou tag caps and WeChat thumbnail requirements.

Detailed requirements: `docs/platform-video-requirements.md` R8.

## Phase 5: Continuous Open-Source Iteration

Keep open-source projects upstream-friendly:

- Track Remotion and HyperFrames release notes.
- Avoid patching engine internals unless absolutely necessary.
- Keep adapters thin.
- Prefer contributing fixes upstream when they are generic.

Success:

- New upstream renderer improvements can be adopted by changing adapter versions, not by rewriting source-project pipelines.
- Daily research produces report, selected repos, and a comparison brief that can feed the same-content comparison workflow.

Detailed requirements: `docs/platform-video-requirements.md` R9.
