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

test("아이콘: 투명 배경(any·파비콘) / 불투명 배경(maskable·apple-touch) / ICO 구성", async () => {
  const { pngAlphaInfo } = await import("../../tools/lib/png-read.mjs");
  for (const [f, size] of [["icon-192", 192], ["icon-512", 512], ["favicon-16", 16], ["favicon-32", 32], ["favicon-48", 48]]) {
    const i = pngAlphaInfo(await readFile(`icons/${f}.png`));
    assert.equal(i.colorType, 6, `${f}: RGBA`);
    assert.equal(i.w, size);
    assert.ok(i.corners.every(c => c[3] === 0), `${f}: 네 모서리 투명`);
  }
  for (const f of ["icon-maskable-512", "apple-touch-icon"]) {
    const i = pngAlphaInfo(await readFile(`icons/${f}.png`));
    assert.ok(i.colorType === 2 || i.corners.every(c => c[3] === 255), `${f}: 불투명 배경`);
  }
  const ico = await readFile("icons/favicon.ico");
  assert.equal(ico.readUInt16LE(2), 1, "ICO 형식");
  assert.deepEqual(Array.from({ length: ico.readUInt16LE(4) }, (_, k) => ico[6 + k * 16]), [16, 32, 48]);
  const html = await readFile("index.html", "utf8");
  for (const f of ["icons/favicon.svg", "icons/favicon-32.png", "icons/favicon-16.png", "icons/apple-touch-icon.png"]) assert.ok(html.includes(`href="${f}"`), `${f} 링크`);
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
  assert.ok(html.includes(`?v=${v}`), "index.html 에 ?v=<버전> 이 있어야 함 — sw.js 설치 때 사전 캐시한 index.html 이 같은 버전인지 확인하는 기준");
  const releases = await readFile("js/admin/releases.js", "utf8");
  assert.equal(/version: "([^"]+)"/.exec(releases)[1], v, "최신 업데이트 내역 버전");
});

test("즉시 업데이트 약속: 서비스워커 메시지·설치 검증·확인용 sw.js 우회, 화면은 캐시 없이 등록", async () => {
  const sw = await readFile("sw.js", "utf8");
  assert.match(sw, /"SKIP_WAITING"/);
  assert.match(sw, /"GET_VERSION"/);
  assert.match(sw, /\?r=\$\{REVISION\}/, "사전 캐시 요청에 리비전 쿼리(CDN·HTTP 캐시 우회)");
  assert.match(sw, /includes\(`\?v=\$\{VERSION\}`\)/, "설치 때 index.html 버전 확인");
  assert.match(sw, /new URL\("sw\.js", SCOPE\)/, "sw.js 자체는 캐시를 거치지 않음");
  const pwa = await readFile("js/ui/pwa.js", "utf8");
  assert.match(pwa, /updateViaCache: "none"/);
  assert.match(pwa, /cache: "no-store"/);
  assert.match(pwa, /type: "SKIP_WAITING"/);
  assert.match(pwa, /type: "GET_VERSION"/);
});
