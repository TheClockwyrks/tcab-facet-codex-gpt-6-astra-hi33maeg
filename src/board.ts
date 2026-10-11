import * as C from "./constants";
import type {
  BoardState,
  CellRef,
  Cut,
  FacetState,
  GemKind,
  GemState,
  ReadState,
} from "./game";
export const letters = "RACJBSM";
export const cellX = (col: number) =>
  C.BOARD_CX - ((C.GRID_COLS - 1) * C.CELL_PITCH) / 2 + col * C.CELL_PITCH;
export const cellY = (row: number) =>
  C.BOARD_CY - ((C.GRID_ROWS - 1) * C.CELL_PITCH) / 2 + row * C.CELL_PITCH;
export const index = (p: CellRef) => p.row * C.GRID_COLS + p.col;
export const adjacent = (a: CellRef, b: CellRef) =>
  Math.abs(a.col - b.col) + Math.abs(a.row - b.row) === 1;
export const same = (a: CellRef | null, b: CellRef | null) =>
  !!a && !!b && a.col === b.col && a.row === b.row;
export function validCell(col: number, row: number): CellRef {
  if (
    !Number.isInteger(col) ||
    !Number.isInteger(row) ||
    col < 0 ||
    col >= C.GRID_COLS ||
    row < 0 ||
    row >= C.GRID_ROWS
  )
    throw new RangeError("Cell outside board");
  return { col, row };
}
export function parseGem(token: string, col: number, row: number): GemState {
  if (!/^(?:[RACJBSM][0-3][bs]?|X[0-3])$/.test(token))
    throw new Error(`Invalid gem: ${token}`);
  return {
    col,
    row,
    kind: token[0] === "X" ? null : C.GEM_KINDS[letters.indexOf(token[0])],
    strain: Number(token[1]),
    cut:
      token[0] === "X"
        ? "prism"
        : token[2] === "b"
          ? "brilliant"
          : token[2] === "s"
            ? "star"
            : "plain",
    fell: 0,
  };
}
export function parseBoard(rows: readonly string[]): BoardState {
  if (rows.length !== C.GRID_ROWS) throw new Error("Expected eight rows");
  const cells = rows.flatMap((line, row) => {
    const tokens = line.trim().split(/\s+/);
    if (tokens.length !== C.GRID_COLS)
      throw new Error("Expected eight columns");
    return tokens.map((t, col) => parseGem(t, col, row));
  });
  return { cols: C.GRID_COLS, rows: C.GRID_ROWS, cells };
}
export interface Run {
  cells: number[];
  vertical: boolean;
}
export function runs(board: BoardState): Run[] {
  const result: Run[] = [];
  for (const vertical of [false, true])
    for (let line = 0; line < (vertical ? board.cols : board.rows); line++) {
      let start = 0;
      const at = (p: number) =>
        vertical ? p * board.cols + line : line * board.cols + p;
      const count = vertical ? board.rows : board.cols;
      while (start < count) {
        const kind = board.cells[at(start)]?.kind;
        let end = start + 1;
        while (end < count && kind && board.cells[at(end)].kind === kind) end++;
        if (kind && end - start >= C.MATCH_MIN)
          result.push({
            cells: Array.from({ length: end - start }, (_, i) => at(start + i)),
            vertical,
          });
        start = end;
      }
    }
  return result;
}
export function exchange(
  board: BoardState,
  a: CellRef,
  b: CellRef,
): BoardState {
  return {
    ...board,
    cells: board.cells.map((g, i) =>
      i === index(a)
        ? { ...board.cells[index(b)], ...a, fell: 0 }
        : i === index(b)
          ? { ...board.cells[index(a)], ...b, fell: 0 }
          : g,
    ),
  };
}
export function productive(board: BoardState, a: CellRef, b: CellRef): boolean {
  return (
    !!board.cells[index(a)] &&
    !!board.cells[index(b)] &&
    adjacent(a, b) &&
    (board.cells[index(a)].cut === "prism" ||
      board.cells[index(b)].cut === "prism" ||
      runs(exchange(board, a, b)).length > 0)
  );
}
export function legalSwap(board: BoardState): boolean {
  return board.cells.some((g) =>
    [
      { col: g.col + 1, row: g.row },
      { col: g.col, row: g.row + 1 },
    ].some(
      (b) =>
        b.col < board.cols && b.row < board.rows && productive(board, g, b),
    ),
  );
}
const randomKind = (): GemKind =>
  C.GEM_KINDS[Math.floor(Math.random() * C.GEM_KIND_COUNT)];
export function deal(): BoardState {
  for (;;) {
    const cells: GemState[] = [];
    for (let row = 0; row < C.GRID_ROWS; row++)
      for (let col = 0; col < C.GRID_COLS; col++) {
        let kind: GemKind;
        do {
          kind = randomKind();
        } while (
          (col >= 2 &&
            cells[cells.length - 1].kind === kind &&
            cells[cells.length - 2].kind === kind) ||
          (row >= 2 &&
            cells[(row - 1) * C.GRID_COLS + col].kind === kind &&
            cells[(row - 2) * C.GRID_COLS + col].kind === kind)
        );
        cells.push({ col, row, kind, cut: "plain", strain: 0, fell: row + 1 });
      }
    const board = { cols: C.GRID_COLS, rows: C.GRID_ROWS, cells };
    if (legalSwap(board)) return board;
  }
}
export const lastFall = (s: ReadState) =>
  Math.max(0, ...s.board.cells.map((g) => g.fell));
export const stepHold = (s: ReadState) =>
  s.lastWaves * C.WAVE_SECONDS +
  lastFall(s) * C.FALL_SECONDS_PER_ROW +
  C.STEP_SECONDS;
