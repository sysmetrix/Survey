// 화면 렌더 스모크 테스트 (Node — DOM 없이 HTML 문자열 생성 검증)
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { parseFile } from "../../js/io/parse.js";
import { state, loadDataset, reportBlocks, compute, invalidate } from "../../js/ui/store.js";
import * as load from "../../js/ui/views/load.js";
import * as setup from "../../js/ui/views/setup.js";
import * as business from "../../js/ui/views/business.js";
import * as dash from "../../js/ui/views/dash.js";
import * as report from "../../js/ui/views/report.js";
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
    const views = { load, setup, business, dash, report };
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

test("KPI 편집 → 재계산", async () => {
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
