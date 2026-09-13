// PWA: 매니페스트·아이콘·서비스워커 사전 캐시 최신 여부·버전 일치
import test from "node:test";
import assert from "node:assert/strict";
import { readFile, access } from "node:fs/promises";
import { buildSwSource, collectAssets } from "../../tools/lib/sw-manifest.mjs";

const pngSize = buf => [buf.readUInt32BE(16), buf.readUInt32BE(20)];

test("매니페스트 필수 항목·아이콘 파일", async () => {
  const m = JSON.parse(await readFile("manifest.webmanifest", "utf8"));
  for (const k of ["name", "short_name", "start_url", "scope", "display", "theme_color", "background_color"]) assert.ok(m[k], k);
  const pngs = m.icons.filter(i => i.type === "image/png");
  assert.ok(pngs.some(i => i.sizes === "192x192") && pngs.some(i => i.sizes === "512x512"), "192·512 PNG");
  assert.ok(m.icons.some(i => i.purpose === "maskable"), "maskable");
  for (const i of m.icons) {
    await access(i.src);
    if (i.type === "image/png") assert.deepEqual(pngSize(await readFile(i.src)), i.sizes.split("x").map(Number), i.src);
  }
  assert.ok(m.file_handlers?.[0]?.accept?.["text/csv"], "CSV 파일 열기");
});

test("sw.js 사전 캐시 목록·리비전이 최신 (node tools/build-sw.mjs)", async () => {
  const src = (await readFile("sw.js", "utf8")).replace(/\r\n/g, "\n");
  assert.equal(await buildSwSource(src), src, "sw.js 가 최신이 아닙니다 → node tools/build-sw.mjs");
});

test("index.html 이 참조하는 로컬 파일은 모두 사전 캐시 대상", async () => {
  const html = await readFile("index.html", "utf8");
  const assets = new Set(await collectAssets());
  const refs = [...html.matchAll(/(?:href|src)="([^"#:]+?)(?:\?[^"]*)?"/g)].map(m => m[1]).filter(r => !r.startsWith("data"));
  assert.ok(refs.length >= 8);
  for (const r of refs) { await access(r); assert.ok(assets.has(r), `${r} 사전 캐시 누락`); }
  assert.match(html, /worker-src 'self'/);
  assert.match(html, /rel="manifest"/);
});

test("버전 표기 일치 (main.js · package.json · index.html ?v=)", async () => {
  const v = /APP_VERSION = "([^"]+)"/.exec(await readFile("js/main.js", "utf8"))[1];
  assert.equal(JSON.parse(await readFile("package.json", "utf8")).version, v);
  const html = await readFile("index.html", "utf8");
  for (const m of html.matchAll(/\?v=([\d.]+)/g)) assert.equal(m[1], v, "index.html ?v=");
});
