// PWA 아이콘 PNG 생성 (icons/*.svg → PNG): node tools/make-icons.mjs
import { readFile, writeFile } from "node:fs/promises";
import { rasterizeSvg } from "./lib/rasterize.mjs";

const JOBS = [
  ["icons/icon.svg", "icons/icon-192.png", 192],
  ["icons/icon.svg", "icons/icon-512.png", 512],
  ["icons/icon-maskable.svg", "icons/icon-maskable-512.png", 512],
  ["icons/icon-maskable.svg", "icons/apple-touch-icon.png", 180],
];
for (const [src, out, px] of JOBS) {
  // 창 크기는 논리 픽셀 — 배율 2로 목표 해상도를 맞춤
  const svg = (await readFile(src, "utf8")).replace("<svg ", `<svg width="${px / 2}" height="${px / 2}" style="display:block" `);
  const { png, wPx, hPx } = await rasterizeSvg(svg, px / 2, px / 2, 2);
  if (wPx !== px || hPx !== px) throw new Error(`${out}: ${wPx}×${hPx} (기대 ${px})`);
  await writeFile(out, png);
  console.log(`OK ${out} ${px}×${px}`);
}
