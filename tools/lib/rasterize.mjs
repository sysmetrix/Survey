// SVG → PNG (Node 도구용): 설치된 Edge/Chrome 헤드리스 스크린샷 사용
import { execFile } from "node:child_process";
import { writeFile, readFile, mkdtemp, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const CANDIDATES = [
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
];
export const browserPath = () => CANDIDATES.find(p => existsSync(p)) || null;

/** @returns {Promise<{png:Uint8Array, wPx:number, hPx:number}>} */
export async function rasterizeSvg(svg, width, height, scale = 2) {
  const exe = browserPath();
  if (!exe) throw new Error("Edge/Chrome 을 찾을 수 없습니다");
  const dir = await mkdtemp(join(tmpdir(), "svgpng-"));
  const html = join(dir, "c.html"), png = join(dir, "c.png");
  await writeFile(html, `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;padding:0;background:#fff;overflow:hidden}</style></head><body>${svg}</body></html>`, "utf8");
  await new Promise((res, rej) => execFile(exe, [
    "--headless=new", "--disable-gpu", "--hide-scrollbars", "--no-first-run", "--no-default-browser-check",
    `--user-data-dir=${join(dir, "profile")}`, `--force-device-scale-factor=${scale}`,
    `--window-size=${width},${height}`, `--screenshot=${png}`, pathToFileURL(html).href,
  ], { timeout: 60000 }, err => (err && !existsSync(png) ? rej(err) : res())));
  const data = new Uint8Array(await readFile(png));
  await rm(dir, { recursive: true, force: true }).catch(() => {});
  const wPx = (data[16] << 24) | (data[17] << 16) | (data[18] << 8) | data[19];
  const hPx = (data[20] << 24) | (data[21] << 16) | (data[22] << 8) | data[23];
  return { png: data, wPx, hPx };
}
