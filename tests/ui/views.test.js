// 화면 렌더 스모크 테스트 (Node — DOM 없이 HTML 문자열 생성 검증)
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { parseFile } from "../../js/io/parse.js";
import { state, loadDataset, reportBlocks, compute, invalidate, chooseDataSheet } from "../../js/ui/store.js";
import * as load from "../../js/ui/views/load.js";
import * as setup from "../../js/ui/views/setup.js";
import * as business from "../../js/ui/views/business.js";
import * as dash from "../../js/ui/views/dash.js";
import * as report from "../../js/ui/views/report.js";
import * as present from "../../js/ui/views/present.js";
import * as historyView from "../../js/ui/views/history.js";
import * as settingsView from "../../js/ui/views/settings.js";
import * as updatesView from "../../js/ui/views/updates.js";
import { splitChapters } from "../../js/report/render-html.js";
import { makeTemplate } from "../../js/io/template-xlsx.js";
import { projectToJson, parseProject } from "../../js/io/project.js";
const require = createRequire(import.meta.url);
const XLSX = require("../../vendor/xlsx-0.20.3.full.min.js");
const Papa = require("../../vendor/papaparse-5.4.1.min.js");

const bad = html => /undefined|\[object Object\]|NaN(?!\w)/.exec(html.replace(/data-[a-z-]+="[^"]*"/g, ""));

for (const file of ["2026_진로탐색_사전사후.xlsx", "2026_문화의집_만족도_구글폼.csv", "2026_참여위원회_회고식.xlsx"]) {
  test(`화면 렌더: ${file}`, async () => {
    const ds = parseFile(new Uint8Array(await readFile(`samples/${file}`)), file, { XLSX, Papa });
    loadDataset(ds);
    const views = { load, setup, business, dash, report, present };
    for (const [name, v] of Object.entries(views)) {
      const html = v.render({ sub: "" });
      assert.ok(html.length > 500, `${name} 렌더 길이`);
      const m = bad(html);
      assert.equal(m, null, `${name}: '${m?.[0]}' 포함 … ${m ? html.slice(Math.max(0, m.index - 120), m.index + 40) : ""}`);
    }
    // 분석 결과 모든 탭
    const chapters = splitChapters(reportBlocks());
    for (const c of chapters) assert.equal(bad(dash.render({ sub: c.key })), null, `dash 탭 ${c.title}`);
    assert.equal(bad(dash.render({ sub: "__quality" })), null, "품질 탭");
  });
}

test("문장 수정·숨김·장 제외가 보고서에 반영", async () => {
  const f = "2026_진로탐색_사전사후.xlsx";
  loadDataset(parseFile(new Uint8Array(await readFile(`samples/${f}`)), f, { XLSX, Papa }));
  const before = reportBlocks();
  const box = before.find(b => b.type === "box");
  state.overrides[box.lines[0].key] = "직접 고친 문장";
  state.hidden.push(box.lines[1].key);
  state.hiddenChapters.push("주관식 응답 분석");
  const after = reportBlocks();
  const box2 = after.find(b => b.type === "box");
  assert.equal(box2.lines[0].text, "직접 고친 문장");
  assert.equal(box2.lines[0].edited, true);
  assert.equal(box2.lines.length, box.lines.length - 1);
  assert.ok(!after.some(b => b.type === "heading" && b.text === "주관식 응답 분석"));
  // 장 번호 재부여
  const h1 = after.filter(b => b.type === "heading" && b.level === 1 && !b.appendix).map(b => b.number);
  assert.deepEqual(h1, h1.map((_, i) => `${"ⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩ"[i]}.`));
  // 프로젝트 저장·복원
  const p = parseProject(projectToJson(state));
  assert.equal(p.report.overrides[box.lines[0].key], "직접 고친 문장");
  assert.ok(!p.dataset, "원자료는 기본 미포함");
  assert.equal(p.kpis.length, 6);
});

test("데이터 설정: 보기 점수 패널·일괄 적용", async () => {
  const L = ["완전 별로", "별로", "그냥", "좋음", "완전 좋음"];
  const rows = Array.from({ length: 10 }, (_, i) => [i % 2 ? "남" : "여", L[i % 5], L[(i + 2) % 5]]);
  loadDataset({ fileName: "custom.csv", source: "file", sheets: [{ name: "응답", headers: ["성별", "만족 [내용]", "만족 [강사]"], rows }] });
  const [, a, b] = state.codebook.columns;
  setup.actions.col({ dataset: { key: a.key, field: "role" }, value: "likert" });
  assert.equal(a.role, "likert");
  const html = setup.render();
  assert.ok(html.includes("보기별 점수") && html.includes("미변환"), "문자 응답 패널 자동 표시");
  L.forEach((t, i) => setup.actions.labelmap({ dataset: { key: a.key, raw: t }, value: String(i + 1) }));
  setup.actions["labelmap-apply-all"]({ dataset: { key: a.key } });
  assert.equal(b.role, "likert"); assert.equal(b.labelMap["완전 좋음"], 5);
  const r = compute();
  assert.equal(r.analysis.items.length, 2); assert.equal(r.analysis.items[0].n, 10);
  assert.ok(!setup.render().includes("미변환"));
  setup.actions["labelmap-reverse"]({ dataset: { key: a.key } });
  assert.equal(a.labelMap["완전 별로"], 5);
});

test("데이터 설정: 응답으로 보이는 시트가 여럿이면 고르는 카드가 뜨고, 고르면 그 시트로 다시 판별", () => {
  const rows1 = [[1, 4], [2, 5]];
  const rows2 = [[1, 3], [2, 4], [3, 5]];
  loadDataset({
    fileName: "m.xlsx", source: "file", sheets: [
      { name: "1차", headers: ["번호", "만족도"], rows: rows1 },
      { name: "2차", headers: ["번호", "만족도"], rows: rows2 },
    ],
  });
  compute();
  const before = setup.render();
  assert.ok(before.includes("응답 시트 선택") && before.includes("> 1차 ") && before.includes("> 2차 "), "후보 시트 두 개가 보임");
  assert.equal(compute().survey.n, 2, "고르기 전에는 첫 시트(1차, 2행)를 씀");

  chooseDataSheet(1);
  compute();
  const after = setup.render();
  assert.equal(compute().survey.n, 3, "2차 시트(3행)로 다시 판별됨");
  assert.ok(/name="data-sheet" value="1" checked/.test(after), "2차가 선택 표시됨");
});

test("데이터 설정: 응답 시트 후보가 하나뿐이면 고르는 카드가 안 보임(기존 파일 그대로)", async () => {
  const f = "2026_진로탐색_사전사후.xlsx";
  loadDataset(parseFile(new Uint8Array(await readFile(`samples/${f}`)), f, { XLSX, Papa }));
  compute();
  assert.ok(!setup.render().includes("응답 시트 선택"));
});

test("KPI 편집 → 재계산", async () => {
  const f = "2026_진로탐색_사전사후.xlsx";
  loadDataset(parseFile(new Uint8Array(await readFile(`samples/${f}`)), f, { XLSX, Papa }));
  const k = state.kpis.find(x => x.id === "K1");
  k.actual = 6; invalidate();
  const r = compute();
  assert.equal(r.evaluation.results.find(x => x.id === "K1").judgment, "미달성");
});

test("엑셀 템플릿 생성 → 다시 읽으면 시트 역할 인식", () => {
  for (const kind of ["satisfaction", "prepost"]) {
    const ds = parseFile(makeTemplate(kind, XLSX), `t_${kind}.xlsx`, { XLSX, Papa });
    const names = ds.sheets.map(s => s.name);
    assert.ok(names.includes("사업정보") && names.includes("성과지표"));
    loadDataset(ds);
    assert.equal(state.codebook.design, kind === "prepost" ? "prepost-sheets" : "single");
    assert.ok(state.kpis.length >= 2, "템플릿 예시 지표 인식");
  }
});

test("발표 모드: 개요·슬라이드 숨기기·번호 범위", async () => {
  const f = "2026_진로탐색_사전사후.xlsx";
  loadDataset(parseFile(new Uint8Array(await readFile(`samples/${f}`)), f, { XLSX, Papa }));
  const first = present.render({ sub: "1" });
  assert.ok(first.includes("t-cover") && first.includes("p-bar"));
  assert.ok(present.render({ sub: "999" }).includes("t-end"), "범위 밖 번호는 마지막 장");
  present.actions["p-overview"]();
  const ov = present.render({ sub: "2" });
  assert.ok(ov.includes("p-ov-grid") && (ov.match(/class="p-thumb[ "]/g) || []).length === present.visibleSlides().length);
  present.actions["p-overview"]();
  const n = present.visibleSlides().length;
  present.actions["p-toggle"]({ dataset: { id: "cover" } });
  assert.equal(present.visibleSlides().length, n - 1);
  assert.ok(!present.render({ sub: "1" }).includes("t-cover"));
  assert.equal(bad(present.render({ sub: "3" })), null);
  present.actions["p-unhide-all"]();
  assert.equal(present.visibleSlides().length, n);
});