export function requestSwap(s: ReadState, a: CellRef, b: CellRef): FacetState {
  validCell(a.col, a.row);
  validCell(b.col, b.row);
  if (!s.board.cells[index(a)] || !s.board.cells[index(b)])
    throw new Error("No gem at cell");
  if (s.phase !== "idle" || !productive(s.board, a, b))
    return { ...s, refusal: { a, b, timer: 0 } };
  const ga = s.board.cells[index(a)],
    gb = s.board.cells[index(b)];
  const prismKind =
    ga.cut === "prism"
      ? gb.cut === "prism"
        ? "all"
        : gb.kind!
      : gb.cut === "prism"
        ? ga.kind!
        : undefined;
  return {
    ...s,
    board: exchange(s.board, a, b),
    phase: "swapping",
    chainStep: 0,
    swapTimer: 0,
    stepTimer: 0,
    moveScore: 0,
    motion: { swap: [a, b], prismKind },
  };
}
export interface Resolution {
  state: FacetState;
  flaw: boolean;
  cut: boolean;
}
/** Breadth-first expansion gives the minimum wave even when special cuts overlap. */
export function resolve(s: ReadState): Resolution | null {
  const rs = runs(s.board),
    cells = s.board.cells;
  const special = s.chainStep === 1 ? s.motion?.prismKind : undefined;
  const seeds = special
    ? cells.flatMap((g, i) =>
        special === "all" ||
        g.kind === special ||
        (g.cut === "prism" && s.motion?.swap?.some((p) => same(p, g)))
          ? [i]
          : [],
      )
    : rs.flatMap((r) => r.cells);
  if (!seeds.length) return null;
  const waves = new Map<number, number>();
  const queue: number[] = [];
  const add = (i: number, w: number) => {
    if (!waves.has(i)) {
      waves.set(i, w);
      queue.push(i);
    }
  };
  seeds.forEach((i) => add(i, 0));
  for (let q = 0; q < queue.length; q++) {
    const i = queue[q],
      g = cells[i],
      w = waves.get(i)! + 1;
    for (let j = 0; j < cells.length; j++) {
      const h = cells[j];
      if (
        (g.cut === "brilliant" &&
          Math.abs(g.col - h.col) <= 1 &&
          Math.abs(g.row - h.row) <= 1) ||
        (g.cut === "star" && (g.col === h.col || g.row === h.row)) ||
        (h.strain === C.MAX_STRAIN && adjacent(g, h))
      )
        add(j, w);
    }
  }
  const created = new Map<number, Cut>();
  const priority: Record<Cut, number> = {
    plain: 0,
    brilliant: 1,
    star: 2,
    prism: 3,
  };
  const create = (i: number, cut: Cut) => {
    if (priority[cut] > priority[created.get(i) ?? "plain"])
      created.set(i, cut);
  };
  if (!special) {
    for (const run of rs) {
      if (run.cells.length >= 4) {
        const swapped = run.cells.filter((i) =>
          s.motion?.swap?.some((p) => index(p) === i),
        );
        const at =
          swapped[0] ?? run.cells[Math.floor((run.cells.length - 1) / 2)];
        create(at, run.cells.length >= 5 ? "prism" : "brilliant");
      }
      for (const other of rs)
        if (other.vertical !== run.vertical)
          for (const i of run.cells)
            if (other.cells.includes(i)) create(i, "star");
    }
  }
  let flaw = false;
  const next: (GemState | null)[] = cells.map((g, i) => {
    if (waves.has(i)) return null;
    if (queue.some((j) => adjacent(g, cells[j]))) {
      const strain = Math.min(C.MAX_STRAIN, g.strain + 1);
      if (strain === C.MAX_STRAIN && g.strain < C.MAX_STRAIN) flaw = true;
      return { ...g, strain, fell: 0 };
    }
    return { ...g, fell: 0 };
  });
  for (const [i, cut] of created)
    next[i] = {
      ...cells[i],
      cut,
      kind: cut === "prism" ? null : cells[i].kind,
      strain: 0,
      fell: 0,
    };
  for (let col = 0; col < C.GRID_COLS; col++) {
    const survivors = next.filter(
      (g): g is GemState => g !== null && g.col === col,
    );
    const empty = C.GRID_ROWS - survivors.length;
    for (let row = 0; row < C.GRID_ROWS; row++) {
      const old = survivors[row - empty];
      next[row * C.GRID_COLS + col] = old
        ? { ...old, row, fell: row - old.row }
        : {
            col,
            row,
            kind:
              C.GEM_KINDS[letters.indexOf(s.refillKinds[col]?.[row] ?? "?")] ??
              randomKind(),
            strain: 0,
            cut: "plain",
            fell: empty,
          };
    }
  }
  const points = queue.reduce(
    (sum, i) =>
      sum +
      (cells[i].strain === C.MAX_STRAIN ? C.FLAWED_SCORE : C.BASE_SCORE) *
        Math.min(s.chainStep, C.MAX_MULTIPLIER),
    0,
  );
  return {
    flaw,
    cut: created.size > 0,
    state: {
      ...s,
      board: { ...s.board, cells: next as GemState[] },
      stepTimer: 0,
      lastCleared: queue.length,
      lastPoints: points,
      lastWaves: Math.max(...waves.values()),
      score: s.score + points,
      levelScore: s.levelScore + points,
      moveScore: s.moveScore + points,
      bestChain: Math.max(s.bestChain, s.chainStep),
      motion: {
        swap: s.motion?.swap,
        cleared: queue.map((i) => ({ ...cells[i], wave: waves.get(i)! })),
        created: [...created.keys()].map((i) => cells[i]),
      },
    },
  };
}
