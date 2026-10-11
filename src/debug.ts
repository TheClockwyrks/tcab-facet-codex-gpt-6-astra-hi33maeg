import * as C from "./constants";
import type { ReadState, FacetState, Screen, PointerDevice } from "./game";
import {
  cellX,
  cellY,
  deal,
  index,
  lastFall,
  legalSwap,
  parseBoard,
  parseGem,
  requestSwap,
  stepHold,
  validCell,
} from "./board";
import { initial, pointer, targets } from "./interaction";
function integer(n: number, min = 0): number {
  if (!Number.isInteger(n) || n < min) throw new RangeError("Invalid integer");
  return n;
}
function points(n: number): number {
  if (!Number.isFinite(n)) throw new RangeError("Invalid points");
  return n;
}
export const debug = {
  version: C.FACET_DEBUG_VERSION,
  reset: (s: ReadState): FacetState => ({
    ...initial(s.muted),
    assets: s.assets,
  }),
  reconcile: (s: ReadState): FacetState => ({ ...s }),
  snapshot: (s: ReadState) => ({
    version: C.FACET_DEBUG_VERSION,
    screen: s.screen,
    menuIndex: s.menuIndex,
    score: s.score,
    level: s.level,
    levelScore: s.levelScore,
    levelTarget: C.LEVEL_TARGET_STEP * s.level,
    phase: s.phase,
    chainStep: s.chainStep,
    multiplier: Math.min(s.chainStep, C.MAX_MULTIPLIER),
    swapTimer: s.swapTimer,
    stepTimer: s.stepTimer,
    stepHold: stepHold(s),
    board: {
      ...s.board,
      cells: s.board.cells.map((g) => ({
        ...g,
        x: cellX(g.col),
        y: cellY(g.row),
      })),
    },
    selection: s.selection ? { ...s.selection } : null,
    offer: s.offer ? { ...s.offer } : null,
    refusal: s.refusal
      ? { a: { ...s.refusal.a }, b: { ...s.refusal.b } }
      : null,
    lastCleared: s.lastCleared,
    lastPoints: s.lastPoints,
    lastWaves: s.lastWaves,
    lastFall: lastFall(s),
    moveScore: s.moveScore,
    bestMove: s.bestMove,
    bestChain: s.bestChain,
    legalSwap: legalSwap(s.board),
    refillKinds: [...s.refillKinds],
    pointer: { ...s.pointer },
    armedTarget: s.armedTarget,
    targets: targets(s.screen),
    muted: s.muted,
    simTime: s.simTime,
  }),
  setScreen: (s: ReadState, screen: Screen): FacetState => {
    if (
      ![
        "title",
        "howto",
        "playing",
        "paused",
        "levelclear",
        "gameover",
      ].includes(screen)
    )
      throw new Error("Invalid screen");
    return { ...s, screen };
  },
  setMenuIndex: (s: ReadState, i: number): FacetState => ({
    ...s,
    menuIndex: integer(i),
  }),
  loadBoard: (s: ReadState, rows: readonly string[]): FacetState => ({
    ...s,
    board: parseBoard(rows),
  }),
  dealBoard: (s: ReadState): FacetState => ({ ...s, board: deal() }),
  clearBoard: (s: ReadState): FacetState => ({
    ...s,
    board: { cols: 0, rows: 0, cells: [] },
  }),
  setGem: (
    s: ReadState,
    col: number,
    row: number,
    token: string,
  ): FacetState => {
    const p = validCell(col, row);
    if (!s.board.cells[index(p)]) throw new Error("No board");
    const gem = parseGem(token, col, row);
    return {
      ...s,
      board: {
        ...s.board,
        cells: s.board.cells.map((g, i) => (i === index(p) ? gem : g)),
      },
    };
  },
  setRefillKinds: (s: ReadState, col: number, kinds: string): FacetState => {
    validCell(col, 0);
    if (!/^[RACJBSM]*$/.test(kinds)) throw new Error("Invalid refill");
    return {
      ...s,
      refillKinds: s.refillKinds.map((v, i) => (i === col ? kinds : v)),
    };
  },
  clearRefillKinds: (s: ReadState): FacetState => ({
    ...s,
    refillKinds: Array(C.GRID_COLS).fill(""),
  }),
  setScore: (s: ReadState, n: number): FacetState => ({
    ...s,
    score: points(n),
  }),
  setLevel: (s: ReadState, n: number): FacetState => ({
    ...s,
    level: integer(n, 1),
  }),
  setLevelScore: (s: ReadState, n: number): FacetState => ({
    ...s,
    levelScore: points(n),
  }),
  setBestChain: (s: ReadState, n: number): FacetState => ({
    ...s,
    bestChain: integer(n),
  }),
  setBestMove: (s: ReadState, n: number): FacetState => ({
    ...s,
    bestMove: points(n),
  }),
  setMoveScore: (s: ReadState, n: number): FacetState => ({
    ...s,
    moveScore: points(n),
  }),
  setSelection: (s: ReadState, col: number, row: number): FacetState => ({
    ...s,
    selection: validCell(col, row),
  }),
  clearSelection: (s: ReadState): FacetState => ({ ...s, selection: null }),
  setOffer: (s: ReadState, col: number, row: number): FacetState => ({
    ...s,
    offer: validCell(col, row),
  }),
  clearOffer: (s: ReadState): FacetState => ({ ...s, offer: null }),
  clearRefusal: (s: ReadState): FacetState => ({ ...s, refusal: null }),
  clearChain: (s: ReadState): FacetState => ({
    ...s,
    phase: "idle",
    chainStep: 0,
    swapTimer: 0,
    stepTimer: 0,
  }),
  requestSwap: (
    s: ReadState,
    colA: number,
    rowA: number,
    colB: number,
    rowB: number,
  ): FacetState => requestSwap(s, validCell(colA, rowA), validCell(colB, rowB)),
  pointerDown: (
    s: ReadState,
    x: number,
    y: number,
    d: PointerDevice = "mouse",
  ): FacetState => pointer(s, "down", x, y, d),
  pointerMove: (
    s: ReadState,
    x: number,
    y: number,
    d: PointerDevice = "mouse",
  ): FacetState => pointer(s, "move", x, y, d),
  pointerUp: (s: ReadState, d: PointerDevice = "mouse"): FacetState =>
    pointer(s, "up", s.pointer.x, s.pointer.y, d),
};
