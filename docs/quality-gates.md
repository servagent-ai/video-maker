# Video Quality Gates

## Gate Levels

- `fatal`: block publish.
- `soft`: allow manual review, do not auto-publish.
- `info`: record only.

## Scope

These gates apply to video production artifacts only: scripts, storyboards, visual assets used in video, audio, captions, rendered MP4/WebM files, video variants, and video publish handoff. They do not define quality requirements for non-video social posts, POD products, or generic marketing copy.

## Universal Gates

### Spec Completeness

Fatal if:

- Missing profile.
- Missing scenes.
- Missing render format.
- Missing publish target.
- Duration outside profile bounds.
- A required asset path is absent.

### Render Integrity

Fatal if:

- Output MP4 missing or zero bytes.
- Duration differs from spec by more than profile tolerance.
- Resolution or aspect ratio mismatches profile.
- Audio track is missing when narration is required.
- More than 0.5 seconds of unexpected black/blank frames outside transitions.
- Sampled beat-boundary frames are blank, black, or still showing a previous/placeholder scene.
- Intermediate artifacts from different languages/render passes collide.
- A mode-specific landscape output is forced into a portrait canvas, or a portrait short is accidentally rendered landscape.
- Any scene/beat duration is shorter than measured narration audio plus profile padding.

Soft if:

- Average bitrate is below profile target.
- Loudness is outside target but still listenable.
- Render metadata is incomplete.

### Caption Integrity

Fatal if:

- Required captions are missing.
- Captions overlap in invalid ways.
- Captions extend past video duration.
- Burned-caption profile produced only sidecar captions.
- Sidecar-caption profile burned irreversible captions into the only output.

Soft if:

- Any caption block exceeds platform readability limits.
- Speech-to-caption alignment drift exceeds profile threshold.
- TTS-prone words are detected in Chinese narration.

### Visual Quality

Fatal if:

- AI story frames contain obvious broken faces/hands in a hero shot.
- Scene has missing frame or placeholder.
- Scene capture is an auth wall, login page, Cloudflare/verification page, or unrelated fallback.
- Text is cropped or unreadable.
- UI elements overlap incoherently.
- Blank or undecodable image/video asset is referenced for publish.

Soft if:

- Too many consecutive static scenes.
- Visual rhythm is below profile density target.
- Repeated template pattern is too obvious.

For `zhibo-tech-workflow`, fatal or review-blocking by mode if:

- Visual kind variety is below the mode profile.
- A PPT/screen/terminal mode is scaled so far down that text is unreadable in the review page or platform upload.
- A browser capture shows login, Cloudflare, verification, blank paint, or unrelated fallback content.

### Script/Story Quality

For `zhibo-tech-workflow`, fatal if:

- The video has no actionable workflow.
- Technical terms are not explained in plain language.
- It contains unsupported Levify claims.

For `levify-tales`, fatal if:

- First 3 seconds lack a clear crisis.
- No identity hook.
- No visual anchor.
- No cliffhanger or unresolved question.
- `transformative.note` is missing.
- Proper nouns or copied source wording leak from source material.

## Publish Integrity

Fatal if:

- Artifact status is flagged.
- QA report is absent.
- Publisher adapter has no platform-specific timeout.
- Auto-publish target is not allowed by the profile.
- Required platform-specific metadata is missing, such as thumbnail for WeChat Channels or tag limits for Kuaishou.

Soft if:

- Caption upload fails after YouTube video publish. Record and expose the failure, but do not erase the successful video publish state.

## Profile Defaults

### zhibo-tech-workflow

- Aspect: 9:16.
- Resolution: 1080x1920.
- FPS: 30.
- Caption policy: burned.
- Duration target: 45-120 seconds.
- Visual density: high.
- Publish mode: domestic multi-platform with per-platform variants.

### levify-tales

- Aspect: 9:16.
- Resolution: 1080x1920.
- FPS: 30.
- Caption policy: sidecar SRT for YouTube.
- Duration target: 45-90 seconds.
- Visual density: cinematic story beats.
- Publish mode: YouTube only by default.

## Implementation Notes

Start with deterministic checks:

- JSON spec validation.
- file existence.
- ffprobe duration/resolution/audio.
- SRT parser checks.
- frame sampling for blank/black frames.

Then add model-assisted checks:

- script hook/clarity judgement.
- story cliffhanger judgement.
- AI artifact review over sampled frames.
- platform caption readability review.
