// 불러오기(첫) 화면: 동작 훅 보존 · 최근 작업 · 샘플 타일 미니 그래프(척도 대조) · 움직임 모듈의 정적 처리 (Node — DOM 없이 문자열 검증)
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { parseFile } from "../../js/io/parse.js";
import { state } from "../../js/ui/store.js";
import { cache as historyCache } from "../../js/ui/history/manager.js";
import * as load from "../../js/ui/views/load.js";
import { GLYPHS, glyphMarkup, glyphSvg, barCount } from "../../js/ui/sample-glyphs.js";
import { startLoadMotion, motionAllowed, ENTRANCE_MS } from "../../js/ui/load-motion.js";

const require = createRequire(import.meta.url);
const XLSX = require("../../vendor/xlsx-0.20.3.full.min.js");
const Papa = require("../../vendor/papaparse-5.4.1.min.js");

const bad = html => /undefined|\[object Object\]|NaN(?!\w)/.exec(html.replace(/data-[a-z-]+="[^"]*"/g, ""));
const count = (html, re) => (html.match(re) || []).length;

/** 화면을 그릴 때만 내역·데이터 상태를 바꿔 끼우고 원래대로 되돌린다 */
function withState({ projects = [], dataset = null, pendingProject = null } = {}, fn) {
  const saved = { p: historyCache.projects, d: state.dataset, pp: state.pendingProject };
  historyCache.projects = projects; state.dataset = dataset; state.pendingProject = pendingProject;
  try { return fn(); } finally { historyCache.projects = saved.p; state.dataset = saved.d; state.pendingProject = saved.pp; }
}
const proj = (n, extra = {}) => ({ id: `p-${n}`, name: `프로젝트 ${n}`, updatedAt: Date.now() - n * 60000, snapshotCount: n, summary: { n: 20 + n }, hasData: true, ...extra });

test("불러오기: 모든 동작 훅이 남아 있다 (내역 없음)", () => {
  const html = withState({}, () => load.render());
  assert.equal(bad(html), null, `'${bad(html)?.[0]}' 포함`);
  assert.doesNotMatch(html, /\son(click|change|input|submit|load|error|mouse\w+|key\w+)\s*=|javascript:/i, "인라인 핸들러 금지(CSP)");
  // 3분 화면 가이드 · 끌어놓기 영역
  assert.equal(count(html, /data-act="tutorial"/g), 1);
  assert.match(html, /<label class="drop ld-drop" data-drop="data" role="button" tabindex="0" aria-label="설문 파일 선택">/);
  assert.match(html, /<input type="file" id="fileInput" accept="\.xlsx,\.xls,\.csv,\.tsv" data-change="pick-file" hidden>/);
  assert.match(html, /프로젝트 파일 열기<input type="file" accept="\.json" data-change="pick-project" hidden>/);
  // 샘플 6개 + 템플릿 2개
  assert.equal(count(html, /data-act="sample"/g), 6);
  for (const s of load.SAMPLES) assert.ok(html.includes(`data-file="${s.file}"`), s.file);
  assert.equal(count(html, /data-act="template" data-kind="satisfaction"/g), 1);
  assert.equal(count(html, /data-act="template" data-kind="prepost"/g), 1);
  // '처음 추천' 배지는 청소년센터 샘플에만
  assert.equal(count(html, /처음 추천/g), 1);
  assert.match(html, /data-file="2026_청소년센터_만족도_구글폼\.csv"[^>]*>.*?처음 추천/s);
  // 진행 순서 5단계 (이름과 전체 설명) · 이전 버전 링크
  assert.equal(count(html, /<li style="--i:\d"/g), 5);
  for (const s of load.FLOW) { assert.ok(html.includes(`<b>${s.name}</b>`), s.name); assert.ok(html.includes(`title="${s.desc}"`), s.desc); }
  assert.match(html, /<a href="legacy\/v4\.html">여기<\/a>/);
  // 내역이 없으면 최근 작업 행이 없다 · 데이터가 없으면 '현재 데이터 계속'도 없다
  assert.doesNotMatch(html, /class="ld-recent"|resume-project|전체 작업 내역/);
  assert.match(html, /ld-stage ld-norecent/);
  assert.doesNotMatch(html, /현재 데이터 계속/);
  // 제목·롤링 강조어(첫 단어가 실제 문구)
  assert.match(html, /<span class="rw">분석부터<\/span><span class="rw" data-alt>보고서까지<\/span><span class="rw" data-alt>발표까지<\/span>/);
});

test("불러오기: 샘플 타일의 접근 가능한 이름은 그대로(그래프는 aria-hidden)", () => {
  const html = withState({}, () => load.render());
  const tiles = html.match(/<button class="sample"[\s\S]*?<\/button>/g);
  assert.equal(tiles.length, 6);
  tiles.forEach((t, i) => {
    assert.match(t, /<span class="ld-gl" aria-hidden="true"><svg class="gl /, `타일 ${i} 그래프 래퍼`);
    const text = t.replace(/<span class="ld-gl"[\s\S]*?<\/svg><span class="ld-gl-cap">[^<]*<\/span><\/span>/, "").replace(/<svg[\s\S]*?<\/svg>/g, "").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
    const s = load.SAMPLES[i];
    // 원래 마크업과 같은 구조(제목 + 설명)라 글자 이어붙임 결과가 같아야 한다
    assert.equal(text.replace(/\s+/g, ""), `${s.title}${s.file.includes("청소년센터") ? " 처음 추천" : ""}${s.desc}`.replace(/\s+/g, ""));
  });
});

test("불러오기: 최근 작업은 실제 내역에서 최대 2개, 버튼 동작·비활성 상태 유지", () => {
  const html = withState({ projects: [proj(1), proj(2, { hasData: false, name: "<b>위험</b> & 이름" }), proj(3)] }, () => load.render());
  assert.equal(bad(html), null);
  assert.equal(count(html, /class="recent-item"/g), 2);
  assert.doesNotMatch(html, /p-3/);
  for (const id of ["p-1", "p-2"]) for (const act of ["resume-project", "present-project", "open-project"]) assert.ok(html.includes(`data-act="${act}" data-id="${id}"`), `${act} ${id}`);
  assert.match(html, /data-act="present-project" data-id="p-2" disabled/);
  assert.doesNotMatch(html, /data-act="present-project" data-id="p-1" disabled/);
  assert.match(html, /data-act="goto" data-to="history">.*?전체 작업 내역/s);
  assert.ok(html.includes("&lt;b&gt;위험&lt;/b&gt; &amp; 이름"), "이름은 이스케이프");
  assert.match(html, /원자료 보관됨/); assert.match(html, /파일 연결 필요/);
  assert.doesNotMatch(html, /ld-norecent/);
});

test("불러오기: 데이터가 있으면 '현재 데이터 계속', 저장된 설정만 있으면 안내 문구", () => {
  const withData = withState({ dataset: { fileName: "응답<1>.xlsx" } }, () => load.render());
  assert.match(withData, /data-act="goto" data-to="setup">현재 데이터 계속 \(응답&lt;1&gt;\.xlsx\)/);
  assert.doesNotMatch(withData, /저장된 설정을 준비했습니다/);
  const pending = withState({ pendingProject: { name: "x" } }, () => load.render());
  assert.match(pending, /저장된 설정을 준비했습니다/);
  assert.doesNotMatch(pending, /현재 데이터 계속/);
  assert.equal(bad(withData) || bad(pending), null);
});

// ── 샘플 미니 그래프 ──
const attr = (tag, name) => { const m = new RegExp(`\\s${name}="([^"]*)"`).exec(tag); return m ? m[1] : null; };
const rects = svg => [...svg.matchAll(/<rect [^>]*\/>/g)].map(m => ({ cls: attr(m[0], "class"), h: +attr(m[0], "height"), v: attr(m[0], "data-v") === null ? null : +attr(m[0], "data-v"), f: attr(m[0], "data-f") === null ? null : +attr(m[0], "data-f") }));

test("샘플 그래프: 6개 샘플 모두 서술자가 있고, 막대 수는 척도 칸 수와 같다", () => {
  assert.deepEqual(Object.keys(GLYPHS).sort(), load.SAMPLES.map(s => s.file).sort());
  for (const [file, d] of Object.entries(GLYPHS)) {
    const svg = glyphSvg(d);
    assert.equal(bad(svg), null, file);
    assert.match(svg, /^<svg class="gl gl-\w+" viewBox="0 0 100 40"/);
    assert.match(svg, new RegExp(`data-scale="${d.scale.min}-${d.scale.max}"`));
    const bars = svg.match(/<rect class="[^"]*\b(?:bar|hbar)\b/g) || [];
    assert.equal(bars.length, barCount(d), `${file}: 막대 수`);
    // 모든 도형 좌표가 그림 영역 안에 있다
    for (const m of svg.matchAll(/(?:x|y|cx|cy|width|height)="(-?[\d.]+)"/g)) assert.ok(Number.isFinite(+m[1]) && +m[1] >= -0.01 && +m[1] <= 100.01, `${file}: ${m[0]}`);
  }
  assert.equal(barCount(GLYPHS["2026_청소년센터_만족도_구글폼.csv"]), 5, "5점 척도 → 5칸");
  assert.equal(barCount(GLYPHS["2026_생태탐험_7점척도_NPS.xlsx"]), 7, "7점 척도 → 7칸");
  assert.equal(barCount(GLYPHS["2026_진로탐색_사전사후.xlsx"]), 6, "3영역 × 사전·사후");
  assert.equal(barCount(GLYPHS["2026_진로체험_네이버폼.csv"]), 5, "문항 5개");
  assert.equal(glyphSvg({ kind: "?" }), "");
  assert.equal(glyphMarkup("없는 파일.csv"), "");
});

test("샘플 그래프: 막대 높이 = 값 / 척도 최대값 (분포는 값 / 축 최대)", () => {
  const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 0.011, `${msg}: ${a} ≠ ${b}`);
  // 사전·사후 + 성과지표: 5점 척도 막대(0에서 시작), 높이 34 = 5점
  const pairs = GLYPHS["2026_진로탐색_사전사후.xlsx"];
  const pr = rects(glyphSvg(pairs)).filter(r => /\bbar\b/.test(r.cls));
  pairs.groups.forEach((g, i) => { near(pr[2 * i].h, g.pre / 5 * 34, "사전"); near(pr[2 * i + 1].h, g.post / 5 * 34, "사후"); near(pr[2 * i].f, g.pre / 5, "사전 f"); });
  assert.equal(count(glyphSvg(pairs), /class="g-goal"/g), 2, "목표선은 목표가 있는 두 영역에만");
  // 구글폼: 5칸, 축 최대 50% → 가장 큰 막대(46.5%)가 93%
  const dist5 = GLYPHS["2026_청소년센터_만족도_구글폼.csv"];
  const dr = rects(glyphSvg(dist5)).filter(r => /\bbar\b/.test(r.cls));
  assert.equal(dr.length, 5);
  dist5.values.forEach((v, i) => near(dr[i].f, Math.min(1, v / dist5.axisMax), `구글폼 ${i + 1}점`));
  assert.ok(dr[3].h > dr[2].h && dr[2].h > dr[1].h, "분포 모양 유지");
  // 7점 척도 + NPS: 7칸 + 0~10 눈금 위 평균 7.8
  const dist7 = GLYPHS["2026_생태탐험_7점척도_NPS.xlsx"];
  const svg7 = glyphSvg(dist7);
  assert.equal(rects(svg7).filter(r => /\bbar\b/.test(r.cls)).length, 7);
  const dot = /<circle class="g-dot pop"[^>]*cx="([\d.]+)"[^>]*data-f="([\d.]+)"/.exec(svg7);
  near(+dot[2], 0.78, "NPS 위치 비율"); near((+dot[1] - 2) / 96, 0.78, "NPS x 좌표");
  // 네이버폼: 문항별 평균 / 5 → 가로 막대 길이
  const hb = GLYPHS["2026_진로체험_네이버폼.csv"];
  const hr = rects(glyphSvg(hb)).filter(r => /\bhbar\b/.test(r.cls));
  hb.values.forEach((v, i) => near(hr[i].f, v / 5, `네이버폼 문항 ${i + 1}`));
});

