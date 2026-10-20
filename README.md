# SN Mobile DAW — audio add-on integration kit

This package contains integration modules and architecture scaffolding, not full copies of upstream repositories or a complete DAW.

## Upstream projects
- Tone.js: https://github.com/Tonejs/Tone.js — browser scheduling, transport, synths and effects; MIT.
- FFmpeg.wasm: https://github.com/ffmpegwasm/ffmpeg.wasm — optional browser encoding/conversion. Wrapper is MIT; FFmpeg core/codecs have separate license requirements.
- Matchering: https://github.com/sergree/matchering — GPL-3.0 Python reference-matching/mastering library; run separately, not as a browser dependency.
- Keel: https://github.com/fcarvajalbrown/Keel — deterministic Python stem balancing/mastering, not AI. Its engine is described as AGPL-3.0 and other app/plugin components have separate terms.

## Strict separation
`src/audio/engine.js` owns real-time playback and must not import analysis or export modules.
`src/analysis/` runs deterministic checks in a Worker and provides a separate optional AI HTTP bridge.
`src/export/` renders/encodes after a song is ready; FFmpeg loads only when MP3 is requested.

The existing starter is a plain static app. These modules use ES imports and npm packages, so the project needs a Vite build step and updated GitHub Actions deployment. Do not just drop these files into the repo and expect the live website to use them.

## Codespaces
```bash
npm install
npm run build
npm run dev -- --host 0.0.0.0
```
Build output is `dist/`. The Vite base path is set to `/sn-mobile-daw/` for GitHub Pages.

## Mobile performance guardrails
- Start audio from a user gesture on iOS.
- Decode and cache samples once.
- Schedule musical events on the audio clock, not UI timers.
- Never run AI or MP3 encoding inside real-time audio callbacks.
- Lazy-load FFmpeg; WASM conversion can use significant memory.
- No browser DAW can guarantee zero latency or zero glitches on every device.
