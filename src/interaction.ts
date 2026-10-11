import * as C from "./constants";
import type {
  FacetState,
  ReadState,
  Screen,
  PointerDevice,
  CellRef,
} from "./game";
import { adjacent, cellX, cellY, deal, requestSwap, same } from "./board";
export function initial(muted = false): FacetState {
  return {
    screen: "title",
    menuIndex: 0,
    board: { cols: 0, rows: 0, cells: [] },
    phase: "idle",
    chainStep: 0,
    swapTimer: 0,
    stepTimer: 0,
    score: 0,
    level: 1,
    levelScore: 0,
    lastCleared: 0,
    lastPoints: 0,
    lastWaves: 0,
    moveScore: 0,
    bestMove: 0,
    bestChain: 0,
    selection: null,
    offer: null,
    refusal: null,
    armedTarget: null,
    pointer: { x: 0, y: 0, down: false, device: "mouse" },
    simTime: 0,
    muted,
    refillKinds: Array(C.GRID_COLS).fill(""),
  };
}
export interface Target {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
}
export function targets(screen: Screen): Target[] {
  if (screen === "playing")
    return [{ id: "pause", x: 1052, y: 30, w: 160, h: C.TARGET_MIN_H }];
  if (screen === "howto")
    return [{ id: "back", x: 80, y: 600, w: 180, h: C.TARGET_MIN_H }];
  return [0, 1].map((i) => ({
    id: `menu-${i}`,
    x: screen === "title" ? 132 : 480,
    y: (screen === "title" ? 407 : 411) + i * 86,
    w: 320,
    h: C.TARGET_MIN_H,
  }));
}
export function changeScreen(s: ReadState, screen: Screen): FacetState {
  return { ...s, screen, menuIndex: 0, armedTarget: null };
}
export function start(s: ReadState, nextLevel = false): FacetState {
  return {
    ...(nextLevel
      ? s
      : {
          ...initial(s.muted),
          assets: s.assets,
          simTime: s.simTime,
          pointer: s.pointer,
          refillKinds: s.refillKinds,
        }),
    screen: "playing",
    menuIndex: 0,
    board: deal(),
    level: nextLevel ? s.level + 1 : 1,
    levelScore: 0,
    moveScore: 0,
    bestMove: 0,
    bestChain: 0,
    phase: "idle",
    chainStep: 0,
    swapTimer: 0,
    stepTimer: 0,
    selection: null,
    offer: null,
    refusal: null,
    armedTarget: null,
    motion: { dealAt: s.simTime },
  };
}
export function quit(s: ReadState): FacetState {
  return {
    ...changeScreen(s, "title"),
    board: { cols: 0, rows: 0, cells: [] },
    phase: "idle",
    chainStep: 0,
    swapTimer: 0,
    stepTimer: 0,
    selection: null,
    offer: null,
    refusal: null,
    motion: undefined,
  };
}
export function choose(s: ReadState): FacetState {
  if (s.screen === "title")
    return s.menuIndex === 0 ? start(s) : changeScreen(s, "howto");
  if (s.screen === "paused")
    return s.menuIndex === 0 ? changeScreen(s, "playing") : quit(s);
  if (s.screen === "levelclear")
    return s.menuIndex === 0 ? start(s, true) : quit(s);
  if (s.screen === "gameover") return s.menuIndex === 0 ? start(s) : quit(s);
  return s;
}
export function action(s: ReadState, name: string): FacetState {
  if (name === "pause" && (s.screen === "playing" || s.screen === "paused"))
    return changeScreen(s, s.screen === "playing" ? "paused" : "playing");
  if (name === "back" && s.screen === "howto")
    return { ...changeScreen(s, "title"), menuIndex: 1 };
  if (name === "back" && s.screen === "gameover")
    return changeScreen(s, "title");
  if (s.screen === "playing" || s.screen === "howto") return s;
  if (name === "up" || name === "down")
    return { ...s, menuIndex: (s.menuIndex + 1) % 2 };
  if (name === "confirm") return choose(s);
  return s;
}
export function hitCell(s: ReadState, x: number, y: number): CellRef | null {
  let found: CellRef | null = null,
    best = C.GEM_HIT_R * C.GEM_HIT_R;
  for (const g of s.board.cells) {
    const d = (cellX(g.col) - x) ** 2 + (cellY(g.row) - y) ** 2;
    if (d < best || (d === best && !found)) {
      best = d;
      found = { col: g.col, row: g.row };
    }
  }
  return found;
}
export function pointer(
  s: ReadState,
  type: "down" | "move" | "up",
  x: number,
  y: number,
  device: PointerDevice = "mouse",
): FacetState {
  if (
    !Number.isFinite(x) ||
    !Number.isFinite(y) ||
    !["mouse", "pen", "touch"].includes(device)
  )
    throw new Error("Invalid pointer");
  let n: FacetState = {
    ...s,
    pointer: {
      x,
      y,
      device,
      down: type === "down" ? true : type === "up" ? false : s.pointer.down,
    },
  };
  const target = targets(s.screen).find(
    (t) => x >= t.x && x <= t.x + t.w && y >= t.y && y <= t.y + t.h,
  );
  if (target?.id.startsWith("menu-") && (type === "down" || !s.pointer.down))
    n = { ...n, menuIndex: Number(target.id.slice(5)) };
  if (type === "down") n = { ...n, armedTarget: target?.id ?? null };
  if (type === "up") {
    n = { ...n, armedTarget: null };
    if (target && s.armedTarget === target.id)
      return target.id.startsWith("menu-") ? choose(n) : action(n, target.id);
    if (s.armedTarget) return n;
  }
  if (s.screen !== "playing" || target || (s.armedTarget && type !== "down"))
    return n;
  const cell = hitCell(n, x, y);
  if (type === "down") {
    if (!cell) return { ...n, selection: null, offer: null };
    if (same(cell, n.selection)) return { ...n, offer: null };
    if (n.selection && adjacent(cell, n.selection))
      return { ...n, offer: cell };
    return { ...n, selection: cell, offer: null };
  }
  if (type === "move" && n.pointer.down && n.selection && cell) {
    if (same(cell, n.selection)) return { ...n, offer: null };
    if (adjacent(cell, n.selection)) return { ...n, offer: cell };
  }
  if (type === "up" && n.selection && n.offer)
    return {
      ...requestSwap(n, n.selection, n.offer),
      selection: null,
      offer: null,
    };
  return n;
}
