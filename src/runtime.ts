import type { InitApi, UpdateApi } from "@clockwyrks/simple-2d";
import type { ParticleSystem } from "@clockwyrks/particle-runtime";
import * as C from "./constants";
import type { FacetState, ReadState, FacetDebugApi } from "./game";
import { lastFall, legalSwap, resolve, stepHold } from "./board";
import { action, initial, pointer } from "./interaction";
import { debug } from "./debug";
export async function initialize(
  api: InitApi<FacetState>,
): Promise<[FacetState, FacetDebugApi]> {
  for (const name of C.ACTIONS)
    api.input.register(name, { keys: [...C.BINDINGS[name]] });
  const paths = ["gems/frame.png", "gems/brilliant.png", "gems/star.png"];
  for (const kind of [...C.GEM_KINDS, "prism"])
    for (let strain = 0; strain <= C.MAX_STRAIN; strain++)
      paths.push(`gems/${kind}-${strain}.png`);
  for (const kind of C.GEM_KINDS)
    for (let f = 0; f < 6; f++) paths.push(`gems/break/${kind}/${f}.png`);
  for (let f = 0; f < 6; f++) paths.push(`gems/prism-turn/${f}.png`);
  const images = Object.fromEntries(
    await Promise.all(
      paths.map(
        async (path) => [path, await api.assets.loadImage(path)] as const,
      ),
    ),
  );
  const effects = Object.fromEntries(
    await Promise.all(
      ["clear", "flaw", "cut", "aura"].map(
        async (name) =>
          [
            name,
            JSON.parse(
              await (await api.assets.load(`fx/${name}.json`)).text(),
            ) as ParticleSystem,
          ] as const,
      ),
    ),
  );
  await Promise.all([
    ...Object.values(C.CUES)
      .filter((c) => c !== C.CUES.clear)
      .map((c) => api.audio.load(c, `audio/${c}.wav`)),
    api.audio.load(C.CUES.clear, "audio/shatter.wav"),
    api.audio.load("title-music", "audio/title.wav"),
    api.audio.load("play-music", "audio/play.wav"),
    ...Array.from({ length: C.MAX_MULTIPLIER }, (_, i) =>
      api.audio.load(`rung-${i + 1}`, `audio/chain-${i + 1}.wav`),
    ),
  ]);
  const fields = [
    "screen",
    "phase",
    "score",
    "level",
    "levelScore",
    "levelTarget",
    "chainStep",
    "multiplier",
    "lastCleared",
    "lastPoints",
    "lastWaves",
    "lastFall",
    "bestMove",
    "bestChain",
    "legalSwap",
  ] as const;
  for (const key of fields)
    api.diagnostics.register(key, (s) => debug.snapshot(s)[key]);
  api.diagnostics.register("cols", (s) => s.board.cols);
  api.diagnostics.register("rows", (s) => s.board.rows);
  for (const key of ["selection", "offer"] as const)
    api.diagnostics.register(key, (s) =>
      s[key] ? `${s[key].col},${s[key].row}` : "none",
    );
  api.diagnostics.register(
    "pointer",
    (s) =>
      `${s.pointer.x.toFixed(0)},${s.pointer.y.toFixed(0)} ${s.pointer.device}`,
  );
  return [{ ...initial(), assets: { images, effects } }, debug];
}
/** Advance every crossed boundary, retaining excess delta across swaps and steps. */
export function advance(
  s: ReadState,
  dt: number,
  emit: (cue: C.CueName, rung?: number) => void = () => {},
): FacetState {
  let n: FacetState = s;
  if (n.screen !== "playing") return n;
  if (n.refusal) {
    const timer = n.refusal.timer + dt;
    n = {
      ...n,
      refusal: timer >= C.REFUSAL_SECONDS ? null : { ...n.refusal, timer },
    };
  }
  let remaining = dt;
  while (remaining > 1e-10 && n.phase !== "idle" && n.screen === "playing") {
    if (n.phase === "swapping") {
      const used = Math.min(remaining, C.SWAP_SECONDS - n.swapTimer);
      remaining -= used;
      n = { ...n, swapTimer: n.swapTimer + used };
      if (n.swapTimer + 1e-10 < C.SWAP_SECONDS) break;
      n = {
        ...n,
        phase: "resolving",
        chainStep: 1,
        swapTimer: 0,
        stepTimer: 0,
      };
      const result = resolve(n);
      if (result) {
        n = result.state;
        emit(C.CUES.clear, Math.min(n.chainStep, C.MAX_MULTIPLIER));
        if (result.flaw) emit(C.CUES.flaw);
        if (result.cut) emit(C.CUES.cut);
      } else n = { ...n, phase: "idle", chainStep: 0 };
    } else {
      const land =
        n.lastWaves * C.WAVE_SECONDS + lastFall(n) * C.FALL_SECONDS_PER_ROW;
      const hold = stepHold(n),
        used = Math.min(remaining, hold - n.stepTimer),
        previous = n.stepTimer;
      remaining -= used;
      n = { ...n, stepTimer: n.stepTimer + used };
      if (
        previous < land &&
        n.stepTimer + 1e-10 >= land &&
        lastFall(n) > C.LAND_MIN_ROWS
      )
        emit(C.CUES.land);
      if (n.stepTimer + 1e-10 < hold) break;
      const result = resolve({
        ...n,
        chainStep: n.chainStep + 1,
        stepTimer: 0,
      });
      if (result) {
        n = result.state;
        emit(C.CUES.clear, Math.min(n.chainStep, C.MAX_MULTIPLIER));
        if (result.flaw) emit(C.CUES.flaw);
        if (result.cut) emit(C.CUES.cut);
      } else {
        n = {
          ...n,
          phase: "idle",
          chainStep: 0,
          stepTimer: 0,
          bestMove: Math.max(n.bestMove, n.moveScore),
          motion: undefined,
        };
        if (n.levelScore >= C.LEVEL_TARGET_STEP * n.level) {
          n = { ...n, screen: "levelclear", menuIndex: 0, armedTarget: null };
          emit(C.CUES.levelUp);
        } else if (!legalSwap(n.board)) {
          n = { ...n, screen: "gameover", menuIndex: 0, armedTarget: null };
          emit(C.CUES.gameOver);
        }
      }
    }
  }
  return n;
}
export function update(s: ReadState, api: UpdateApi, dt: number): FacetState {
  const cues = new Set<C.CueName>();
  let clearRung = 1;
  let n: FacetState = { ...s, simTime: s.simTime + dt };
  const pressed = Object.fromEntries(
    C.ACTIONS.map((name) => [name, api.input.pressed(name)]),
  );
  if (pressed.mute) api.audio.setMuted(!api.audio.muted());
  for (const name of C.ACTIONS)
    if (pressed[name] && name !== "mute") n = action(n, name);
  for (const sample of api.input.pointerSamples())
    if (
      sample.primary &&
      (sample.button === null || sample.button === "primary")
    ) {
      const before = n;
      n = pointer(n, sample.type, sample.x, sample.y, sample.device);
      if (n.selection !== before.selection && n.selection)
        cues.add(C.CUES.select);
      if (n.phase === "swapping" && before.phase === "idle")
        cues.add(C.CUES.swap);
      if (n.refusal !== before.refusal && n.refusal) cues.add(C.CUES.refuse);
    }
  n = advance(n, dt, (cue, rung) => {
    cues.add(cue);
    if (rung !== undefined) clearRung = rung;
  });
  const p = api.input.pointer();
  n = {
    ...n,
    pointer: { x: p.x, y: p.y, down: p.down, device: p.device },
    muted: api.audio.muted(),
  };
  for (const cue of cues) {
    api.audio.play(cue);
    if (cue === C.CUES.clear) {
      api.audio.play(`rung-${clearRung}`);
    }
  }
  const title = n.screen === "title" || n.screen === "howto";
  api.audio.stop(title ? "play-music" : "title-music");
  api.audio.loop(title ? "title-music" : "play-music");
  return n;
}
