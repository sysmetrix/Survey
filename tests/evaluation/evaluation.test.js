import test from "node:test";
import assert from "node:assert/strict";
import { buildCodebook } from "../../js/model/codebook.js";
import { buildSurvey } from "../../js/model/survey.js";
import { analyzeSurvey } from "../../js/analysis/run.js";
import { achievementRate, evaluateKpis, kpiActual, metricFromText, resolveTarget, targetAdequacy } from "../../js/evaluation/kpi.js";
import { lintEvaluation } from "../../js/evaluation/linkage.js";
import { parseBusinessSheet, parseKpiSheet } from "../../js/evaluation/business-sheet.js";

const ds = { fileName: "e.xlsx", sheets: [{ name: "응답", headers: ["성별", "사전_진로관심", "사후_진로관심", "프로그램 내용", "전반적 만족도"],
  rows: Array.from({ length: 40 }, (_, i) => [i % 2 ? "남" : "여", 2 + (i % 3 === 0 ? 1 : 0), 4 + (i % 4 === 0 ? 1 : 0) - (i % 7 === 0 ? 1 : 0), 3 + (i % 3), 4 + (i % 2)]) }] };

test("달성률: 상향·하향·경계", () => {
  assert.equal(achievementRate(230, 200), 115);
  assert.equal(achievementRate(8, 10, "down"), 120);
  assert.equal(achievementRate(12, 10, "down"), 80);
  assert.equal(metricFromText("긍정응답률(Top2)"), "top2");
  assert.equal(metricFromText("사전사후 변화량"), "prepostDiff");
  assert.equal(metricFromText("연속형 수치 평균"), "numericMean");
  assert.equal(metricFromText("직접입력"), "manual");
});

test("KPI 목표 적정성(전년 실적 대비)", () => {
  assert.equal(targetAdequacy(null, 80), null, "전년 실적 없으면 점검 안 함");
  assert.equal(targetAdequacy(80, null), null, "목표 없으면 점검 안 함");
  assert.match(targetAdequacy(80, 85, "up"), /전년 실적.*이하/, "상향 지표인데 전년보다 목표가 낮음");
  assert.match(targetAdequacy(80.5, 80, "up"), /소극적/, "상향폭이 1% 미만이면 소극적 목표로 안내");
  assert.equal(targetAdequacy(90, 80, "up"), null, "충분히 상향된 목표는 통과");
  assert.match(targetAdequacy(90, 80, "down"), /완화/, "하향 지표인데 전년보다 목표가 느슨함");
  assert.equal(targetAdequacy(70, 80, "down"), null, "하향 지표가 전년보다 낮으면 통과");

  const kpis = [{ id: "K1", name: "만족도", metric: "manual", target: 80, actual: 82, prevActual: 79.5, direction: "up" }];
  const ev = evaluateKpis(kpis, { meta: {}, items: [], nps: [], prepost: null }, { domains: [], columns: [] });
  assert.match(ev.results[0].targetCaution, /소극적/);
});

test("KPI 평가·판정·종합", () => {
  const cb = buildCodebook(ds);
  const an = analyzeSurvey(buildSurvey(ds, cb));
  assert.equal(resolveTarget("진로관심", cb).ids.length, 2);
  const kpis = [
    { id: "K1", name: "참여인원", stage: "산출", goalId: "G1", metric: "manual", target: 40, actual: 42, direction: "up" },
    { id: "K2", name: "진로관심 향상", stage: "단기성과", goalId: "G1", metric: "prepostDiff", targetRef: "진로관심", target: 1.5, direction: "up" },
    { id: "K3", name: "만족도", stage: "단기성과", goalId: "G2", metric: "score100", targetRef: "프로그램 내용", target: 80, direction: "up" },
    { id: "K4", name: "없는문항", stage: "단기성과", metric: "mean", targetRef: "존재하지않음", target: 4 },
  ];
  const ev = evaluateKpis(kpis, an, cb);
  assert.equal(ev.results[0].judgment, "달성");
  assert.ok(Math.abs(ev.results[1].actualValue - an.prepost.items[0].diff) < 1e-12);
  assert.equal(ev.results[3].judgment, "측정 불가");
  assert.equal(ev.summary.total, 4); assert.equal(ev.summary.unmeasured, 1);
  const lint = lintEvaluation({ goals: [{ id: "G1", text: "진로역량" }, { id: "G2", text: "만족" }, { id: "G3", text: "지표없음" }], activities: ["캠프"] }, kpis, cb, an);
  assert.ok(lint.some(w => /지표없음/.test(w.msg)));
  assert.ok(lint.some(w => w.kpiId === "K4" && w.level === "error"));
});

