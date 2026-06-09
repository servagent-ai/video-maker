# Changelog

## 0.1.0 - 2026-06-09

- Initialized `video-maker` as a shared video production library and orchestration layer for `zhibo` and `company/side-hustle`.
- Added public API contract, project requirements matrix, profiles, VideoSpec schema, example specs, importers, render adapters, review packages, QA helpers, and publish handoff manifests.
- Added first-pass production CLIs for Levify rendering, Remotion/HyperFrames-compatible rendering, engine comparison, side-hustle handoff, zhibo publish handoff, and review pages.
- Added QA gates for video/audio integrity, captions, blank frames, mode/aspect preservation, timeline audio fit, visual density, story hooks, transformative safety, and publish target gating.
- Added unit tests, contract tests, and CI workflow for validation, UT, and CT.
- Published repository as open source under the MIT license.
- Added `SECURITY.md`, local `security:scan`, CI security scanning, stricter secret ignores, and scrubbed machine-specific source paths from the public tree.
- Added style/element catalog, `render:zhibo` adapter, Levify asset-mode rendering from scene frames/audio, and project-specific integration guides with responsibility boundaries.
- Expanded README with open-source project overview, demos, public command reference, zhibo service tutorial, Levify/side-hustle service tutorial, QA, testing, security, and integration boundaries.
