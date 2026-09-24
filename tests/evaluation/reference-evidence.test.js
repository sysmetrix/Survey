import test from "node:test";
import assert from "node:assert/strict";
import { REFERENCE_EVIDENCE, normalizeEvidenceRef, referenceEvidenceById, validateKpiEvidence } from "../../js/evaluation/reference-evidence.js";
import { kpiCards } from "../../js/ui/kpi-cards.js";
import { buildReport } from "../../js/report/build-report.js";
import { clearSession } from "../../js/auth/session.js";
import { buildDeck } from "../../js/present/deck.js";

test("근거 레퍼런스는 고정 ID만 허용하고 KPI 카드에서 선택한다", () => {
  const ref = REFERENCE_EVIDENCE[0];
  assert.equal(normalizeEvidenceRef(ref.id), ref.id);
  assert.equal(normalizeEvidenceRef("임의 출처"), "");
  assert.equal(referenceEvidenceById(ref.id)?.url, ref.url);
  assert.equal(validateKpiEvidence({ evidenceRef:ref.id }, "manual").valid, false);
  assert.equal(validateKpiEvidence({ evidenceRef:ref.id, evidenceReviewed:true, evidenceRationale:"사업 목표와 결과 단계 구분에 적용" }, "manual").valid, true);
  const html = kpiCards([{ id:"K1", name:"참여 경험", metric:"manual", evidenceRef:ref.id }], [], [], { evidenceOn:true });
  assert.match(html, /분석 해석 근거/);
  assert.match(html, new RegExp(`value="${ref.id}" selected`));
  assert.match(html, /보고서 반영 조건/);
  assert.match(html, /현재 측정방법에 맞는 근거/);
  assert.match(html, /적용 사유 10자 이상/);
  assert.match(html, /원문 위치·한계 확인/);
  assert.match(html, /세 조건을 모두 충족한 근거만 분석 결과·보고서·발표자료에 표시/);
});

test("성과지표 카드가 근거 조건 충족 여부를 즉시 표시한다", () => {
  const ref = REFERENCE_EVIDENCE[0];
  const incomplete = kpiCards([{ id:"K1", name:"참여 인원", metric:"manual", evidenceRef:ref.id, evidenceRationale:"짧음", evidenceReviewed:false }], [], [], { evidenceOn:true });
  assert.match(incomplete, /원문 검토 확인 필요/);
  assert.doesNotMatch(incomplete, /보고서 반영 가능/);
  const complete = kpiCards([{ id:"K1", name:"참여 인원", metric:"manual", evidenceRef:ref.id, evidenceRationale:"활동 산출과 참여자 성과를 구분하는 데 적용", evidenceReviewed:true }], [], [], { evidenceOn:true });
  assert.match(complete, /보고서 반영 가능/);
});

test("연결된 근거는 분석 보고서에 ID·원칙·원문 URL로 추적된다", () => {
  const oldStorage = globalThis.localStorage;
  globalThis.localStorage = { getItem: () => JSON.stringify({ access_token:"test", expires_at:Date.now()+3600000, role:"admin", user:{id:"test"} }) };
  const ref = REFERENCE_EVIDENCE[0];
  const analysis = { meta:{n:0,design:"single"}, items:[], nps:[], text:[], respondents:[], cross:[], domains:[], multi:[], associations:[] };
  const evaluation = { results:[{ id:"K1", name:"참여 경험", metric:"manual", stage:"산출", evidenceRef:ref.id, evidenceReviewed:true, evidenceRationale:"사업 목표와 결과 단계 구분에 적용" }], summary:{ total:1, measured:0, achieved:0, mostly:0, notAchieved:0, unmeasured:1, unsetTarget:0, byStage:[] } };
  try {
    const json = JSON.stringify(buildReport({ analysis, evaluation, codebook:{columns:[],domains:[]}, settings:{} }));
    assert.match(json, new RegExp(ref.id));
    assert.match(json, new RegExp(ref.principle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.match(json, /성과지표 해석 근거 추적표/);
    assert.match(json, /https:\/\/www\.oecd\.org/);
    const deck = JSON.stringify(buildDeck({ analysis, evaluation, codebook:{columns:[],domains:[]}, settings:{} }));
    assert.match(deck, new RegExp(ref.id));
    assert.match(deck, /검토 완료 근거 1건/);
  } finally { clearSession(); globalThis.localStorage = oldStorage; }
});
