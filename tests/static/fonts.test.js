// 분석 결과 화면 글꼴 — 화면 전체가 앱 글꼴(Pretendard GOV, --font)로 보이는지 정적으로 확인
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { FONT_PRESETS, DEFAULT_FONT_PRESET } from "../../js/report/hwpx/fonts.js";

const css = await readFile("css/app.css", "utf8");
/** 선택자가 정확히 sel 인 규칙의 본문(첫 번째 것) */
const ruleBody = sel => {
  const esc = sel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const m = css.match(new RegExp(`(?:^|\\})\\s*${esc}\\s*\\{([^}]*)\\}`, "m"));
  return m ? m[1] : null;
};

test(".paper.view 는 --paper-* 글꼴 변수를 앱 글꼴(--font)로 지정해 함초롬 글꼴로 떨어지지 않는다", () => {
  const body = ruleBody(".paper.view");
  assert.ok(body, ".paper.view 규칙이 있어야 함");
  for (const v of ["--paper-body", "--paper-heading", "--paper-sub-font"]) {
    assert.match(body, new RegExp(`${v}:\\s*var\\(--font\\)`), `${v} 는 var(--font)`);
  }
  assert.match(body, /font-family:\s*var\(--font\)/);
  // 분석 결과 화면 규칙 어디에도 옛 문서 글꼴을 직접 지정하지 않음
  const viewRules = css.split("\n").filter(l => /\.paper\.view/.test(l) && !/^\s*:root/.test(l));
  for (const l of viewRules) assert.ok(!/함초롬|바탕|HY헤드라인|휴먼명조|serif/.test(l), `.paper.view 규칙에 옛 글꼴 지정: ${l.trim().slice(0, 80)}`);
});

test("보고서 편집 화면(.paper.edit)은 기존대로 --paper-* 변수를 인라인으로 받고, 기본 글꼴 폴백은 문서 글꼴 그대로", () => {
  assert.ok(!/\.paper\.edit\s*\{[^}]*--paper-(body|heading|sub-font)\s*:\s*var\(--font\)/.test(css), ".paper.edit 에는 앱 글꼴을 강제하지 않음");
  const paper = ruleBody(".paper");
  assert.ok(paper && /font-family:\s*var\(--paper-body,\s*"함초롬바탕"/.test(paper), ".paper 기본은 --paper-body → 함초롬바탕 폴백");
  assert.ok(/\.r-title\s*\{[^}]*var\(--paper-heading,\s*"함초롬돋움"\),\s*var\(--font\)/.test(css), ".r-title 폴백 체인 유지");
});

test("HWPX 내보내기 글꼴 프리셋은 그대로", () => {
  const ids = FONT_PRESETS.map(p => p.id);
  for (const id of ["gov", "hancom", "malgun", "nanum", "kopub", "noto", "pretendard", "custom"]) assert.ok(ids.includes(id), `프리셋 ${id}`);
  assert.equal(DEFAULT_FONT_PRESET, "gov");
  assert.equal(FONT_PRESETS.find(p => p.id === "gov").body, "휴먼명조");
  assert.equal(FONT_PRESETS.find(p => p.id === "hancom").body, "함초롬바탕");
});
