# Project Context

## Repository State

- Workspace root: repository root.
- Current state: shared video production contract and orchestration project.
- No Git repository detected in this workspace.
- The project currently contains docs, profiles, example specs, a JSON schema, and a dependency-free spec validator.
- Public API documentation lives in `docs/api.md`.

## Project Direction

- Primary mission: high-quality video production, not analysis-only reporting.
- Coverage target: both local video pipelines: `zhibo` AI workflow shorts and `company/side-hustle` / `novel-pipeline` `Levify Tales` story videos.
- Future capability should improve by adopting strong open-source video projects through adapters, not by rewriting mature render engines.
- Maximize reuse of mature open-source video tooling while preserving video quality.
- Preferred render engines: Remotion for React/component video, HyperFrames for agent-authored HTML video, FFmpeg for assembly/post-processing.
- Keep `zhibo` and `side-hustle` independent through file-based specs and handoff contracts.
- Publishing must go through quality gates; render commands should not directly publish.
- `video-maker` is a video production library/orchestration layer. Callers should use documented file-based APIs, not scrape incidental script internals.
- Every API change must update `docs/api.md` in the same change. API changes include command signatures, JSON fields, profile names, output paths, report fields, render adapter behavior, and QA issue codes.
- Requirements must account for source-project iteration history. Read `docs/iteration-lessons.md` before changing architecture, render adapters, QA gates, or publish flow.
- Cross-project executable requirements live in `docs/project-requirements.md`. Read it before changing profiles, VideoSpec fields, render behavior, importers, review packages, QA gates, or publisher handoff.
- Scope is video only: do not expand this repo into POD, image-text social content, or generic marketing automation.

## Current Commands

- Validate example specs: `npm run validate`.
- Run tests: `npm test`.
- Run unit tests only: `npm run test:ut`.
- Run contract tests only: `npm run test:ct`.
- Render Levify Tales spec: `npm run render:levify -- --spec <spec.json> --out <dir>`.
- Render engine comparison: `npm run render:comparison -- --spec <spec.json> --profile <profile.json> --engines remotion,hyperframes --out <dir>`.
- Generate side-hustle handoff: `npm run handoff:side-hustle -- --render-dir <dir> --out <handoff.json>`.
- Generate diverse zhibo review package: `npm run review:zhibo-diverse`.
- Run video QA: `npm run qa:video -- --spec <spec.json> --profile <profile.json> --video <video.mp4> [--out report.json]`.

## Version Record

- Version history is recorded in `docs/changelog.md`.
- Current package version: `0.1.0`.
- Generated review/video outputs under `outputs/` are local artifacts and must not be committed.
- Repository is open source under the MIT license.

## Working Rules

- Record durable project decisions here or in linked project documentation.
- Keep implementation guidance factual and update it as the project structure emerges.
- Do not add workflow assumptions until they are backed by files, commands, or user decisions.

## Multi-model Handoff

- This repository uses one shared context for Codex, Claude Code, and Gemini CLI.
- Canonical context: `CLAUDE.md`.
- Compatibility entries: `AGENTS.md`, `CLAUDE.md`, and `GEMINI.md` point to the same content.
- Durable workflow changes must be written here or in linked project docs before handoff.