test("사업정보·성과지표 시트 파싱", () => {
  const lm = parseBusinessSheet({ headers: ["구분", "항목", "내용", "비고"], rows: [
    ["사업개요", "사업명", "2026 진로탐색 캠프", null], ["사업개요", "사업기간", "2026. 3.~8.", null],
    ["사업개요", "사업목적", "청소년 진로역량 강화", null], ["목표", "추진목표", "진로 관심 향상", null], ["목표", "추진목표", "자기이해 증진", null],
    ["논리모형", "투입", "예산 1,000만원\n강사 5명", null], ["논리모형", "활동", "진로캠프 4회", null], ["논리모형", "단기성과", "진로 관심 향상", null],
  ] });
  assert.equal(lm.programName, "2026 진로탐색 캠프"); assert.equal(lm.goals.length, 2); assert.deepEqual(lm.inputs, ["예산 1,000만원", "강사 5명"]);
  const kp = parseKpiSheet({ headers: ["지표ID", "지표명", "성과단계", "연계목표", "측정방법", "대상문항", "목표값", "실적값", "방향", "단위", "근거ID", "근거 적용 사유", "원문 검토"], rows: [
    ["K1", "참여 인원", "산출", "진로 관심 향상", "직접입력", null, "200", "230", "상향", "명", "oecd-results-framework", "산출과 성과를 구분해 해석하기 위해 적용", "예"],
    ["K2", "진로관심 변화", "단기성과", "G1", "사전사후 변화량", "진로관심", 0.3, null, null, "점", "unknown", "무효 근거", "아니오"],
  ] }, lm);
  assert.equal(kp[0].goalId, "G1"); assert.equal(kp[0].target, 200); assert.equal(kp[1].metric, "prepostDiff");
  assert.equal(kp[0].evidenceRef, "oecd-results-framework"); assert.equal(kp[0].evidenceReviewed, true);
  assert.equal(kp[1].evidenceRef, ""); assert.equal(kp[1].evidenceReviewed, false);
});

test("연속형 수치 KPI는 숫자 문항만 원점수로 계산한다", () => {
  const numericCb = { domains: [], columns: [{ key: "count", label: "참여 인원", header: "참여 인원", role: "numeric" }, { key: "pre", label: "참여 인원", header: "사전 참여 인원", role: "numeric", time: "pre" }, { key: "post", label: "참여 인원", header: "사후 참여 인원", role: "numeric", time: "post" }] };
  const analysis = { meta: { n: 4 }, numerics: [{ key: "count", label: "참여 인원", n: 4, mean: 4.5, median: 4.5, total: 18, values: [2, 4, 5, 7] }], items: [], nps: [], prepost: { scopeKeys: ["pre", "post"], qualityIssues: [], numericItems: [{ pre: "pre", post: "post", label: "참여 인원", n: 4, diff: 1.5, primary: { p: 0.02 } }], items: [], domains: [] } };
  assert.equal(kpiActual({ metric: "numericMean", targetRef: "@item:count" }, analysis, numericCb).value, 4.5);
  assert.equal(kpiActual({ metric: "numericSum", targetRef: "@item:count" }, analysis, numericCb).value, 18);
  assert.equal(kpiActual({ metric: "numericAboveRate", targetRef: "@item:count", sourceThreshold: 5 }, analysis, numericCb).value, 50);
  assert.equal(kpiActual({ metric: "numericPrepostDiff", targetRef: "@item:post" }, analysis, numericCb).value, 1.5);
  assert.match(kpiActual({ metric: "numericMean", targetRef: "전체" }, analysis, numericCb).error, /하나/);
});
