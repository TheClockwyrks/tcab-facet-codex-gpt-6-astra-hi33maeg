import console from "node:console";
import { chromium } from "playwright";
import { writeFile, mkdir } from "node:fs/promises";
import { gzipSync } from "node:zlib";
const browser = await chromium.launch({ args: ["--no-sandbox"] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const failures = [];
page.on("pageerror", (e) => failures.push(e.message));
await page.goto("http://localhost:5173/tools/capture.html");
// Vite may reload once when this development-only entry first discovers a dependency.
for (let attempt = 0; ; attempt++) {
  try {
    await page.evaluate(async () => {
      const { engine } = await import("/tools/capture.ts");
      await engine.advance(1);
    });
    break;
  } catch (error) {
    if (
      attempt >= 2 ||
      !String(error).includes("Execution context was destroyed")
    )
      throw error;
    await page.waitForLoadState("networkidle");
  }
}
await mkdir("showcase", { recursive: true });
await page.screenshot({ path: "showcase/title.png" });
await page.evaluate(async () => {
  const { engine, stageChain } = await import("/tools/capture.ts");
  stageChain();
  await engine.advance(1);
});
await page.screenshot({ path: "showcase/board.png" });
const recording = await page.evaluate(async () => {
  const { engine } = await import("/tools/capture.ts");
  engine.startRecording();
  await engine.advance(15);
  engine.apply((s) => engine.debug.pointerDown(s, 532, 432));
  engine.apply((s) => engine.debug.pointerMove(s, 532, 504));
  await engine.advance(8);
  engine.apply((s) => engine.debug.pointerUp(s));
  await engine.advance(100);
  return engine.stopRecording();
});
await writeFile("showcase/chain.json.gz", gzipSync(JSON.stringify(recording)));
await browser.close();
if (failures.length) throw new Error(failures.join("\n"));
console.log(`Captured ${recording.frames.length} frames and two screenshots.`);