test("작업 내역 화면: 저장소가 없는 환경에서도 안내 표시", () => {
  const html = historyView.render({ sub: "" });
  assert.ok(html.includes("작업 내역"));
  assert.equal(bad(html), null);
});

test("로컬 설정과 업데이트 내역 화면 렌더링", () => {
  const settings = settingsView.render({ sub: "" });
  assert.ok(settings.includes("로컬 설정") && settings.includes("Ctrl") && settings.includes("F5"));
  assert.equal(bad(settings), null);
  const updates = updatesView.render({ sub: "" });
  assert.ok(updates.includes("업데이트 내역") && updates.includes("v5.3.3") && updates.includes("v5.0.0") && updates.includes("v4.3.1") && updates.includes("v2.0.0"));
  assert.equal(bad(updates), null);
});

test("성과지표 빠른 추가·사업정보 선택 섹션", async () => {
  const f = "2026_문화의집_만족도_구글폼.csv";
  loadDataset(parseFile(new Uint8Array(await readFile(`samples/${f}`)), f, { XLSX, Papa }));
  let html = business.render();
  assert.ok(html.includes("빠른 추가") && html.includes("선택 · 고급") && html.includes("논리모형"), "사업정보·논리모형은 처음부터 펼쳐짐");
  business.actions["kpi-quick"]({ dataset: { id: "sat" } });
  assert.equal(state.kpis.length, 1);
  assert.equal(state.kpis[0].metric, "score100");
  assert.ok(Number.isFinite(compute().evaluation.results[0].rate), "빠른 추가 지표는 바로 계산");
  html = business.render();
  assert.ok(html.includes("측정 방법 안내"));
  assert.equal(bad(html), null);
});

test("직접 고친 문장의 근거 수치가 바뀌면 표시(stale)", async () => {
  const f = "2026_진로탐색_사전사후.xlsx";
  loadDataset(parseFile(new Uint8Array(await readFile(`samples/${f}`)), f, { XLSX, Papa }));
  const box = reportBlocks().find(b => b.type === "box");
  const key = box.lines[0].key, autoText = box.lines[0].text;
  state.overrides[key] = "직접 고침";
  state.overrideBase[key] = autoText;
  assert.equal(reportBlocks().find(b => b.type === "box").lines[0].stale, false, "근거 그대로");
  state.overrideBase[key] = "예전 자동 문장";
  const line = reportBlocks().find(b => b.type === "box").lines[0];
  assert.equal(line.stale, true);
  assert.equal(line.auto, autoText);
  assert.ok(report.render().includes("근거 변경"));
});
