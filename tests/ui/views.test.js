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
import * as presentEdit from "../../js/ui/views/present-edit.js";
import * as historyView from "../../js/ui/views/history.js";
import * as settingsView from "../../js/ui/views/settings.js";
import * as updatesView from "../../js/ui/views/updates.js";
import { splitChapters } from "../../js/report/render-html.js";
import { makeTemplate } from "../../js/io/template-xlsx.js";
import { projectToJson, parseProject } from "../../js/io/project.js";
import { allDeckSlides, applyEditable, applyProject } from "../../js/ui/store.js";
import { captureEditable } from "../../js/history/snapshot.js";
import { chartChoices } from "../../js/ui/present-edit-model.js";
import { cqwToPt, ptToCqw } from "../../js/report/pptx/emu.js";
import { _setForTest as _setFlagsForTest, _resetForTest as _resetFlagsForTest } from "../../js/admin/flags-client.js";
import { clearSession } from "../../js/auth/session.js";
const require = createRequire(import.meta.url);
const XLSX = require("../../vendor/xlsx-0.20.3.full.min.js");
const Papa = require("../../vendor/papaparse-5.4.1.min.js");

const bad = html => /undefined|\[object Object\]|NaN(?!\w)/.exec(html.replace(/data-[a-z-]+="[^"]*"/g, ""));

test("간편 지표: 목적 선택·목표 없는 입력·문항 지정·저장 왕복", async () => {
  const oldStorage = globalThis.localStorage;
  globalThis.localStorage = { getItem: key => key === "survey-v5-session" ? JSON.stringify({ access_token:"test",expires_at:Date.now()+3600000,role:"admin",user:{id:"test"} }) : null };
  const file = "2026_청소년센터_만족도_구글폼.csv";
  loadDataset(parseFile(new Uint8Array(await readFile(`samples/${file}`)), file, { XLSX, Papa }));
  _setFlagsForTest({ guidedKpiSetup: true, surveyVersioning: true, competencyProfile: true, standardComparisons: true });
  try {
    business.actions["kpi-purpose"]({ dataset: { id: "experience" }, checked: true });
    const purposeHtml = business.render();
    assert.ok(purposeHtml.includes("측정 문항 선택 필요"));
    assert.ok(purposeHtml.includes("운영 횟수"), "목적을 선택해도 다른 목적의 지표 옵션은 사라지지 않음");
    business.actions["kpi-quick"]({ dataset: { id: "sat" } });
    const k = state.kpis.at(-1), index = state.kpis.length - 1;
    assert.equal(k.target, null);
    assert.match(compute().evaluation.results.at(-1).error, /선택/);
    business.actions.kpi({ dataset: { i: String(index), field: "targetRef" }, value: "전체" });
    assert.ok(Number.isFinite(compute().evaluation.results.at(-1).actualValue));
    assert.equal(compute().evaluation.results.at(-1).judgment, "목표 미설정");
    business.actions.kpi({ dataset: { i: String(index), field: "targetBasis" }, value: "사업계획서" });
    const restored = parseProject(projectToJson(state));
    assert.equal(restored.kpis.at(-1).targetBasis, "사업계획서");
    assert.deepEqual(restored.codebook.evaluationPurposes, ["experience"]);
    assert.equal(bad(business.render()), null);
  } finally { _resetFlagsForTest(); clearSession(); globalThis.localStorage = oldStorage; }
});

for (const file of ["2026_진로탐색_사전사후.xlsx", "2026_청소년센터_만족도_구글폼.csv", "2026_참여위원회_회고식.xlsx"]) {
  test(`화면 렌더: ${file}`, async () => {
    const ds = parseFile(new Uint8Array(await readFile(`samples/${file}`)), file, { XLSX, Papa });
    loadDataset(ds);
    const views = { load, setup, business, dash, report, present, presentEdit };
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
  assert.ok(html.includes("column-workspace") && html.includes("column-node") && html.includes("column-editor"), "문항 설정은 노드 목록과 선택 문항 편집 패널로 표시");
  assert.ok(!html.includes('<table class="tbl setup">'), "기존 가로 문항 매핑 표를 노출하지 않음");
  setup.actions["column-select"]({ dataset: { key: b.key } });
  assert.match(setup.render(), new RegExp(`data-key="${b.key}" aria-pressed="true"`), "문항 노드를 선택하면 해당 문항만 편집 패널에 표시");
  setup.actions["setup-mode"]({ dataset: { mode: "table" } });
  const tableHtml = setup.render();
  assert.ok(tableHtml.includes("모든 문항을 빠르게 설정") && tableHtml.includes("bulk-question-card"), "빠른 설정 탭은 가로 표 없이 행별 설정 기능을 유지");
  assert.ok(tableHtml.includes('data-field="reverse"') && tableHtml.includes('data-field="domain"') && tableHtml.includes('data-field="time"'), "역문항·영역·시점 설정을 모두 제공");
  setup.actions["setup-mode"]({ dataset: { mode: "map" } });
  L.forEach((t, i) => setup.actions.labelmap({ dataset: { key: a.key, raw: t }, value: String(i + 1) }));
  setup.actions["labelmap-apply-all"]({ dataset: { key: a.key } });
  assert.equal(b.role, "likert"); assert.equal(b.labelMap["완전 좋음"], 5);
  const r = compute();
  assert.equal(r.analysis.items.length, 2); assert.equal(r.analysis.items[0].n, 10);
  assert.ok(!setup.render().includes("미변환"));
  setup.actions["labelmap-reverse"]({ dataset: { key: a.key } });
  assert.equal(a.labelMap["완전 별로"], 5);
  state.codebook.columns.forEach(col => setup.actions.col({ dataset: { key: col.key, field: "role" }, value: "ignore" }));
  setup.actions["column-filter"]({ dataset: { filter: "profile" } });
  const recovered = setup.render();
  assert.ok(recovered.includes('data-filter="all" aria-pressed="true"'), "빈 필터는 전체 문항으로 안전 복구");
  assert.ok(recovered.includes("question-map") && recovered.includes("column-editor"), "빈 필터 뒤에도 노드 지도와 편집 화면을 계속 사용 가능");
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

test("슬라이드 편집: 자유배치 전환, 요소 추가, 슬라이드 추가·삭제·순서변경", async () => {
  const f = "2026_진로탐색_사전사후.xlsx";
  loadDataset(parseFile(new Uint8Array(await readFile(`samples/${f}`)), f, { XLSX, Papa }));
  const first = allDeckSlides()[0];
  presentEdit.actions["pe-select"]({ dataset: { id: first.id } });
  assert.equal(bad(presentEdit.render({})), null, "편집 화면 렌더에 undefined/NaN 없음");
  assert.ok(!presentEdit.render({}).includes("s-free"), "디태치 전에는 자유배치 레이어 없음");

  // 자동 → 자유배치 전환
  presentEdit.actions["pe-detach"]();
  const detached = presentEdit.render({});
  assert.ok(detached.includes("s-free") && detached.includes("s-el "), "디태치 후 자유배치 요소 렌더");
  assert.ok(state.deckOverrides.bySlide[first.id].elements.length > 0);

  // 자동으로 되돌리기
  presentEdit.actions["pe-revert-auto"]();
  assert.equal(state.deckOverrides.bySlide[first.id].mode, "auto");

  // 새 빈 슬라이드 추가 → 목록에 반영, 자동으로 선택됨
  const before = allDeckSlides().length;
  presentEdit.actions["pe-add-slide"]();
  assert.equal(allDeckSlides().length, before + 1);
  const added = allDeckSlides().find(s => s.type === "custom");
  assert.ok(added, "새 슬라이드가 목록에 있음");
  assert.equal(state.deckOverrides.bySlide[added.id].mode, "custom");

  // 자유배치 슬라이드에 텍스트·도형 요소 추가
  presentEdit.actions["pe-add-text"]();
  presentEdit.actions["pe-add-shape"]();
  assert.equal(state.deckOverrides.bySlide[added.id].elements.length, 2);
  const textEl = state.deckOverrides.bySlide[added.id].elements[0];
  assert.equal(textEl.kind, "text");

  // 속성 패널 변경(위치) — pe-add-shape 직후라 지금 선택된 요소는 마지막에 추가한 도형
  presentEdit.actions["pe-el-prop"]({ dataset: { prop: "x" }, value: "42" });
  assert.equal(state.deckOverrides.bySlide[added.id].elements.find(x => x.kind === "shape").x, 42, "선택된(마지막 추가) 도형에 반영");

  // 요소 복제·삭제
  presentEdit.actions["pe-el-duplicate"]();
  assert.equal(state.deckOverrides.bySlide[added.id].elements.length, 3);
  presentEdit.actions["pe-el-delete"]();
  assert.equal(state.deckOverrides.bySlide[added.id].elements.length, 2);

  // 순서 변경: 새 슬라이드를 맨 위로
  const orderBefore = allDeckSlides().map(s => s.id);
  const addedIdx = orderBefore.indexOf(added.id);
  while (allDeckSlides().map(s => s.id).indexOf(added.id) > 0) presentEdit.actions["pe-move-slide"]({ dataset: { dir: "up" } });
  assert.equal(allDeckSlides()[0].id, added.id, `${addedIdx}번째에서 맨 위로 이동`);

  // 슬라이드 삭제(사용자가 만든 슬라이드는 완전히 삭제)
  presentEdit.actions["pe-delete-slide"]();
  assert.equal(allDeckSlides().length, before);
  assert.ok(!state.deckOverrides.customSlides[added.id]);

  // 자동 슬라이드는 삭제해도 숨김 처리(데이터는 남아 복원 가능)
  presentEdit.actions["pe-select"]({ dataset: { id: first.id } });
  presentEdit.actions["pe-delete-slide"]();
  assert.ok(state.deckHidden.includes(first.id));
  assert.ok(allDeckSlides().some(s => s.id === first.id), "숨겨도 목록 자체에서는 안 없어짐(복원 가능)");
});

test("슬라이드 편집: 슬라이드를 지우면 그 자리를 이은 슬라이드가 선택돼 목록이 맨 위로 튀지 않음", async () => {
  const f = "2026_진로탐색_사전사후.xlsx";
  loadDataset(parseFile(new Uint8Array(await readFile(`samples/${f}`)), f, { XLSX, Papa }));
  const ids = () => allDeckSlides().map(s => s.id);
  const selectedIn = html => /class="pe-thumb on"[^>]*data-id="([^"]+)"/.exec(html)?.[1];
  presentEdit.actions["pe-select"]({ dataset: { id: ids()[3] } });
  presentEdit.actions["pe-add-slide"](); // 4번째 뒤에 새 슬라이드(5번째, 선택됨)
  const order = ids(), added = order[4];
  assert.equal(selectedIn(presentEdit.render({})), added, "새 슬라이드가 선택됨");
  presentEdit.actions["pe-delete-slide"]();
  assert.deepEqual(ids(), order.filter(id => id !== added));
  assert.equal(selectedIn(presentEdit.render({})), order[5], "지운 자리를 이은(다음) 슬라이드가 선택됨");
  // 맨 끝 슬라이드를 지우면 앞 슬라이드
  presentEdit.actions["pe-select"]({ dataset: { id: ids().at(-1) } });
  presentEdit.actions["pe-add-slide"]();
  const tail = ids().at(-1);
  assert.equal(selectedIn(presentEdit.render({})), tail);
  presentEdit.actions["pe-delete-slide"]();
  assert.equal(selectedIn(presentEdit.render({})), ids().at(-1), "맨 끝을 지우면 바로 앞 슬라이드");
  assert.ok(!ids().includes(tail));
});

test("슬라이드 편집: 슬라이드 배경색·발표자 노트는 자동 슬라이드에도, 저장·복원·프로젝트 파일을 거쳐도 유지", async () => {
  const f = "2026_진로탐색_사전사후.xlsx";
  loadDataset(parseFile(new Uint8Array(await readFile(`samples/${f}`)), f, { XLSX, Papa }));
  const first = allDeckSlides()[0];
  const autoNotes = [...first.notes];
  assert.ok(autoNotes.length > 0, "표지 자동 노트가 있음");
  presentEdit.actions["pe-select"]({ dataset: { id: first.id } });

  let html = presentEdit.render({});
  assert.ok(html.includes("pe-tools") && html.includes('data-act="pe-detach"'), "자동 슬라이드에는 자유배치로 바꾸기 단추");
  assert.ok(/data-act="pe-add-text"[^>]*disabled/.test(html), "자동 슬라이드에서는 삽입 단추 비활성");
  assert.ok(html.includes("슬라이드 속성") && html.includes('data-change="pe-slide-notes"'), "선택 요소가 없으면 슬라이드 속성 패널");
  assert.equal(bad(html), null);

  // 배경색: 자동 슬라이드가 자유배치로 바뀌면 안 되고, 발표·편집 화면 슬라이드에 그대로 반영
  presentEdit.actions["pe-slide-bg"]({ value: "#112233" });
  assert.equal(state.deckOverrides.bySlide[first.id].mode, "auto");
  assert.equal(allDeckSlides()[0].bg, "#112233");
  assert.equal(present.visibleSlides()[0].bg, "#112233", "발표·내보내기가 쓰는 목록에도 bg");
  assert.ok(present.render({ sub: "1" }).includes('style="background:#112233"'), "발표 화면 슬라이드에 배경색");
  presentEdit.actions["pe-slide-bg"]({ value: "red;background:url(x)" });
  assert.equal(allDeckSlides()[0].bg, undefined, "안전하지 않은 색은 저장하지 않음");
  presentEdit.actions["pe-slide-bg"]({ value: "#112233" });

  // 발표자 노트: 줄마다 하나, 직접 고친 값이 자동 노트보다 우선(발표 모드 노트 패널·내보내기와 같은 slide.notes)
  presentEdit.actions["pe-slide-notes"]({ value: "첫 줄\n\n둘째 줄" });
  assert.deepEqual(allDeckSlides()[0].notes, ["첫 줄", "둘째 줄"]);
  assert.deepEqual(present.visibleSlides()[0].notes, ["첫 줄", "둘째 줄"]);
  html = presentEdit.render({});
  assert.ok(html.includes("첫 줄\n둘째 줄") && html.includes('data-act="pe-slide-notes-reset"'));

  // 저장 → 복원(되돌리기·버전) · 프로젝트 파일 왕복에서도 bg·notes 유지
  const saved = JSON.parse(JSON.stringify(captureEditable(state)));
  const fromFile = parseProject(projectToJson(state));
  assert.equal(fromFile.present.overrides.bySlide[first.id].bg, "#112233");
  state.deckOverrides = { bySlide: {}, customSlides: {} };
  assert.equal(allDeckSlides()[0].bg, undefined);
  applyEditable(saved);
  assert.equal(allDeckSlides()[0].bg, "#112233");
  assert.deepEqual(allDeckSlides()[0].notes, ["첫 줄", "둘째 줄"]);
  state.deckOverrides = { bySlide: {}, customSlides: {} };
  applyProject(fromFile);
  assert.equal(allDeckSlides()[0].bg, "#112233");
  assert.deepEqual(allDeckSlides()[0].notes, ["첫 줄", "둘째 줄"]);

  // 자동 노트와 같은 내용으로 되돌리면 직접 고친 값으로 치지 않음, 지우기·되돌리기
  presentEdit.actions["pe-slide-notes"]({ value: autoNotes.join("\n") });
  assert.equal(state.deckOverrides.bySlide[first.id].notes, undefined);
  assert.deepEqual(allDeckSlides()[0].notes, autoNotes);
  presentEdit.actions["pe-slide-notes"]({ value: "" });
  assert.deepEqual(allDeckSlides()[0].notes, [], "비우면 빈 노트가 우선");
  presentEdit.actions["pe-slide-notes-reset"]();
  assert.deepEqual(allDeckSlides()[0].notes, autoNotes);
  presentEdit.actions["pe-slide-bg-clear"]();
  assert.ok(!("bg" in state.deckOverrides.bySlide[first.id]));
  assert.equal(allDeckSlides()[0].bg, undefined);

  // 숨기기 체크
  presentEdit.actions["pe-slide-hide"]({ checked: true });
  assert.ok(state.deckHidden.includes(first.id));
  presentEdit.actions["pe-slide-hide"]({ checked: false });
  assert.ok(!state.deckHidden.includes(first.id));
});

test("슬라이드 편집: 서식(pt→cqw)·토글·정렬·순서·도형·차트·복사 붙여넣기", async () => {
  const f = "2026_진로탐색_사전사후.xlsx";
  loadDataset(parseFile(new Uint8Array(await readFile(`samples/${f}`)), f, { XLSX, Papa }));
  presentEdit.actions["pe-select"]({ dataset: { id: allDeckSlides()[0].id } });
  presentEdit.actions["pe-add-slide"](); // 빈 자유배치 슬라이드에서 시작
  const slide = allDeckSlides().find(s => s.type === "custom");
  const els = () => state.deckOverrides.bySlide[slide.id].elements;
  const last = () => els()[els().length - 1];

  // 삽입 도구 모음: 텍스트 → 서식 줄이 나타나고 글자 크기는 pt 로 보임(저장은 cqw)
  presentEdit.actions["pe-add-text"]();
  let html = presentEdit.render({});
  assert.ok(html.includes('aria-label="서식"') && html.includes('data-change="pe-font-pt"'));
  assert.ok(html.includes('value="17.3"'), "기본 1.8cqw 는 17.3pt 로 표시");
  assert.equal(bad(html), null);
  const t = last();
  presentEdit.actions["pe-font-pt"]({ value: "24" });
  assert.equal(last().fontSize, ptToCqw(24));
  presentEdit.actions["pe-font-pt"]({ value: "" });
  assert.ok(Number.isFinite(last().fontSize) && last().fontSize >= 0.6, "빈 입력은 최솟값(0·NaN 저장 금지)");
  presentEdit.actions["pe-font-pt"]({ value: "abc" });
  assert.ok(Number.isFinite(last().fontSize) && last().fontSize >= 0.6);
  presentEdit.actions["pe-font-pt"]({ value: "0" });
  assert.ok(last().fontSize >= 0.6);
  presentEdit.actions["pe-font-step"]({ dataset: { dir: "1" } });
  assert.equal(cqwToPt(last().fontSize), 8, "최솟값(≈5.8pt)에서 + 를 누르면 8pt");
  presentEdit.actions["pe-el-prop"]({ dataset: { prop: "fontSize" }, value: "4" });
  assert.equal(last().fontSize, 4);
  html = presentEdit.render({});
  assert.ok(html.includes('value="38.4"') && !html.includes('data-prop="fontSize"'), "cqw 4 는 38.4pt 로만 보임");
  presentEdit.actions["pe-el-prop"]({ dataset: { prop: "fontSize" }, value: "" });
  assert.ok(last().fontSize >= 0.6, "cqw 경로도 0·NaN 이 저장되지 않음");

  // B I U S · 정렬 · 세로정렬 · 줄간격 · 글꼴 · 색 · 채우기 · 테두리 · 투명도
  for (const prop of ["italic", "underline", "strike"]) {
    presentEdit.actions["pe-toggle"]({ dataset: { prop } });
    assert.equal(last()[prop], true, prop);
  }
  presentEdit.actions["pe-toggle"]({ dataset: { prop: "italic" } });
  assert.equal(last().italic, false);
  presentEdit.actions["pe-toggle"]({ dataset: { prop: "weight" } });
  assert.equal(last().weight, "bold");
  presentEdit.actions["pe-toggle"]({ dataset: { prop: "weight" } });
  assert.equal(last().weight, null);
  presentEdit.actions["pe-toggle"]({ dataset: { prop: "kind" } });
  assert.equal(last().kind, "text", "허용하지 않는 속성은 무시");
  presentEdit.actions["pe-set"]({ dataset: { prop: "align", value: "center" } });
  presentEdit.actions["pe-set"]({ dataset: { prop: "valign", value: "middle" } });
  presentEdit.actions["pe-set"]({ dataset: { prop: "align", value: "diagonal" } });
  assert.deepEqual([last().align, last().valign], ["center", "middle"]);
  presentEdit.actions["pe-el-prop"]({ dataset: { prop: "lineHeight" }, value: "1.5" });
  presentEdit.actions["pe-el-prop"]({ dataset: { prop: "fontFamily" }, value: "맑은 고딕" });
  presentEdit.actions["pe-el-prop"]({ dataset: { prop: "color" }, value: "#aa0000" });
  presentEdit.actions["pe-el-prop"]({ dataset: { prop: "fill" }, value: "#ffee00" });
  presentEdit.actions["pe-el-prop"]({ dataset: { prop: "borderColor" }, value: "#00aa00" });
  presentEdit.actions["pe-el-prop"]({ dataset: { prop: "borderWidth" }, value: "2" });
  presentEdit.actions["pe-el-prop"]({ dataset: { prop: "radius" }, value: "8" });
  presentEdit.actions["pe-el-prop"]({ dataset: { prop: "opacity" }, value: "0.5" });
  assert.deepEqual(
    [last().lineHeight, last().fontFamily, last().color, last().fill, last().borderColor, last().borderWidth, last().radius, last().opacity],
    [1.5, "맑은 고딕", "#aa0000", "#ffee00", "#00aa00", 2, 8, 0.5],
  );
  presentEdit.actions["pe-el-prop"]({ dataset: { prop: "opacity" }, value: "5" });
  assert.equal(last().opacity, 1, "범위 밖은 다듬음");
  presentEdit.actions["pe-el-prop"]({ dataset: { prop: "fill" }, value: "url(x);" });
  assert.ok(!("fill" in last()), "안전하지 않은 색은 지워짐");
  presentEdit.actions["pe-el-prop"]({ dataset: { prop: "lineHeight" }, value: "" });
  assert.ok(!("lineHeight" in last()), "빈 값 = 기본으로");
  presentEdit.actions["pe-clear"]({ dataset: { prop: "borderColor" } });
  assert.ok(!("borderColor" in last()));
  presentEdit.actions["pe-el-prop"]({ dataset: { prop: "x" }, value: "abc" });
  assert.ok(Number.isFinite(last().x), "숫자가 아닌 위치 입력은 무시");
  presentEdit.actions["pe-el-prop"]({ dataset: { prop: "x" }, value: "95" });
  assert.equal(last().x, 100 - last().w, "슬라이드 밖으로 나가지 않게 보정");
  html = presentEdit.render({});
  assert.equal(bad(html), null);
  assert.ok(html.includes("텍스트 속성") && html.includes("pe-prop-grid"), "오른쪽 패널: 위치·크기·회전");

  // 배치(슬라이드 기준 정렬)
  presentEdit.actions["pe-align-el"]({ dataset: { how: "center-h" } });
  assert.equal(last().x, (100 - last().w) / 2);
  presentEdit.actions["pe-align-el"]({ dataset: { how: "right" } });
  assert.equal(last().x, 100 - last().w);
  presentEdit.actions["pe-align-el"]({ dataset: { how: "left" } });
  presentEdit.actions["pe-align-el"]({ dataset: { how: "top" } });
  assert.deepEqual([last().x, last().y], [0, 0]);
  presentEdit.actions["pe-align-el"]({ dataset: { how: "bottom" } });
  assert.equal(last().y, 100 - last().h);
  presentEdit.actions["pe-align-el"]({ dataset: { how: "center-v" } });
  assert.equal(last().y, (100 - last().h) / 2);

  // 도형 종류별 기본값: 선·화살표는 가로로 긴 상자에 stroke, 둥근 사각형은 radius
  presentEdit.actions["pe-add-shape"]({ dataset: { shape: "arrow" } });
  assert.deepEqual([last().shapeType, last().w, last().h, last().fill], ["arrow", 30, 4, null]);
  assert.ok(last().stroke && last().strokeWidth > 0);
  presentEdit.actions["pe-add-shape"]({ dataset: { shape: "roundRect" } });
  assert.deepEqual([last().shapeType, last().radius], ["roundRect", 16]);
  presentEdit.actions["pe-add-shape"]({ dataset: { shape: "bogus" } });
  assert.equal(last().shapeType, "rect");
  presentEdit.actions["pe-add-shape"]();
  assert.equal(last().shapeType, "rect");
  html = presentEdit.render({});
  assert.ok(html.includes("도형 속성") && html.includes('data-prop="shapeType"') && html.includes('value="triangle"'));
  assert.equal(bad(html), null);

  // 쌓임 순서(맨 앞/앞/뒤/맨 뒤): z 가 1..n 으로 정리됨
  const target = last().id;
  presentEdit.actions["pe-z"]({ dataset: { how: "back" } });
  assert.equal(els().find(e => e.id === target).z, 1);
  presentEdit.actions["pe-z"]({ dataset: { how: "forward" } });
  assert.equal(els().find(e => e.id === target).z, 2);
  presentEdit.actions["pe-z"]({ dataset: { how: "front" } });
  assert.equal(els().find(e => e.id === target).z, els().length);
  assert.deepEqual(els().map(e => e.z).sort((a, b) => a - b), els().map((_, i) => i + 1));

  // 차트 삽입: 분석 슬라이드의 s.chart 를 골라 넣음
  const choices = chartChoices(allDeckSlides());
  assert.ok(choices.length > 0, "넣을 수 있는 분석 차트가 있음");
  html = presentEdit.render({});
  assert.ok(html.includes('data-menu="chart"'));
  presentEdit.actions["pe-menu"]({ dataset: { menu: "chart" } });
  html = presentEdit.render({});
  assert.ok(html.includes('data-act="pe-add-chart"') && html.includes(`data-slide="${choices[0].slideId}"`), "열린 차트 메뉴에 차트 목록");
  assert.equal(bad(html), null);
  presentEdit.actions["pe-add-chart"]({ dataset: { slide: choices[choices.length - 1].slideId } });
  assert.equal(last().kind, "chart");
  assert.equal(last().chart.kind, choices[choices.length - 1].chart.kind);
  assert.ok(presentEdit.render({}).includes("s-el-chart"));
  assert.ok(!presentEdit.render({}).includes('data-act="pe-add-chart"'), "삽입하면 메뉴가 닫힘");

  // 표: 글자 크기(cqw 1.35 = 13pt)와 pt 입력
  presentEdit.actions["pe-add-table"]();
  assert.equal(last().fontSize, 1.35);
  html = presentEdit.render({});
  assert.ok(html.includes("표 속성") && html.includes('value="13"') && html.includes('data-change="pe-font-pt"'));
  presentEdit.actions["pe-font-pt"]({ value: "20" });
  assert.equal(last().fontSize, ptToCqw(20));

  // 복사·잘라내기·붙여넣기·복제
  const before = els().length;
  const src = last();
  presentEdit.actions["pe-el-copy"]();
  presentEdit.actions["pe-el-paste"]();
  assert.equal(els().length, before + 1);
  const pasted = last();
  assert.notEqual(pasted.id, src.id);
  assert.deepEqual([pasted.x, pasted.y], [Math.min(100 - src.w, src.x + 3), Math.min(100 - src.h, src.y + 3)]);
  pasted.rows[0][0] = "바뀜";
  assert.notEqual(src.rows[0][0], "바뀜", "표 칸을 공유하지 않음");
  presentEdit.actions["pe-el-paste"](); // 연속 붙여넣기는 계단식
  assert.ok(last().x >= pasted.x && last().y >= pasted.y);
  presentEdit.actions["pe-el-duplicate"]();
  assert.equal(els().length, before + 3);
  presentEdit.actions["pe-el-cut"]();
  assert.equal(els().length, before + 2);
  presentEdit.actions["pe-el-paste"]();
  assert.equal(els().length, before + 3);

  // 요소 선택 변경 + 속성 패널: 선택이 없으면 슬라이드 속성으로
  presentEdit.actions["pe-el-select"]({ dataset: { id: src.id } });
  assert.ok(presentEdit.render({}).includes("표 속성"));
  presentEdit.actions["pe-select"]({ dataset: { id: slide.id } });
  assert.ok(presentEdit.render({}).includes("슬라이드 속성"));
});

test("슬라이드 편집: 슬라이드 복제(요소 id 재발급)·끌어놓기 순서 변경·이전 저장본(새 필드 없음) 호환", async () => {
  const f = "2026_진로탐색_사전사후.xlsx";
  loadDataset(parseFile(new Uint8Array(await readFile(`samples/${f}`)), f, { XLSX, Papa }));
  const autoSlide = allDeckSlides().find(s => s.type === "chart") || allDeckSlides()[2];
  presentEdit.actions["pe-select"]({ dataset: { id: autoSlide.id } });
  const total = allDeckSlides().length;

  // 자동 슬라이드 복제 → 자유배치로 바꾼 것과 같은 요소를 가진 새 사용자 슬라이드, 원본 바로 뒤에 위치
  presentEdit.actions["pe-slide-bg"]({ value: "#eeeeee" });
  presentEdit.actions["pe-dup-slide"]();
  const order = allDeckSlides().map(s => s.id);
  assert.equal(order.length, total + 1);
  const copyId = order[order.indexOf(autoSlide.id) + 1];
  assert.notEqual(copyId, autoSlide.id);
  const copy = state.deckOverrides.customSlides[copyId];
  assert.ok(copy && copy.type === "custom" && copy.title.endsWith("(복사)"));
  const copyEntry = state.deckOverrides.bySlide[copyId];
  assert.equal(copyEntry.mode, "custom");
  assert.ok(copyEntry.elements.length > 0);
  assert.equal(copyEntry.bg, "#eeeeee", "배경색도 복사");
  assert.equal(state.deckOverrides.bySlide[autoSlide.id].mode, "auto", "원본 자동 슬라이드는 그대로");
  assert.equal(allDeckSlides().find(s => s.id === copyId).bg, "#eeeeee");
  assert.ok(presentEdit.render({}).includes(copyId), "복제본이 선택돼 편집 화면에 보임");

  // 자유배치 슬라이드 복제: 요소 id 는 모두 새로, 나머지 속성은 그대로
  presentEdit.actions["pe-add-text"]();
  presentEdit.actions["pe-add-shape"]({ dataset: { shape: "ellipse" } });
  presentEdit.actions["pe-dup-slide"]();
  const order2 = allDeckSlides().map(s => s.id);
  const copy2Id = order2[order2.indexOf(copyId) + 1];
  const a = state.deckOverrides.bySlide[copyId].elements, b = state.deckOverrides.bySlide[copy2Id].elements;
  assert.equal(b.length, a.length);
  const ids = new Set([...a, ...b].map(e => e.id));
  assert.equal(ids.size, a.length + b.length, "복제된 요소 id 가 겹치지 않음");
  assert.deepEqual(b.map(({ id, ...rest }) => rest), a.map(({ id, ...rest }) => rest));

  // 끌어놓기 순서 변경(같은 동작을 하는 pe-reorder): 마지막 슬라이드를 맨 앞으로
  const ids0 = allDeckSlides().map(s => s.id);
  const lastId = ids0[ids0.length - 1];
  presentEdit.actions["pe-reorder"]({ dataset: { from: lastId, to: ids0[0], after: "0" } });
  assert.equal(allDeckSlides()[0].id, lastId);
  presentEdit.actions["pe-reorder"]({ dataset: { from: lastId, to: ids0[0], after: "1" } });
  assert.deepEqual(allDeckSlides().slice(0, 2).map(s => s.id), [ids0[0], lastId]);
  const nowOrder = allDeckSlides().map(s => s.id);
  presentEdit.actions["pe-reorder"]({ dataset: { from: lastId, to: lastId, after: "1" } });
  assert.deepEqual(allDeckSlides().map(s => s.id), nowOrder, "제자리에 놓으면 변화 없음");
  const html = presentEdit.render({});
  assert.ok(html.includes('draggable="true"') && html.includes('data-act="pe-dup-slide"') && html.includes('data-act="pe-add-slide"'));
  assert.equal(bad(html), null);

  // 새 필드가 없는 예전 저장본 요소도 그대로 렌더(도구 모음·패널에 undefined/NaN 없음)
  presentEdit.actions["pe-select"]({ dataset: { id: copyId } });
  state.deckOverrides.bySlide[copyId] = { ...state.deckOverrides.bySlide[copyId], elements: [
    { id: "old1", kind: "text", x: 5, y: 5, w: 40, h: 10, rot: 0, z: 1, markup: "예전 텍스트", fontSize: 1.8, align: "left", weight: null, color: null },
    { id: "old2", kind: "shape", x: 5, y: 30, w: 20, h: 20, rot: 0, z: 2, shapeType: "ellipse", fill: "#3B5A7A", stroke: null, strokeWidth: 0 },
    { id: "old3", kind: "table", x: 5, y: 60, w: 60, h: 30, rot: 0, z: 3, headerRow: true, rows: [["a", "b"], ["c", "d"]] },
    { id: "old4", kind: "richtext", x: 50, y: 5, w: 40, h: 30, rot: 0, z: 4, fontSize: 1.4, align: "left", blocks: [{ type: "bullet", text: "x" }] },
    { id: "old5", kind: "image", x: 50, y: 40, w: 20, h: 20, rot: 0, z: 5, src: "data:image/png;base64,AAAA", fit: "cover", radius: 0, opacity: 1 },
  ] };
  for (const id of ["old1", "old2", "old3", "old4", "old5"]) {
    presentEdit.actions["pe-el-select"]({ dataset: { id } });
    assert.equal(bad(presentEdit.render({})), null, id);
  }
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
  // 두 열 구조와 카드 순서: 왼쪽 = 기본 정보 → 자동 저장과 보관 → 화면 → 단축키 / 오른쪽 = 100점 환산 기준 → 앱 파일 새로고침
  assert.equal(settings.split('class="settings-col"').length - 1, 2, "열 래퍼 2개");
  assert.ok(settings.includes('class="settings-cols"') && !settings.includes("settings-grid"));
  const at = t => { const i = settings.indexOf(`<h2>${t}</h2>`); assert.ok(i >= 0, `${t} 카드`); return i; };
  const col2 = settings.lastIndexOf('class="settings-col"');
  const [org, save, look, keys, basis, refreshCard] = ["보고서 기본 정보", "자동 저장과 보관", "화면", "단축키", "100점 환산 기준", "앱 파일 새로고침"].map(at);
  assert.ok(org < save && save < look && look < keys && keys < col2, "왼쪽 열 순서");
  assert.ok(col2 < basis && basis < refreshCard, "오른쪽 열 순서");
  assert.ok(settings.includes("'앱 파일 새로고침' 카드 참고") && !settings.includes("아래 '앱 파일 새로고침'"));
  // 입력 예시는 '예: …' 형식으로 통일
  assert.ok(settings.includes('placeholder="예: 부천여성청소년재단 청소년팀"') && settings.includes('placeholder="예: 홍길동"'));
  const updates = updatesView.render({ sub: "" });
  assert.ok(updates.includes("업데이트 내역") && updates.includes("v5.3.3") && updates.includes("v5.0.0") && updates.includes("v4.3.1") && updates.includes("v2.0.0"));
  assert.equal(bad(updates), null);
});

test("성과지표 빠른 추가·사업정보 선택 섹션", async () => {
  const f = "2026_청소년센터_만족도_구글폼.csv";
  loadDataset(parseFile(new Uint8Array(await readFile(`samples/${f}`)), f, { XLSX, Papa }));
  business.actions["kpi-tab"]({ dataset: { tab: "quick" } });
  let html = business.render();
  assert.ok(html.includes("빠른 설정") && html.includes("선택 · 고급") && html.includes("논리모형"), "빠른 설정 탭과 사업정보·논리모형 영역 표시");
  assert.ok(!html.includes("<details><summary>사업정보") && html.includes("설정 저장") && html.includes("설정 가져오기") && html.includes("문서로 채우기"), "사업정보·논리모형은 펼쳐진 상태이며 작업 명칭은 이용자 관점으로 표시");
  assert.match(html, /class="quick-kpi-help"/, "빠른 추가 설명은 보조 툴팁 영역으로 표시");
  business.actions["kpi-quick"]({ dataset: { id: "sat" } });
  assert.equal(state.kpis.length, 1);
  assert.equal(state.kpis[0].metric, "score100");
  assert.ok(Number.isFinite(compute().evaluation.results[0].rate), "빠른 추가 지표는 바로 계산");
  _setFlagsForTest({ guidedKpiSetup: true });
  html = business.render();
  assert.ok(html.includes("빠른 설정") && html.includes("전체 표 편집") && html.includes("측정 가이드"));
  assert.ok(html.includes("kpi-purpose-cards") && html.includes("kpi-recommendations"), "평가 목적은 카드형으로 선택하고 추천 지표는 같은 목록에서 강조");
  assert.ok(!html.includes("성과지표 설정 방법 보기") && !html.includes("측정 방법 도움말 보기"), "상위 작업은 펼침 토글 대신 탭으로 표시");
  assert.ok(html.includes('data-act="kpi-add"'), "새 지표 추가 행동이 빠른 설정 상단에 항상 렌더링");
  const appCss = await readFile("css/app.css", "utf8");
  assert.ok(appCss.includes(".kpi-workspace { padding-top: 0; overflow: visible; }") && appCss.includes(".kpi-tab-panel > .row:first-child { display: grid;"), "탭이 행동 영역을 가리지 않고 버튼 공간을 확보");
  const uxStandard = await readFile("docs/UX_IMPLEMENTATION_STANDARD.md", "utf8");
  assert.ok(uxStandard.includes("버튼은 잘리거나 말줄임표로 숨기지 않는다") && uxStandard.includes("1280px, 1024px, 768px, 390px"), "화면 구현 기준과 검토 폭을 문서화");
  business.actions["kpi-tab"]({ dataset: { tab: "guide" } });
  html = business.render();
  assert.ok(html.includes("측정 방법 안내") && html.includes("성과지표는 3단계로 설정합니다"));
  assert.equal(bad(html), null);
  _resetFlagsForTest();
});

test("성과지표 표 — KPI 목표 적정성·추이 막대(관리자 전용 미리보기 플래그)", async () => {
  _resetFlagsForTest();
  const f = "2026_청소년센터_만족도_구글폼.csv";
  loadDataset(parseFile(new Uint8Array(await readFile(`samples/${f}`)), f, { XLSX, Papa }));
  business.actions["kpi-quick"]({ dataset: { id: "sat" } });
  const html0 = business.render();
  assert.ok(!html0.includes("전년 실적") && !html0.includes("추이"), "기본값(플래그 꺼짐)에서는 두 열 모두 안 보임");

  _setFlagsForTest({ kpiTargetAdequacy: true, kpiTrendChart: true });
  state.kpis[0].prevActual = state.kpis[0].target - 1; // 목표가 전년보다 아주 조금만 높게(소극적 목표) 설정된 상태 재현
  invalidate();
  const html = business.render();
  assert.ok(html.includes("전년 실적") && html.includes("추이"), "두 플래그가 켜지면 열이 나타남");
  assert.ok(html.includes("kpi-trend"), "추이 막대 마크업이 있어야 함");
  assert.equal(bad(html), null);
  _resetFlagsForTest();
});

test("성과지표 빠른 추가: 청소년 지표는 업로드된 설문에 그 주제를 실제로 묻는 문항이 있을 때만 추천됨", () => {
  const L = ["전혀 아니다", "아니다", "보통", "그렇다", "매우 그렇다"];
  const rows = Array.from({ length: 20 }, (_, i) => [L[i % 5], L[(i + 1) % 5]]);
  // 1) '소속감'을 직접 묻는 문항이 있는 설문 — 그 문항을 대상으로 추천됨
  loadDataset({ fileName: "belong.csv", source: "file", sheets: [{ name: "응답", headers: ["나는 이 지역에 소속감을 느낀다", "전반적으로 만족한다"], rows }] });
  const c = state.codebook.columns.find(x => x.header.includes("소속감"));
  c.role = "likert"; c.scale = { min: 1, max: 5 }; c.labelMap = Object.fromEntries(L.map((t, i) => [t, i + 1]));
  invalidate();
  let html = business.render();
  assert.match(html, /지역사회 소속감 향상 \(나는 이 지역에.*?\)/, "소속감 문항을 대상으로 표시");
  business.actions["kpi-quick"]({ dataset: { id: "belonging" } });
  assert.equal(state.kpis[0].targetRef, "나는 이 지역에 소속감을 느낀다", "소속감 문항이 대상으로 채워짐");

  // 2) 소속감과 무관한 설문 — 관련 문항이 없으니 그 지표 자체를 추천하지 않음(버튼이 안 나타남)
  const L2 = L;
  const rows2 = Array.from({ length: 20 }, (_, i) => [L2[i % 5], L2[(i + 2) % 5]]);
  loadDataset({ fileName: "generic.csv", source: "file", sheets: [{ name: "응답", headers: ["프로그램 내용이 흥미로웠다", "강사가 전문적이었다"], rows: rows2 }] });
  state.codebook.columns.forEach(col => { col.role = "likert"; col.scale = { min: 1, max: 5 }; col.labelMap = Object.fromEntries(L2.map((t, i) => [t, i + 1])); });
  invalidate();
  html = business.render();
  assert.ok(!html.includes("지역사회 소속감 향상"), "관련 문항이 없으면 이 지표는 목록에 나타나지 않음");
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
