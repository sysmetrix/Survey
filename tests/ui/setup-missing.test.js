// 데이터 설정: 결측 코드 입력·자동 후보 경고·보기별 결측 처리
import test from "node:test";
import assert from "node:assert/strict";
import { state, loadDataset, compute } from "../../js/ui/store.js";
import * as setup from "../../js/ui/views/setup.js";

const bad = html => /undefined|\[object Object\]|NaN(?!\w)/.exec(html.replace(/data-[a-z-]+="[^"]*"/g, ""));

test("데이터 설정: 결측 코드 후보 경고 → 한 번에 지정 → 분석에서 무응답 처리", () => {
  const rows = Array.from({ length: 30 }, (_, i) => [i % 2 ? "남" : "여", (i % 5) + 1]);
  rows.push(["남", 99]);
  loadDataset({ fileName: "miss.csv", source: "file", sheets: [{ name: "응답", headers: ["성별", "프로그램 만족"], rows }] });
  const col = state.codebook.columns[1];
  assert.equal(col.role, "likert");
  assert.deepEqual(col.missingSuggest, ["99"]);
  setup.actions["column-select"]({ dataset: { key: col.key } });
  let html = setup.render();
  assert.ok(!bad(html), bad(html)?.[0]);
  assert.ok(html.includes("결측 코드 후보가 있는 문항 1개") && html.includes('data-act="missing-apply-suggest"'), "결측 코드 후보 경고와 지정 버튼");
  assert.ok(html.includes('data-field="missingCodes"') && html.includes("프로그램 만족 결측 코드"), "열 설정에 결측 코드 입력칸(문항 이름이 들어간 접근성 이름)");
  assert.equal(compute().analysis.items[0].n, 30);
  setup.actions["missing-apply-suggest"]();
  assert.deepEqual(col.missingCodes, ["99"]);
  html = setup.render();
  assert.ok(!html.includes("결측 코드 후보가 있는 문항"), "지정 후 경고가 사라짐");
  const item = compute().analysis.items[0];
  assert.equal(item.n, 30); assert.equal(item.missing, 1, "99는 범위 밖 오류가 아니라 무응답으로 집계");
  // 직접 입력: 공백·중복·빈 값 정리, 문자열로 저장
  setup.actions.col({ dataset: { key: col.key, field: "missingCodes" }, value: " 99, -1 ,, 99，9 " });
  assert.deepEqual(col.missingCodes, ["99", "-1", "9"]);
  setup.actions.col({ dataset: { key: col.key, field: "missingCodes" }, value: "" });
  assert.deepEqual(col.missingCodes, []);
});

test("데이터 설정: 보기 점수 패널에서 '잘 모르겠다'를 결측 처리하면 점수 매핑에서 빠짐", () => {
  const L = ["전혀 그렇지 않다", "그렇지 않다", "보통이다", "그렇다", "매우 그렇다", "잘 모르겠다"];
  const rows = Array.from({ length: 12 }, (_, i) => [L[i % 6]]);
  loadDataset({ fileName: "label.csv", source: "file", sheets: [{ name: "응답", headers: ["강사가 친절했다"], rows }] });
  const col = state.codebook.columns[0];
  assert.equal(col.role, "likert");
  assert.equal(col.labelMap["잘 모르겠다"], undefined, "'잘 모르겠다'는 3점으로 채점하지 않음");
  assert.deepEqual(col.missingSuggest, ["잘 모르겠다"]);
  setup.actions["toggle-labels"]({ dataset: { key: col.key } });
  let html = setup.render();
  assert.ok(html.includes('data-change="labelmissing"') && html.includes("‘잘 모르겠다’ 결측 처리") && html.includes("‘그렇다’ 점수"), "보기별 결측 처리 체크박스·점수 입력 접근성 이름");
  col.labelMap = { ...col.labelMap, "잘 모르겠다": 3 }; // 예전 저장본처럼 점수가 매겨진 경우
  setup.actions.labelmissing({ dataset: { key: col.key, raw: "잘 모르겠다" }, checked: true });
  assert.deepEqual(col.missingCodes, ["잘 모르겠다"]);
  assert.equal(col.labelMap["잘 모르겠다"], undefined);
  html = setup.render();
  assert.match(html, /checked data-change="labelmissing"/);
  const item = compute().analysis.items[0];
  assert.equal(item.n, 10); assert.equal(item.missing, 2);
  setup.actions.labelmissing({ dataset: { key: col.key, raw: "잘 모르겠다" }, checked: false });
  assert.deepEqual(col.missingCodes, []);
});
