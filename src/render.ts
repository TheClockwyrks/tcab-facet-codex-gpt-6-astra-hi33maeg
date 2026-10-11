import type { RenderApi } from "@clockwyrks/simple-2d";
import {
  ParticleSimulator,
  type ParticleSystem,
} from "@clockwyrks/particle-runtime";
import * as C from "./constants";
import type { ReadState, GemState, CellRef } from "./game";
import { cellX, cellY, same } from "./board";
import { targets } from "./interaction";
const ink = "#edf2e9",
  muted = "#81969f",
  gold = "#dcc292",
  mint = "#86ddca";
const serif = "Georgia, serif",
  sans = '"Trebuchet MS", sans-serif';
function text(
  ctx: CanvasRenderingContext2D,
  value: string,
  x: number,
  y: number,
  size = 16,
  color = ink,
  font = sans,
  align: CanvasTextAlign = "left",
) {
  ctx.font = `${size}px ${font}`;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.fillText(value, x, y);
}
function rule(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  color = "#29414a",
) {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, 1);
}
function sprite(
  s: ReadState,
  ctx: CanvasRenderingContext2D,
  path: string,
  x: number,
  y: number,
  size = 64,
) {
  const img = s.assets?.images[path];
  if (img) ctx.drawImage(img, x - size / 2, y - size / 2, size, size);
}
/** Reconstruct a bounded particle play from its clock; render never owns mutable game state. */
function effect(
  s: ReadState,
  ctx: CanvasRenderingContext2D,
  name: string,
  x: number,
  y: number,
  age: number,
  seed: number,
) {
  const system = s.assets?.effects[name];
  if (!system || age < 0 || (age > 1.2 && name !== "aura")) return;
  const simulator = new ParticleSimulator(system as ParticleSystem, {
    seed,
    maxParticles: 64,
  });
  const duration = name === "aura" ? 0.5 + (age % 1) : age;
  for (let elapsed = 0; elapsed < duration; elapsed += 1 / 30)
    simulator.step(Math.min(1 / 30, duration - elapsed) * 1000);
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  for (const p of simulator.capture()) {
    ctx.globalAlpha = p.opacity * 0.65;
    ctx.fillStyle =
      name === "flaw" ? "#ffb790" : name === "aura" ? gold : "#befaff";
    ctx.beginPath();
    ctx.arc(
      x + p.position[0],
      y - p.position[1],
      Math.max(0.1, p.size),
      0,
      Math.PI * 2,
    );
    ctx.fill();
  }
  ctx.restore();
}
function gem(
  s: ReadState,
  ctx: CanvasRenderingContext2D,
  g: GemState,
  x: number,
  y: number,
  size = 64,
) {
  sprite(s, ctx, `gems/${g.kind ?? "prism"}-${g.strain}.png`, x, y, size);
  if (g.cut === "prism") {
    ctx.save();
    ctx.globalAlpha = 0.55;
    sprite(
      s,
      ctx,
      `gems/prism-turn/${Math.floor(s.simTime * 6) % 6}.png`,
      x,
      y,
      size,
    );
    ctx.restore();
  } else if (g.cut !== "plain") sprite(s, ctx, `gems/${g.cut}.png`, x, y, size);
  if (g.cut !== "plain")
    effect(
      s,
      ctx,
      "aura",
      x,
      y,
      s.simTime + g.col * 0.1 + g.row * 0.3,
      g.col + g.row * C.GRID_COLS,
    );
}
function background(ctx: CanvasRenderingContext2D) {
  const grad = ctx.createRadialGradient(
    C.STAGE_CX,
    280,
    30,
    C.STAGE_CX,
    C.STAGE_CY,
    780,
  );
  grad.addColorStop(0, "#1a3039");
  grad.addColorStop(1, "#09151d");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, C.STAGE_W, C.STAGE_H);
  ctx.strokeStyle = "#1c3038";
  ctx.lineWidth = 1;
  for (let i = 0; i < 8; i++) {
    ctx.beginPath();
    ctx.moveTo(-120 + i * 210, 0);
    ctx.lineTo(180 + i * 210, C.STAGE_H);
    ctx.stroke();
  }
  rule(ctx, 48, 28, 1184);
  rule(ctx, 48, 691, 1184);
  text(ctx, "F  /  01", 48, 60, 12, gold);
  text(ctx, "THE LAPIDARY COLLECTION", 1232, 20, 11, muted, sans, "right");
}
function button(
  s: ReadState,
  ctx: CanvasRenderingContext2D,
  t: ReturnType<typeof targets>[number],
  label: string,
  active: boolean,
) {
  ctx.fillStyle = active ? "#d9c292" : "#13252e";
  ctx.fillRect(t.x, t.y, t.w, t.h);
  ctx.strokeStyle = active ? "#f8dfac" : "#39515a";
  ctx.strokeRect(t.x + 0.5, t.y + 0.5, t.w - 1, t.h - 1);
  text(ctx, label, t.x + 28, t.y + t.h / 2 + 6, 17, active ? "#10242b" : ink);
  text(
    ctx,
    active ? "↗" : "—",
    t.x + t.w - 30,
    t.y + t.h / 2 + 6,
    22,
    active ? "#10242b" : muted,
    sans,
    "center",
  );
  if (s.armedTarget === t.id) {
    ctx.strokeStyle = mint;
    ctx.lineWidth = 3;
    ctx.strokeRect(t.x + 4, t.y + 4, t.w - 8, t.h - 8);
  }
}
function mark(ctx: CanvasRenderingContext2D, p: CellRef, color: string) {
  const x = cellX(p.col),
    y = cellY(p.row);
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  for (const dx of [-1, 1])
    for (const dy of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(x + dx * 33, y + dy * 22);
      ctx.lineTo(x + dx * 33, y + dy * 33);
      ctx.lineTo(x + dx * 22, y + dy * 33);
      ctx.stroke();
    }
}
function board(s: ReadState, ctx: CanvasRenderingContext2D) {
  const frame = s.assets?.images["gems/frame.png"];
  if (frame) ctx.drawImage(frame, C.BOARD_CX - 304, C.BOARD_CY - 304);
  ctx.save();
  ctx.beginPath();
  ctx.rect(C.BOARD_CX - 288, C.BOARD_CY - 288, 576, 576);
  ctx.clip();
  for (const g of s.board.cells) {
    let x = cellX(g.col),
      y = cellY(g.row);
    if (s.selection && s.offer) {
      if (same(g, s.selection)) {
        x = cellX(s.offer.col);
        y = cellY(s.offer.row);
      } else if (same(g, s.offer)) {
        x = cellX(s.selection.col);
        y = cellY(s.selection.row);
      }
    }
    if (s.phase === "swapping" && s.motion?.swap) {
      const [a, b] = s.motion.swap;
      const other = same(g, a) ? b : same(g, b) ? a : null;
      if (other) {
        const t = s.swapTimer / C.SWAP_SECONDS;
        const f = t * t * (3 - 2 * t);
        x = cellX(other.col) + (x - cellX(other.col)) * f;
        y = cellY(other.row) + (y - cellY(other.row)) * f;
      }
    }
    if (s.phase === "resolving") {
      const elapsed = Math.max(0, s.stepTimer - s.lastWaves * C.WAVE_SECONDS);
      const duration = g.fell * C.FALL_SECONDS_PER_ROW;
      const t = duration ? Math.min(1, elapsed / duration) : 1;
      y -= g.fell * C.CELL_PITCH * (1 - t * t);
    } else if (s.motion?.dealAt !== undefined) {
      const t = Math.min(
        1,
        (s.simTime - s.motion.dealAt) /
          (g.fell * C.FALL_SECONDS_PER_ROW + 0.15),
      );
      y -= g.fell * C.CELL_PITCH * (1 - t * t);
    }
    gem(s, ctx, g, x, y);
  }
  if (s.phase === "resolving")
    for (const g of s.motion?.cleared ?? []) {
      const age = s.stepTimer - g.wave * C.WAVE_SECONDS,
        x = cellX(g.col),
        y = cellY(g.row);
      if (age < 0) gem(s, ctx, g, x, y);
      else if (age < 0.3 && g.kind)
        sprite(
          s,
          ctx,
          `gems/break/${g.kind}/${Math.min(5, Math.floor(age * 20))}.png`,
          x,
          y,
        );
      effect(
        s,
        ctx,
        g.strain === C.MAX_STRAIN ? "flaw" : "clear",
        x,
        y,
        age,
        g.col + g.row * C.GRID_COLS + s.chainStep * 100,
      );
    }
  for (const p of s.motion?.created ?? [])
    effect(
      s,
      ctx,
      "cut",
      cellX(p.col),
      cellY(p.row),
      s.stepTimer - s.lastWaves * C.WAVE_SECONDS,
      p.col + 100 * p.row,
    );
  ctx.restore();
  if (s.selection) mark(ctx, s.selection, gold);
  if (s.offer) mark(ctx, s.offer, mint);
  if (s.refusal) {
    mark(ctx, s.refusal.a, "#f47e88");
    mark(ctx, s.refusal.b, "#f47e88");
  }
}
function hud(s: ReadState, ctx: CanvasRenderingContext2D) {
  text(ctx, C.TITLE_TEXT, 62, 130, 36, gold, serif);
  text(ctx, "PRESSURE / POTENTIAL", 64, 154, 10, muted);
  rule(ctx, 64, 184, 222);
  text(ctx, C.HUD_SCORE_LABEL, 64, 220, 12, muted);
  text(ctx, s.score.toLocaleString("en-US"), 61, 270, 48, ink, serif);
  rule(ctx, 64, 297, 222);
  text(ctx, C.HUD_LEVEL_LABEL, 64, 337, 12, muted);
  text(ctx, String(s.level).padStart(2, "0"), 64, 386, 42, gold, serif);
  const target = C.LEVEL_TARGET_STEP * s.level;
  ctx.fillStyle = "#294049";
  ctx.fillRect(64, 409, 220, 4);
  ctx.fillStyle = mint;
  ctx.fillRect(64, 409, 220 * Math.min(1, s.levelScore / target), 4);
  text(
    ctx,
    `${s.levelScore.toLocaleString("en-US")} / ${target.toLocaleString("en-US")}`,
    64,
    439,
    13,
    muted,
  );
  if (s.phase === "resolving") {
    text(ctx, C.HUD_CHAIN_LABEL, 64, 508, 12, mint);
    text(
      ctx,
      `×${Math.min(s.chainStep, C.MAX_MULTIPLIER)}`,
      62,
      564,
      52,
      mint,
      serif,
    );
    text(ctx, `+${s.lastPoints}  ·  ${s.lastCleared} STONES`, 64, 590, 12, ink);
  } else {
    text(ctx, "MAKE YOUR NEXT", 64, 528, 11, muted);
    text(ctx, "move matter.", 62, 561, 27, gold, serif);
  }
  text(ctx, "STRAIN", 992, 161, 12, gold);
  text(ctx, "Every clear leaves a mark.", 992, 188, 13, muted);
  for (let strain = 0; strain <= C.MAX_STRAIN; strain++) {
    sprite(s, ctx, `gems/beryl-${strain}.png`, 1018, 235 + strain * 67, 44);
    text(
      ctx,
      ["Clean", "Hairline", "Fractured", "Flawed ×2"][strain],
      1051,
      241 + strain * 67,
      15,
      strain === C.MAX_STRAIN ? gold : ink,
    );
  }
  rule(ctx, 992, 487, 218);
  text(ctx, "WORK THE FLAW", 992, 522, 11, gold);
  text(ctx, "Clear beside a flawed", 992, 553, 15, muted);
  text(ctx, "stone to set it free.", 992, 578, 15, muted);
  text(ctx, "DRAG  ·  RELEASE  ·  SHATTER", 64, 664, 10, muted);
  text(
    ctx,
    s.muted ? "M  SOUND OFF" : "M  SOUND ON",
    1210,
    664,
    11,
    muted,
    sans,
    "right",
  );
}
function title(s: ReadState, ctx: CanvasRenderingContext2D) {
  text(ctx, "A STUDY IN CHAIN REACTIONS", 132, 151, 12, gold);
  text(ctx, C.TITLE_TEXT, 124, 287, 118, ink, serif);
  rule(ctx, 132, 315, 64, gold);
  text(ctx, C.TAGLINE_TEXT, 132, 350, 16, gold);
  text(ctx, "A quiet puzzle. A beautiful breaking point.", 132, 384, 16, muted);
  for (const [i, t] of targets("title").entries())
    button(s, ctx, t, C.TITLE_ITEMS[i], s.menuIndex === i);
  text(ctx, "MATCH  /  FRACTURE  /  CASCADE", 132, 625, 11, muted);
  const cx = 917,
    cy = 356;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.strokeStyle = "#36505a";
  ctx.lineWidth = 1;
  for (const r of [123, 204, 256]) {
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.rotate(Math.PI / 4);
  ctx.strokeStyle = "#72694e";
  ctx.strokeRect(-151, -151, 302, 302);
  ctx.restore();
  for (let i = 0; i < C.GEM_KIND_COUNT; i++) {
    const a = (i * Math.PI * 2) / C.GEM_KIND_COUNT - 0.9;
    const x = cx + Math.cos(a) * 205,
      y = cy + Math.sin(a) * 205;
    sprite(s, ctx, `gems/${C.GEM_KINDS[i]}-${i === 3 ? 3 : 0}.png`, x, y, 80);
  }
  sprite(s, ctx, "gems/prism-0.png", cx, cy, 176);
  sprite(
    s,
    ctx,
    `gems/prism-turn/${Math.floor(s.simTime * 4) % 6}.png`,
    cx,
    cy,
    176,
  );
  effect(s, ctx, "aura", cx, cy, s.simTime, 271);
  text(
    ctx,
    "SEVEN STONES. LIMITLESS CONSEQUENCES.",
    cx,
    651,
    10,
    muted,
    sans,
    "center",
  );
}
function howto(s: ReadState, ctx: CanvasRenderingContext2D) {
  text(ctx, "THE ART OF PRESSURE", 80, 126, 12, gold);
  text(ctx, "How to play", 78, 184, 49, ink, serif);
  const columns = [80, 485, 887];
  const headings = [
    "01  /  MAKE A LINE",
    "02  /  BUILD PRESSURE",
    "03  /  CUT DEEPER",
  ];
  const lines = [
    [
      "Drag a gem onto its neighbor.",
      "Release to swap; return it to its",
      "starting cell to cancel the offer.",
      "",
      "Match 3 or more of the same kind.",
      "A swap that clears nothing returns.",
    ],
    [
      "Each clear strains nearby stones.",
      "Three marks make a stone flawed.",
      "Clear beside it: it shatters too,",
      "scores double, and spreads the chain.",
      "",
      "Let a worn corner work for you.",
    ],
    [
      "Match 4: a brilliant bursts around it.",
      "Cross two lines: a star clears its",
      "whole row and column.",
      "Match 5: a prism clears one kind",
      "when swapped; two clear everything.",
      "Cascades raise your multiplier to ×8.",
    ],
  ];
  for (let i = 0; i < 3; i++) {
    const x = columns[i];
    rule(ctx, x, 223, i === 2 ? 310 : 340);
    text(ctx, headings[i], x, 259, 13, gold);
    if (i === 0)
      for (let j = 0; j < 3; j++)
        sprite(s, ctx, "gems/ruby-0.png", x + 45 + j * 80, 320);
    if (i === 1)
      for (let j = 0; j < 4; j++)
        sprite(s, ctx, `gems/jade-${j}.png`, x + 30 + j * 76, 320, 56);
    if (i === 2)
      for (let j = 0; j < 3; j++)
        gem(
          s,
          ctx,
          {
            col: j,
            row: 0,
            kind: j === 2 ? null : "sapphire",
            cut: (["brilliant", "star", "prism"] as const)[j],
            strain: 0,
            fell: 0,
          },
          x + 40 + j * 95,
          320,
        );
    lines[i].forEach((line, j) =>
      text(ctx, line, x, 388 + j * 28, 15, j === 5 ? gold : muted),
    );
  }
  text(
    ctx,
    "Reach the level target to continue. Your round ends when no legal swaps remain.",
    308,
    644,
    14,
    muted,
  );
  text(
    ctx,
    "MOUSE · PEN · TOUCH    /    ↑ ↓ menus    /    ENTER or SPACE choose    /    ESC back or pause    /    P pause    /    M sound",
    640,
    574,
    12,
    gold,
    sans,
    "center",
  );
  button(s, ctx, targets("howto")[0], C.BACK_LABEL, false);
}
function overlay(s: ReadState, ctx: CanvasRenderingContext2D) {
  ctx.fillStyle = "#07121cdb";
  ctx.fillRect(0, 0, C.STAGE_W, C.STAGE_H);
  ctx.fillStyle = "#14252e";
  ctx.fillRect(404, 148, 472, 462);
  ctx.strokeStyle = "#647268";
  ctx.strokeRect(404.5, 148.5, 471, 461);
  const heading =
    s.screen === "paused"
      ? C.PAUSED_TITLE_TEXT
      : s.screen === "levelclear"
        ? C.LEVELCLEAR_TITLE_TEXT
        : C.GAMEOVER_TITLE_TEXT;
  text(ctx, "F A C E T", C.STAGE_CX, 197, 12, gold, sans, "center");
  text(ctx, heading, C.STAGE_CX, 260, 38, ink, serif, "center");
  if (s.screen === "levelclear") {
    text(
      ctx,
      `${C.HUD_LEVEL_LABEL} ${s.level}  /  COMPLETE`,
      C.STAGE_CX,
      300,
      13,
      gold,
      sans,
      "center",
    );
    text(
      ctx,
      `${C.BEST_CHAIN_LABEL}  ${s.bestChain}     ${C.BEST_MOVE_LABEL}  ${s.bestMove}`,
      C.STAGE_CX,
      354,
      13,
      muted,
      sans,
      "center",
    );
  } else if (s.screen === "gameover")
    text(
      ctx,
      `${C.HUD_SCORE_LABEL}  ${s.score}    /    ${C.HUD_LEVEL_LABEL}  ${s.level}`,
      C.STAGE_CX,
      330,
      20,
      gold,
      sans,
      "center",
    );
  else
    text(
      ctx,
      "A moment before the next fracture.",
      C.STAGE_CX,
      330,
      16,
      muted,
      serif,
      "center",
    );
  const labels =
    s.screen === "paused"
      ? C.PAUSED_ITEMS
      : s.screen === "levelclear"
        ? C.LEVELCLEAR_ITEMS
        : C.GAMEOVER_ITEMS;
  targets(s.screen).forEach((t, i) =>
    button(s, ctx, t, labels[i], s.menuIndex === i),
  );
}
export function render(s: ReadState, { ctx }: RenderApi): void {
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  background(ctx);
  if (s.screen === "title") title(s, ctx);
  else if (s.screen === "howto") howto(s, ctx);
  else {
    if (s.board.cells.length) board(s, ctx);
    hud(s, ctx);
    if (s.screen === "playing")
      button(s, ctx, targets("playing")[0], C.PAUSE_LABEL, false);
    else overlay(s, ctx);
  }
  ctx.restore();
}