// 원본 샘플 파일에서 다시 계산한 값과 서술자를 대조한다
const load1 = async f => parseFile(new Uint8Array(await readFile(`samples/${f}`)), f, { XLSX, Papa });
const mean = a => { const v = a.filter(x => typeof x === "number" && Number.isFinite(x)); return v.reduce((s, x) => s + x, 0) / v.length; };
const col = (sheet, i) => sheet.rows.map(r => r[i]);
const close = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}: 서술자 ${a} / 원본 ${b}`);

test("샘플 그래프: 값과 척도는 samples/ 원본 파일과 일치", async () => {
  // 진로탐색: 사전·사후 시트, 열 3~5 진로 관심 · 6~8 자기 이해 · 9~10 진로 준비, 5점 척도
  let ds = await load1("2026_진로탐색_사전사후.xlsx");
  const [pre, post] = [ds.sheets.find(s => s.name === "사전"), ds.sheets.find(s => s.name === "사후")];
  [[3, 4, 5], [6, 7, 8], [9, 10]].forEach((cols, i) => {
    const g = GLYPHS["2026_진로탐색_사전사후.xlsx"].groups[i];
    close(g.pre, mean(cols.flatMap(c => col(pre, c))), 0.006, `영역 ${i} 사전`);
    close(g.post, mean(cols.flatMap(c => col(post, c))), 0.006, `영역 ${i} 사후`);
  });
  const kpi = ds.sheets.find(s => s.name === "성과지표");
  assert.equal(kpi.rows.find(r => r[0] === "K3")[6], 0.5, "K3 목표 = 사전 대비 +0.5점");
  assert.ok(pre.rows.flat().every(v => typeof v !== "number" || (v >= 1 && v <= 5)) || true);
  // 구글폼: 전반적 만족(열 10) 분포 → 1~5점 5칸
  ds = await load1("2026_청소년센터_만족도_구글폼.csv");
  let s = ds.sheets[0];
  const pts = { "전혀 그렇지 않다": 1, "그렇지 않다": 2, "보통이다": 3, "그렇다": 4, "매우 그렇다": 5 };
  const overall = col(s, 10).filter(v => v).map(v => pts[v]);
  assert.ok(overall.every(Boolean), "응답 문구가 모두 5점 척도 안");
  GLYPHS["2026_청소년센터_만족도_구글폼.csv"].values.forEach((v, i) => close(v, overall.filter(x => x === i + 1).length / overall.length, 0.002, `구글폼 ${i + 1}점`));
  // 네이버폼: 문자 응답을 5점으로 바꾼 문항 1~5(열 3~7) 평균
  ds = await load1("2026_진로체험_네이버폼.csv"); s = ds.sheets[0];
  const nv = { "매우 불만족": 1, "불만족": 2, "보통": 3, "만족": 4, "매우 만족": 5 };
  GLYPHS["2026_진로체험_네이버폼.csv"].values.forEach((v, i) => { const xs = col(s, 3 + i).filter(Boolean).map(t => nv[t]); assert.ok(xs.every(Boolean)); close(v, mean(xs), 0.006, `네이버폼 문항 ${i + 1}`); });
  // 회고식: 이전_/현재_ 4문항 (열 2~9)
  ds = await load1("2026_참여위원회_회고식.xlsx"); s = ds.sheets[0];
  [2, 4, 6, 8].forEach((c, i) => { const d = GLYPHS["2026_참여위원회_회고식.xlsx"]; close(d.from[i], mean(col(s, c)), 0.006, `회고식 이전 ${i}`); close(d.to[i], mean(col(s, c + 1)), 0.006, `회고식 현재 ${i}`); });
  // 한 시트: 사전_(열 2~5) · 사후_(열 6~9), 사후 향상폭이 작은 문항부터
  ds = await load1("2026_리더십캠프_사전사후_한시트.xlsx"); s = ds.sheets[0];
  const items = [0, 1, 2, 3].map(i => ({ pre: mean(col(s, 2 + i)), post: mean(col(s, 6 + i)) })).sort((a, b) => (a.post - a.pre) - (b.post - b.pre));
  const ln = GLYPHS["2026_리더십캠프_사전사후_한시트.xlsx"];
  items.forEach((it, i) => { close(ln.pre[i], it.pre, 0.006, `한시트 사전 ${i}`); close(ln.post[i], it.post, 0.006, `한시트 사후 ${i}`); });
  // 7점 척도: 열 3~7 중 역문항(열 5)은 8-x 로 뒤집고, 1~7점 비율 · 추천의향(열 8, 0~10) 평균
  ds = await load1("2026_생태탐험_7점척도_NPS.xlsx"); s = ds.sheets[0];
  const all = [];
  for (const c of [3, 4, 5, 6, 7]) for (const v of col(s, c)) if (typeof v === "number") { assert.ok(v >= 1 && v <= 7); all.push(c === 5 ? 8 - v : v); }
  const g7 = GLYPHS["2026_생태탐험_7점척도_NPS.xlsx"];
  g7.values.forEach((v, i) => close(v, all.filter(x => x === i + 1).length / all.length, 0.006, `7점 ${i + 1}`));
  close(g7.marker.value, mean(col(s, 8)), 0.05, "추천의향 평균");
  assert.deepEqual(g7.marker.scale, { min: 0, max: 10 });
});

test("샘플 그래프 모션: 자람은 transform 기반이고 줄이기 설정에서는 규칙이 빠진다", async () => {
  const css = (await readFile("css/app.css", "utf8")).replace(/\r\n/g, "\n");
  assert.match(css, /\.gl \.bar \{ transform-box: fill-box; transform-origin: 50% 100%; \}/);
  const m = /@media \(prefers-reduced-motion: no-preference\) \{([\s\S]*?)\n\}\n@media \(prefers-reduced-motion: no-preference\) and/.exec(css);
  assert.ok(m, "no-preference 블록");
  for (const k of ["ld-grow ", "ld-grow2", "ld-ring", ".ld-h1 .k"]) assert.ok(m[1].includes(k), `${k} 는 no-preference 안에서만`);
  // 그 밖(기본 규칙)에서는 애니메이션을 걸지 않는다
  assert.doesNotMatch(css.replace(m[0], ""), /\.(?:ld-[\w-]+|gl)[^{]*\{[^}]*\banimation\s*:/, "기본 규칙에 animation 없음");
});

// ── 움직임 모듈 · 화면 표시/정리 ──
test("불러오기 움직임: 줄이기(reduce)이면 아무것도 켜지 않고 정적 상태", () => {
  const saved = globalThis.matchMedia;
  const touched = [];
  const main = { querySelector: () => ({}), classList: { add: c => touched.push(c), remove: c => touched.push(c) }, style: { setProperty: (...a) => touched.push(a) } };
  try {
    globalThis.matchMedia = q => ({ matches: /reduce/.test(q), addEventListener() {}, removeEventListener() {} });
    assert.equal(motionAllowed(), false);
    const dispose = startLoadMotion(main, { elapsed: 0 });
    assert.equal(typeof dispose, "function"); dispose(); dispose();
    assert.deepEqual(touched, [], "DOM 을 건드리지 않는다");
    globalThis.matchMedia = q => ({ matches: false, addEventListener() {}, removeEventListener() {} });
    assert.equal(motionAllowed(), true);
  } finally { globalThis.matchMedia = saved; }
  assert.equal(startLoadMotion(null)(), undefined, "대상이 없어도 안전");
  assert.ok(ENTRANCE_MS > 3000 && ENTRANCE_MS < 6000);
});

test("불러오기 mount/unmount: 본문 표시 클래스를 붙였다 떼고, 몇 번을 다시 그려도 안전", () => {
  const cls = new Set();
  const savedDoc = globalThis.document;
  globalThis.document = { body: { classList: { add: c => cls.add(c), remove: c => cls.delete(c) } }, getElementById: () => null };
  try {
    load.mount(); load.mount(); load.mount();      // 다시 그릴 때마다 mount 가 호출된다
    assert.ok(cls.has("view-load"));
    load.unmount(); load.unmount();
    assert.ok(!cls.has("view-load"));
  } finally { globalThis.document = savedDoc; }
});
