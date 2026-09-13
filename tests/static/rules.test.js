// 코드 규칙: 인라인 이벤트 핸들러 금지(CSP), 순수 모듈의 DOM 비의존
import test from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

async function walk(dir) {
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...await walk(p));
    else if (/\.(js|html)$/.test(e.name)) out.push(p);
  }
  return out;
}

test("인라인 이벤트 핸들러·javascript: URL 없음 (v5 화면)", async () => {
  const files = [...await walk("js/ui"), "js/main.js", "js/report/render-html.js", "index.html"];
  for (const f of files) {
    const src = await readFile(f, "utf8");
    const m = src.match(/\son(click|change|input|submit|load|error|mouse\w+|key\w+)\s*=|javascript:/i);
    assert.equal(m, null, `${f}: ${m?.[0]}`);
  }
  const html = await readFile("index.html", "utf8");
  assert.equal(/<script(?![^>]*\bsrc=)[^>]*>/i.test(html), false, "v5.html 인라인 <script> 금지");
});

test("순수 모듈은 DOM·브라우저 전역에 의존하지 않음", async () => {
  const dirs = ["js/core", "js/stats", "js/model", "js/analysis", "js/evaluation", "js/narrative", "js/report", "js/io", "js/present", "js/charts", "js/history"];
  const allow = new Set(["js/report/render-hwpx.js", "js/charts/rasterize.js"].map(p => p.replace(/\//g, "\\")));
  for (const d of dirs) {
    for (const f of await walk(d)) {
      if (allow.has(f)) continue;
      const src = (await readFile(f, "utf8")).replace(/\/\/.*$/gm, "");
      const m = src.match(/\b(document|window|localStorage|sessionStorage|navigator)\s*\./);
      assert.equal(m, null, `${f}: ${m?.[0]}`);
    }
  }
});
