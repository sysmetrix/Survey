// HWPX 사업 운영계획서 초안 추출(js/evaluation/business-doc.js): 표·문단 파싱, 병합, KPI 태그
import test from "node:test";
import assert from "node:assert/strict";
import { readBusinessFromHwpx, logicModelFromParagraphs, mergeIntoLogicModel, tagDraftKpis } from "../../js/evaluation/business-doc.js";
import { normalizeLogicModel } from "../../js/evaluation/logic-model.js";

test("표만 있을 때: 기존 엑셀 사업정보 파서와 동일하게 동작", () => {
  const tables = [{ headers: ["항목", "내용"], rows: [
    ["사업명", "2026 진로탐색 캠프"], ["산출", "캠프 4회 운영\n참여 40명"],
  ] }];
  const { logicModel, found } = readBusinessFromHwpx({ paragraphs: [], tables });
  assert.equal(found.business, true);
  assert.equal(logicModel.programName, "2026 진로탐색 캠프");
  assert.deepEqual(logicModel.outputs, ["캠프 4회 운영", "참여 40명"]);
});

test("문단만 있을 때: 제목줄로 배경·목표·산출을 구분", () => {
  const paragraphs = [
    "Ⅰ. 추진배경", "청소년 진로 고민이 많다.", "지역 자원 연계가 부족하다.",
    "Ⅱ. 추진목표", "□ 진로 인식 향상", "□ 자기이해 증진",
    "1. 산출", "캠프 4회 운영",
  ];
  const lm = normalizeLogicModel(logicModelFromParagraphs(paragraphs));
  assert.equal(lm.background, "청소년 진로 고민이 많다. 지역 자원 연계가 부족하다.");
  assert.deepEqual(lm.goals.map(g => g.text), ["진로 인식 향상", "자기이해 증진"]);
  assert.deepEqual(lm.outputs, ["캠프 4회 운영"]);
});

test("매치 안 되는 제목줄(예: 붙임) 뒤 문단은 이전 키에 붙지 않고 버려짐", () => {
  const paragraphs = ["1. 산출", "캠프 4회 운영", "Ⅲ. 붙임", "참가 신청서 양식", "서약서 양식"];
  const lm = logicModelFromParagraphs(paragraphs);
  assert.deepEqual(lm.outputs, ["캠프 4회 운영"]);
  assert.equal(Object.keys(lm).filter(k => k !== "outputs").length, 0, "붙임 이하 내용은 어떤 키에도 들어가지 않아야 함");
});

test("표+문단 혼합: 표 값이 우선, 문단은 빈 칸만 보강", () => {
  const tables = [{ headers: ["항목", "내용"], rows: [["사업명", "표에서 온 이름"]] }];
  const paragraphs = ["Ⅰ. 추진배경", "문단에서 온 배경 설명입니다.", "Ⅱ. 사업명", "문단에서 온 이름(무시되어야 함)"];
  const { logicModel } = readBusinessFromHwpx({ paragraphs, tables });
  assert.equal(logicModel.programName, "표에서 온 이름", "표 값이 우선하고 문단 값으로 덮이지 않아야 함");
  assert.equal(logicModel.background, "문단에서 온 배경 설명입니다.", "표에 없던 배경은 문단이 채움");
});

test("KPI형 표는 metricFromText 매핑이 그대로 동작", () => {
  const tables = [{
    headers: ["지표ID", "지표명", "성과단계", "연계목표", "측정방법", "목표값", "실적값"],
    rows: [["K1", "참여 인원", "산출", "", "직접입력", "200", "230"]],
  }];
  const { kpis, found } = readBusinessFromHwpx({ paragraphs: [], tables });
  assert.equal(found.kpi, true);
  assert.equal(kpis[0].metric, "manual");
  assert.equal(kpis[0].target, 200);
});

test("아무것도 인식 못하면 found 는 모두 false", () => {
  const { logicModel, kpis, found } = readBusinessFromHwpx({ paragraphs: ["그냥 아무 문장입니다."], tables: [{ headers: ["일정", "장소"], rows: [["3월", "1층"]] }] });
  assert.equal(logicModel, null);
  assert.equal(kpis, null);
  assert.deepEqual(found, { business: false, kpi: false });
});

test("mergeIntoLogicModel: 이미 채워진 값은 덮지 않고, 빈 칸만 채움", () => {
  const current = normalizeLogicModel({ programName: "기존 사업명", activities: ["기존 활동"] });
  const draft = normalizeLogicModel({ programName: "문서 사업명", outputs: ["문서 산출"], activities: ["문서 활동"] });
  const merged = mergeIntoLogicModel(current, draft);
  assert.equal(merged.programName, "기존 사업명");
  assert.deepEqual(merged.activities, ["기존 활동"]);
  assert.deepEqual(merged.outputs, ["문서 산출"]);
});

test("tagDraftKpis: note 접두사를 붙이고 기존 note 는 보존", () => {
  const [a, b] = tagDraftKpis([{ id: "K1", note: "" }, { id: "K2", note: "산식 참고" }]);
  assert.equal(a.note, "문서에서 자동 추출 — 확인 필요");
  assert.equal(b.note, "문서에서 자동 추출 — 확인 필요 · 산식 참고");
});
