# Facet

A browser puzzle of cut stones, accumulating strain, and cascading fractures. Swap neighboring gems into lines of three. Every clear damages nearby stones; flawed stones join the next clear that touches them and score double. Earn brilliant, star, and prism cuts to turn a small opening into a long chain.

## Run

```sh
npm ci
npm run dev
```

Open the local URL printed by Vite. There is no server-side game logic, account, or external service.

## Production

```sh
npm run build
npm run preview
```

The complete static site is in `dist/`. Serve that directory at an origin root or any sub-path. All runtime assets use relative URLs.

The PNG artwork, animation frames, particle systems, WAV audio, and MIDI scores are committed under `public/assets/`. The build only bundles them; it does not call asset-generation tools. `tools/produce.py` documents the one-time authoring process and is optional studio tooling, not a build prerequisite. It uses `draw`, `draw-sheet`, `particle-2d`, `sfx-synth`, `sfx-sample`, and `music` when those tools are available.

## Controls

- Mouse, pen, or touch: press a gem, drag onto an orthogonal neighbor, and release. You can also tap one gem and then its neighbor. Drag back to the selected gem before releasing to cancel.
- All menus and the Pause/Back buttons work with the pointer.
- Arrow Up/Down: move the menu highlight. Enter or Space: choose.
- Escape or P: pause/resume. Escape also returns from instructions and the final score screen.
- M: mute all sound. Backtick: engine diagnostics.

A level ends when its target is reached. Continue starts a fresh board and keeps the round score. The round ends when no legal swap remains.

## Verification

```sh
npm run typecheck
npm run lint
npm run format
npm test
```

The test suite covers match and swap rules, breadth-first clear expansion, cut creation and precedence, strain, gravity, scoring, elapsed-time boundaries, menus, pointer transactions, debug poses, and integration with Simple 2D over a real canvas. It loads the committed image and audio files in the integration test; Node's host decoding is adapted without replacing the engine.

`src/board.ts` contains the canvas-independent rules. `src/interaction.ts` handles menus and pointer transactions. `src/runtime.ts` binds the engine, assets, audio, and timing. `src/render.ts` draws the presentation and simulates the authored particle systems. `src/debug.ts` implements the engine-owned automation surface. No debug object is installed on the production page.

## Showcase

`showcase/` contains the player description, screenshots, and an engine-recorded chain replay. To recapture with the development server running, use `node tools/capture.mjs`. That script uses project-local Playwright and its isolated capture host, which is not part of the production entry.
