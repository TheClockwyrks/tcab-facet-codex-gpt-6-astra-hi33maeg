/** Development-only recorder host. The production entry exports nothing globally. */
import { createEngine, ConstantClock } from "@clockwyrks/simple-2d";
import { game, BACKGROUND } from "../src/game";
import { STAGE_W, STAGE_H, LAYOUT } from "../src/constants";
const canvas = document.getElementById("capture") as HTMLCanvasElement;
export const engine = createEngine({
  canvas,
  width: STAGE_W,
  height: STAGE_H,
  game,
  background: BACKGROUND,
  layout: LAYOUT,
  clock: new ConstantClock(1000 / 30),
  assetRoot: "../assets/",
});
await engine.initialize();
export function stageChain() {
  const rows = [
    "R0 A0 C0 J0 B0 S0 M0 R0",
    "C0 J0 B0 S0 M0 R0 A0 C0",
    "B0 S0 M0 R0 A0 C0 J0 B0",
    "M0 R0 A0 C0 J0 B0b S0 M0",
    "A0 C0 J0 B0 S0 M0 R0 A0",
    "J0 B0 S0 M0 R0 A0 C0 J0",
    "S0 M0 R0 A0 X0 J0 B0 S0",
    "R0 A0 C0 J0 B0 S0 M0 R0",
  ];
  const d = engine.debug;
  engine.apply((s) => d.loadBoard(s, rows));
  engine.apply((s) => d.setScreen(s, "playing"));
  engine.apply((s) => d.setScore(s, 1240));
  engine.apply((s) => d.setLevelScore(s, 1240));
  // A worn seam, with two cut stones that carry the fracture into another column.
  for (const [c, r, t] of [
    [1, 4, "R0"],
    [2, 4, "A0"],
    [3, 4, "R0"],
    [2, 5, "R0"],
    [4, 4, "J3"],
    [5, 4, "B3b"],
    [6, 4, "M3"],
    [6, 3, "S3s"],
    [5, 3, "J2"],
    [5, 2, "C3"],
    [4, 2, "B3"],
    [3, 2, "A3"],
    [1, 2, "J0"],
    [2, 2, "J0"],
    [3, 1, "J0"],
  ] as const)
    engine.apply((s) => d.setGem(s, c, r, t));
  for (let c = 0; c < 8; c++)
    engine.apply((s) =>
      d.setRefillKinds(
        s,
        c,
        Array.from({ length: 8 }, (_, r) => "RACJBSM"[(c + r * 2) % 7]).join(
          "",
        ),
      ),
    );
}
