/// <reference types="node" />
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { readFile } from "node:fs/promises";
import { createEngine, ConstantClock } from "@clockwyrks/simple-2d";
import { game, type FacetState } from "./game";
import * as C from "./constants";
import {
  adjacent,
  cellX,
  cellY,
  deal,
  lastFall,
  legalSwap,
  parseBoard,
  productive,
  resolve,
  runs,
  stepHold,
} from "./board";
import { debug } from "./debug";
import { action, initial, start, targets } from "./interaction";
import { advance } from "./runtime";
const alphabet = "RACJBSM";
const rows = Array.from({ length: C.GRID_ROWS }, (_, r) =>
  Array.from(
    { length: C.GRID_COLS },
    (_, c) => `${alphabet[(c + r * 2) % 7]}0`,
  ).join(" "),
);
function posed(): FacetState {
  return debug.setScreen(debug.loadBoard(initial(), rows), "playing");
}
function put(s: FacetState, col: number, row: number, token: string) {
  return debug.setGem(s, col, row, token);
}
function rowRun(n: number, token = "R0", row = 3): FacetState {
  let s = posed();
  for (let c = 1; c <= n; c++) s = put(s, c, row, token);
  return { ...s, phase: "resolving", chainStep: 1 };
}
function refill(s: FacetState) {
  for (let c = 0; c < C.GRID_COLS; c++)
    s = debug.setRefillKinds(
      s,
      c,
      Array.from(
        { length: C.GRID_ROWS },
        (_, r) => alphabet[(c + r * 2) % 7],
      ).join(""),
    );
  return s;
}
function playable(): FacetState {
  let s = posed();
  s = put(s, 0, 0, "R0");
  s = put(s, 1, 0, "A0");
  s = put(s, 2, 0, "R0");
  s = put(s, 1, 1, "R0");
  return refill(s);
}
describe("board and transaction rules", () => {
  it("deals a full clean board without runs and with a legal move", () => {
    for (let i = 0; i < 30; i++) {
      const b = deal();
      expect(b.cells).toHaveLength(64);
      expect(runs(b)).toEqual([]);
      expect(legalSwap(b)).toBe(true);
      expect(
        b.cells.every(
          (g) => g.strain === 0 && g.cut === "plain" && g.fell >= g.row + 1,
        ),
      ).toBe(true);
    }
  });
  it("parses every kind, cut and strain and rejects malformed boards", () => {
    let s = posed();
    for (const [i, t] of [
      "R0",
      "A1b",
      "C2s",
      "J3",
      "B0",
      "S1",
      "M2",
      "X3",
    ].entries())
      s = put(s, i, 0, t);
    expect(s.board.cells[7]).toMatchObject({
      kind: null,
      cut: "prism",
      strain: 3,
      fell: 0,
    });
    expect(() => parseBoard(rows.slice(1))).toThrow();
    expect(() => put(s, 8, 0, "R0")).toThrow();
    expect(() => put(s, 1, 0, "X0b")).toThrow();
    expect(() => debug.setGem(initial(), 0, 0, "R0")).toThrow();
  });
  it("reads maximal runs independent of cut and strain, excluding prisms", () => {
    let s = rowRun(5);
    s = put(s, 2, 3, "R3b");
    expect(runs(s.board).find((r) => r.cells.includes(25))?.cells).toHaveLength(
      5,
    );
    s = put(s, 3, 3, "X0");
    expect(runs(s.board).some((r) => r.cells.includes(27))).toBe(false);
  });
  it("requires orthogonal adjacency and an idle, productive board", () => {
    const s = playable(),
      before = JSON.stringify(s);
    expect(adjacent({ col: 0, row: 0 }, { col: 1, row: 1 })).toBe(false);
    const refused = debug.requestSwap(s, 0, 0, 2, 0);
    expect(refused.board).toEqual(s.board);
    expect(refused.refusal).not.toBeNull();
    const accepted = debug.requestSwap(s, 1, 0, 1, 1);
    expect(accepted.phase).toBe("swapping");
    expect(accepted.score).toBe(0);
    expect(accepted.board.cells[1].kind).toBe("ruby");
    expect(debug.requestSwap(accepted, 0, 0, 1, 0).board).toEqual(
      accepted.board,
    );
    expect(JSON.stringify(s)).toBe(before);
  });
  it("refuses an unproductive swap without changing the board", () => {
    const s = posed();
    expect(legalSwap(s.board)).toBe(false);
    const n = debug.requestSwap(s, 0, 0, 1, 0);
    expect(n.board).toEqual(s.board);
    expect(n.refusal?.timer).toBe(0);
  });
  it("starts no clearing until the full swap interval has passed", () => {
    const s = debug.requestSwap(playable(), 1, 0, 1, 1);
    const a = advance(s, C.SWAP_SECONDS - 0.001);
    expect(a.score).toBe(0);
    const b = advance(a, 0.001);
    expect(b.chainStep).toBe(1);
    expect(b.lastCleared).toBeGreaterThanOrEqual(3);
    expect(b.swapTimer).toBe(0);
  });
  it("scores flawed stones twice and caps the multiplier", () => {
    const s = rowRun(3, "R3");
    const r = resolve({ ...s, chainStep: 20 })!;
    expect(r.state.lastPoints).toBe(
      r.state.lastCleared * C.FLAWED_SCORE * C.MAX_MULTIPLIER,
    );
  });
  it("raises each surviving neighbor only once and flags newly flawed stones", () => {
    let s = rowRun(3);
    s = put(s, 2, 2, "A2");
    const r = resolve(refill(s))!;
    expect(r.flaw).toBe(true);
    expect(
      r.state.board.cells.some((g) => g.kind === "amber" && g.strain === 3),
    ).toBe(true);
  });
  it("propagates minimum waves through adjacent flawed stones", () => {
    let s = rowRun(3);
    s = put(s, 4, 3, "J3");
    s = put(s, 5, 3, "B3");
    const n = resolve(s)!.state;
    expect(
      n.motion?.cleared?.find((g) => g.col === 4 && g.row === 3)?.wave,
    ).toBe(1);
    expect(
      n.motion?.cleared?.find((g) => g.col === 5 && g.row === 3)?.wave,
    ).toBe(2);
    expect(n.lastWaves).toBe(2);
  });
  it("brilliants expand to eight neighbors and stars to the row and column", () => {
    let s = rowRun(3);
    s = put(s, 2, 3, "R0b");
    const a = resolve(s)!.state;
    expect(a.lastCleared).toBeGreaterThanOrEqual(9);
    s = put(s, 2, 3, "R0s");
    const b = resolve(s)!.state;
    expect(b.lastCleared).toBeGreaterThanOrEqual(15);
  });
  it("creates a brilliant from four and a kindless prism from five", () => {
    for (const [n, cut] of [
      [4, "brilliant"],
      [5, "prism"],
    ] as const) {
      const r = resolve(refill(rowRun(n)))!;
      expect(r.cut).toBe(true);
      const g = r.state.board.cells.find((g) => g.cut === cut);
      expect(g).toBeDefined();
      expect(g?.strain).toBe(0);
      if (cut === "prism") expect(g?.kind).toBeNull();
    }
  });
  it("places a created cut at the swapped cell with lower run index", () => {
    const s = {
      ...rowRun(4),
      motion: {
        swap: [
          { col: 1, row: 3 },
          { col: 2, row: 3 },
        ] as const,
      },
    };
    const r = resolve(s)!.state;
    expect(r.motion?.created).toContainEqual(
      expect.objectContaining({ col: 1, row: 3 }),
    );
  });
  it("creates a star at intersecting runs; a prism wins collisions", () => {
    let s = rowRun(3);
    for (const r of [2, 4]) s = put(s, 2, r, "R0");
    expect(resolve(s)!.state.board.cells.some((g) => g.cut === "star")).toBe(
      true,
    );
    s = rowRun(5);
    for (const r of [2, 4]) s = put(s, 3, r, "R0");
    const n = resolve(s)!.state;
    expect(n.board.cells.filter((g) => g.cut === "prism")).toHaveLength(1);
    expect(n.board.cells.some((g) => g.cut === "star")).toBe(false);
  });
  it("a prism swap clears the traded kind without creating cuts", () => {
    let s = playable();
    s = put(s, 0, 0, "X0");
    const n = advance(debug.requestSwap(s, 0, 0, 1, 0), C.SWAP_SECONDS);
    expect(
      n.motion?.cleared?.every((g) => g.kind === "amber" || g.cut === "prism"),
    ).toBe(true);
    expect(n.motion?.created).toEqual([]);
  });
  it("two prisms seed every cell at wave zero", () => {
    let s = posed();
    s = put(s, 0, 0, "X0");
    s = put(s, 1, 0, "X0");
    const n = advance(debug.requestSwap(s, 0, 0, 1, 0), C.SWAP_SECONDS);
    expect(n.lastCleared).toBe(64);
    expect(n.lastWaves).toBe(0);
    expect(lastFall(n)).toBe(8);
  });
  it("settling preserves survivor order, cut, strain and journey", () => {
    let s = rowRun(3);
    s = put(s, 2, 1, "S2b");
    s = refill(s);
    const n = resolve(s)!.state;
    expect(n.board.cells[2 + 2 * 8]).toMatchObject({
      kind: "sapphire",
      cut: "brilliant",
      strain: 2,
      fell: 1,
    });
    expect(n.board.cells[2]).toMatchObject({
      kind: "citrine",
      strain: 0,
      cut: "plain",
      fell: 1,
    });
  });
  it("unposed refills are random instead of defaulting to one kind", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.9);
    const n = resolve(rowRun(3))!.state;
    expect(n.board.cells[1].kind).toBe("amethyst");
    vi.restoreAllMocks();
  });
  it("a settled chain retains fell and updates best move", () => {
    let n = debug.requestSwap(playable(), 1, 0, 1, 1);
    n = advance(n, 4);
    expect(n.phase).toBe("idle");
    expect(n.chainStep).toBe(0);
    expect(n.bestMove).toBe(n.moveScore);
    expect(n.board.cells.some((g) => g.fell > 0)).toBe(true);
  });
  it("consumes the same elapsed time across differently divided frames", () => {
    const s = debug.requestSwap(playable(), 1, 0, 1, 1);
    const a = advance(s, 0.6);
    let b = s;
    for (let i = 0; i < 60; i++) b = advance(b, 0.01);
    expect(a.board).toEqual(b.board);
    expect(a.phase).toBe(b.phase);
    expect(a.stepTimer).toBeCloseTo(b.stepTimer);
    expect(a.score).toBe(b.score);
  });
  it("level completion takes precedence over exhaustion and continues fresh", () => {
    let n = debug.setLevelScore(
      debug.requestSwap(playable(), 1, 0, 1, 1),
      C.LEVEL_TARGET_STEP,
    );
    n = advance(n, 4);
    expect(n.screen).toBe("levelclear");
    const next = action(n, "confirm");
    expect(next.level).toBe(2);
    expect(next.score).toBe(n.score);
    expect(next.levelScore).toBe(0);
    expect(next.bestMove).toBe(0);
  });
  it("pauses every board timer and ages refusals only in play", () => {
    let s = debug.requestSwap(posed(), 0, 0, 1, 0);
    const p = advance(debug.setScreen(s, "paused"), 10);
    expect(p.refusal?.timer).toBe(0);
    s = advance(s, C.REFUSAL_SECONDS);
    expect(s.refusal).toBeNull();
  });
});
describe("input and debug contract", () => {
  it.each(["mouse", "pen", "touch"] as const)(
    "selects, previews and swaps on release with %s",
    (device) => {
      let s = playable();
      s = debug.pointerDown(s, cellX(1), cellY(0), device);
      s = debug.pointerMove(s, cellX(1), cellY(1), device);
      expect(s.phase).toBe("idle");
      expect(s.offer).toEqual({ col: 1, row: 1 });
      s = debug.pointerUp(s, device);
      expect(s.phase).toBe("swapping");
      expect(s.selection).toBeNull();
      expect(s.offer).toBeNull();
      expect(s.pointer.device).toBe(device);
    },
  );
  it("withdraws the offer on return; unrelated motion preserves it", () => {
    let s = debug.pointerDown(playable(), cellX(1), cellY(0));
    s = debug.pointerMove(s, cellX(1), cellY(1));
    s = debug.pointerMove(s, 0, 0);
    expect(s.offer).not.toBeNull();
    s = debug.pointerMove(s, cellX(1), cellY(0));
    s = debug.pointerUp(s);
    expect(s.offer).toBeNull();
    expect(s.phase).toBe("idle");
    expect(s.selection).not.toBeNull();
  });
  it("a later adjacent press offers; an outside press clears selection", () => {
    let s = debug.pointerDown(playable(), cellX(1), cellY(0));
    s = debug.pointerUp(s);
    s = debug.pointerDown(s, cellX(1), cellY(1));
    expect(s.offer).not.toBeNull();
    s = debug.pointerDown(s, 0, 0);
    expect(s.selection).toBeNull();
    expect(s.offer).toBeNull();
  });
  it("resolves exact cell ties in reading order", () => {
    const s = debug.pointerDown(posed(), cellX(0) + C.GEM_HIT_R, cellY(0));
    expect(s.selection).toEqual({ col: 0, row: 0 });
  });
  it("requires release inside the same armed target", () => {
    const t = targets("title")[0];
    let s = debug.pointerDown(initial(), t.x + 10, t.y + 10);
    s = debug.pointerMove(s, 0, 0);
    s = debug.pointerUp(s);
    expect(s.screen).toBe("title");
    s = debug.pointerDown(s, t.x + 10, t.y + 10);
    s = debug.pointerUp(s);
    expect(s.screen).toBe("playing");
  });
  it("supports the complete keyboard menu journey", () => {
    let s = action(initial(), "down");
    s = action(s, "confirm");
    expect(s.screen).toBe("howto");
    s = action(s, "back");
    expect(s.menuIndex).toBe(1);
    s = action(s, "up");
    s = action(s, "confirm");
    expect(s.screen).toBe("playing");
    s = action(s, "pause");
    expect(s.screen).toBe("paused");
    expect(action(s, "back").screen).toBe("paused");
    s = action(s, "confirm");
    s = action(s, "pause");
    s = action(s, "down");
    s = action(s, "confirm");
    expect(s.board.cells).toEqual([]);
    expect(s.screen).toBe("title");
  });
  it("game over back retains the board while quit removes it", () => {
    const s = debug.setScreen(posed(), "gameover");
    expect(action(s, "back").board).toEqual(s.board);
    expect(action({ ...s, menuIndex: 1 }, "confirm").board.cells).toEqual([]);
  });
  it("poses fields independently and reconciles without advancing", () => {
    let s = posed();
    s = debug.setLevel(s, 7);
    s = debug.setScore(s, 999);
    s = debug.setLevelScore(s, 123);
    s = debug.setBestMove(s, 77);
    s = debug.setBestChain(s, 4);
    s = debug.setMoveScore(s, 12);
    s = debug.setMenuIndex(s, 99);
    s = debug.setSelection(s, 7, 7);
    s = debug.setOffer(s, 0, 0);
    const n = debug.reconcile(s);
    expect(n).toEqual(s);
    expect(debug.snapshot(n)).toMatchObject({
      levelTarget: 14000,
      score: 999,
      levelScore: 123,
      bestMove: 77,
      bestChain: 4,
      moveScore: 12,
      menuIndex: 99,
      lastFall: 0,
      stepHold: C.STEP_SECONDS,
    });
    expect(debug.clearSelection(s).offer).toEqual(s.offer);
    expect(debug.clearOffer(s).selection).toEqual(s.selection);
    expect(debug.clearBoard(s).selection).toEqual(s.selection);
    expect(debug.reset({ ...s, muted: true })).toEqual(initial(true));
  });
  it("rejects values outside declared domains", () => {
    const s = initial();
    for (const f of [
      () => debug.setLevel(s, 0),
      () => debug.setBestChain(s, -1),
      () => debug.setMenuIndex(s, 1.5),
      () => debug.setRefillKinds(s, 0, "X"),
      () => debug.setScore(s, NaN),
      () => debug.pointerMove(s, Infinity, 0),
    ])
      expect(f).toThrow();
  });
  it("reports all targets within the stage with fingertip-sized areas", () => {
    for (const screen of [
      "title",
      "howto",
      "playing",
      "paused",
      "levelclear",
      "gameover",
    ] as const) {
      for (const t of targets(screen)) {
        expect(t.w).toBeGreaterThanOrEqual(C.TARGET_MIN_W);
        expect(t.h).toBeGreaterThanOrEqual(C.TARGET_MIN_H);
        expect(t.x + t.w).toBeLessThanOrEqual(C.STAGE_W);
        expect(t.y + t.h).toBeLessThanOrEqual(C.STAGE_H);
      }
    }
  });
});
// Only host decoding is adapted. The actual engine, assets, renderer, input and clock run.
beforeAll(() => {
  vi.stubGlobal(
    "fetch",
    async (url: string) => new Response(await readFile(`public/${url}`)),
  );
  vi.stubGlobal("createImageBitmap", async (blob: Blob) =>
    loadImage(Buffer.from(await blob.arrayBuffer())),
  );
  vi.stubGlobal(
    "AudioContext",
    class {
      async decodeAudioData(data: ArrayBuffer) {
        expect(new TextDecoder().decode(data.slice(0, 4))).toBe("RIFF");
        return { duration: (data.byteLength - 44) / 44100 };
      }
    },
  );
});
afterAll(() => vi.unstubAllGlobals());
describe("Simple 2D integration", () => {
  it("initializes real committed art, steps and renders a chain on the engine", async () => {
    const canvas = createCanvas(C.STAGE_W, C.STAGE_H),
      events = new EventTarget();
    const engine = createEngine({
      canvas: canvas as unknown as HTMLCanvasElement,
      width: C.STAGE_W,
      height: C.STAGE_H,
      game,
      clock: new ConstantClock(10),
      layout: C.LAYOUT,
      surface: {
        cssWidth: () => C.STAGE_W,
        cssHeight: () => C.STAGE_H,
        dpr: () => 1,
        events: () => events,
      },
    });
    const loaded: string[] = [],
      played: string[] = [];
    engine.events.on("asset:loaded", (e) => loaded.push(e.path));
    engine.events.on("cue:played", (e) => played.push(e.cue));
    await engine.initialize();
    expect(loaded.length).toBeGreaterThan(100);
    expect(engine.debug.version).toBe(C.FACET_DEBUG_VERSION);
    await engine.advance(1);
    expect(engine.state.simTime).toBe(0.01);
    engine.apply((s) => ({ ...playable(), assets: s.assets }));
    engine.apply((s) => engine.debug.requestSwap(s, 1, 0, 1, 1));
    await engine.advance(18);
    expect(engine.state.phase).toBe("resolving");
    expect(played).toContain(C.CUES.clear);
    expect(engine.diagnostics().every((d) => !d.error)).toBe(true);
    await engine.advance(150);
    expect(engine.state.bestMove).toBeGreaterThan(0);
    for (const screen of [
      "howto",
      "paused",
      "levelclear",
      "gameover",
      "title",
    ] as const) {
      engine.apply((s) => engine.debug.setScreen(s, screen));
      await engine.advance(1);
    }
    expect(canvas.toBuffer("image/png").length).toBeGreaterThan(10000);
    engine.destroy();
  });
  it("preserves opening rules through the production start path", () => {
    const s = start(initial());
    expect(s.phase).toBe("idle");
    expect(s.score).toBe(0);
    expect(productive(s.board, s.board.cells[0], s.board.cells[63])).toBe(
      false,
    );
    expect(stepHold(s)).toBe(C.STEP_SECONDS + 8 * C.FALL_SECONDS_PER_ROW);
  });
});
