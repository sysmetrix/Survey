// 서비스워커 사전 캐시 목록·리비전 갱신: node tools/build-sw.mjs   (--check: 최신이 아니면 실패)
import { readFile, writeFile } from "node:fs/promises";
import { buildSwSource } from "./lib/sw-manifest.mjs";

const src = await readFile("sw.js", "utf8");
const next = await buildSwSource(src);
if (process.argv.includes("--check")) {
  if (next !== src) { console.error("sw.js 가 최신이 아닙니다 → node tools/build-sw.mjs"); process.exit(1); }
  console.log("sw.js 최신");
} else {
  await writeFile("sw.js", next);
  console.log(next === src ? "sw.js 변경 없음" : "sw.js 갱신");
}
