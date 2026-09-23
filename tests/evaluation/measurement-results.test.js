import test from "node:test";
import assert from "node:assert/strict";
import { measurementResults } from "../../js/evaluation/measurement-results.js";
import { buildReport } from "../../js/report/build-report.js";
import { buildDeck } from "../../js/present/deck.js";
import { parseProject } from "../../js/io/project.js";
import { clearSession } from "../../js/auth/session.js";

test("공통 측정 결과는 미측정 영역을 0으로 채우지 않고 개선 근거를 유지", () => {
  const cb={design:"single",columns:[],improvements:[{id:"i",action:"활동 시간 조정",evidence:"자유응답 검토",owner:"활동팀",reviewDate:"다음 운영"}]};
  const result=measurementResults({},cb);
  assert.deepEqual(result.domains,[]);
  assert.equal(result.improvements[0].evidence,"자유응답 검토");
  assert.match(result.limitation,/인과적/);
});
test("이전 프로젝트 변환은 계산 변경을 알리고 새 메타데이터를 보존", () => {
  const p=parseProject(JSON.stringify({app:"survey-v5",schema:1,codebook:{columns:[],improvements:[{id:"i",action:"검토"}]},kpis:[{name:"목표 없이 측정",target:null,targetBasis:""}]}));
  assert.equal(p.schema,2);
  assert.match(p.calculationNotice,/계산 규칙 v2/);
  assert.equal(p.codebook.improvements[0].action,"검토");
  assert.equal(p.kpis[0].target,null);
});
test("보고서·발표자료는 공통 개선 과제 모델을 사용하며 로그아웃 뒤 신규 관리자 블록을 만들지 않는다", () => {
  const oldStorage=globalThis.localStorage;
  globalThis.localStorage={getItem:()=>JSON.stringify({access_token:"test",expires_at:Date.now()+3600000,role:"admin",user:{id:"t"}})};
  const cb={design:"single",columns:[],domains:[],improvements:[{id:"i",action:"운영 시간 재검토",evidence:"설문 의견",owner:"팀",reviewDate:"10월"}]};
  const analysis={meta:{n:0,design:"single"},items:[],nps:[],text:[],respondents:[],cross:[],domains:[],multi:[],associations:[]};
  try {
    assert.match(JSON.stringify(buildReport({analysis,codebook:cb})),/운영 시간 재검토/);
    assert.match(JSON.stringify(buildDeck({analysis,codebook:cb})),/운영 시간 재검토/);
  } finally { clearSession();globalThis.localStorage=oldStorage; }
  assert.doesNotMatch(JSON.stringify(buildDeck({analysis,codebook:cb})),/운영 시간 재검토/);
});
