import { state, compute, invalidate } from "./store.js";
import { esc, download, readFileText, readFileBytes, toast } from "./util.js";
import { refresh } from "./router.js";
import { isFeatureOn } from "../admin/flags-client.js";
import { instrumentFromCodebook, instrumentFromSheet, parseInstrument, instrumentMapping, applyInstrument, comparisonCompatibility } from "../evaluation/instrument.js";
import { parseFile } from "../io/parse.js";
import { loadXlsx } from "./xlsx-loader.js";
import { hbar } from "../charts/svg.js";
import { parseProject } from "../io/project.js";
import { buildSurvey } from "../model/survey.js";
import { analyzeSurvey } from "../analysis/run.js";
import { measurementResults } from "../evaluation/measurement-results.js";
let draft = null, comparison = null;
const comparisonKey = () => JSON.stringify([state.codebook,state.settings.scoreBasis,state.excludeStraight]);
export function clearMeasurementDrafts() { draft = null; comparison = null; }
const num = v => Number.isFinite(v) ? v.toFixed(2) : "미측정";
export function renderMeasurement() {
  const cb = state.codebook, meta = cb.instrument || {};
  if (comparison && comparison.key !== comparisonKey()) comparison = null;
  let html = "";
  if (isFeatureOn("surveyVersioning")) html += `<section class="card"><h2>측정도구 관리</h2><p class="small muted">사용자 제공 도구입니다. 출처를 입력해도 공식 원본으로 인증되지는 않습니다. HWP 자동 불러오기는 지원하지 않습니다.</p><div class="grid2">${Object.entries({name:"도구 이름",version:"개정 버전",source:"출처",ageGroup:"대상 연령군",measurementTime:"측정 시점"}).map(([f,label]) => `<label class="field">${label}<input class="in" data-change="instrument-meta" data-field="${f}" value="${esc(meta[f] || "")}"></label>`).join("")}</div><div class="row gap wrap"><button class="btn" data-act="instrument-save">현재 문항 세트 저장</button><label class="btn">문항 세트 불러오기(JSON)<input type="file" accept=".json" data-change="instrument-load" hidden></label><a href="https://www.kywa.or.kr/pressinfo/data_view.jsp?code=null&no=35893" target="_blank" rel="noopener noreferrer">KYWA 공식 양식</a></div>${draft ? `<h3>적용 전 문항 연결 확인</h3><ul>${instrumentMapping(draft,cb).map(m => `<li>${esc(m.item.label)}: ${esc(m.status)}</li>`).join("")}</ul><button class="btn" data-act="instrument-apply">확인 후 적용</button><button class="btn" data-act="instrument-cancel">취소</button>` : ""}</section>`;
  if (isFeatureOn("competencyProfile")) {
    const domains = compute().analysis.prepost?.domains.filter(d => d.id !== "ALL") || [];
    html += `<section class="card"><h2>측정 영역별 관찰된 변화</h2><p class="small muted">측정된 영역만 표시합니다. 공식 핵심역량 전체를 측정했다는 의미는 아닙니다.</p>${domains.length ? `<div class="tblwrap"><table class="tbl"><thead><tr><th>영역</th><th>문항 수</th><th>유효 응답자</th><th>사전</th><th>사후</th><th>변화</th><th>효과크기 d</th></tr></thead><tbody>${domains.map(d => `<tr><th>${esc(d.name)}</th><td>${d.nItems}</td><td>${d.n}</td><td>${num(d.mPre)}</td><td>${num(d.mPost)}</td><td>${num(d.diff)}</td><td>${num(d.dz)}</td></tr>`).join("")}</tbody></table></div>` : '<p>영역이 지정된 사전·사후 자료가 필요합니다.</p>'}</section>`;
  }
  if (isFeatureOn("surveyVersioning")) html += `<section class="card"><h3>XLSX 문항정보 불러오기</h3><p>시트 이름: 문항정보 또는 코드북. 필수 열: 문항ID, 문항명, 최소값, 최대값. 선택 열: 시점(사전·사후), 영역, 역채점(예·아니오). 응답자료는 교체하지 않으며 문항 연결을 미리 확인합니다.</p><label class="btn">XLSX 선택<input type="file" accept=".xlsx" data-change="instrument-xlsx" hidden></label></section>`;
  if (isFeatureOn("competencyProfile")) {
    const result = measurementResults(compute().analysis, cb);
    if(result.domains.length) html += `<section class="card"><h3>영역별 변화량 비교</h3><p>${esc(result.limitation)}</p><div class="tblwrap">${hbar(result.domains.map(d=>({label:d.name,value:d.diff})),{min:Math.min(0,...result.domains.map(d=>d.diff)),title:"사후−사전 변화량",unit:"점"}).svg}</div></section>`;
  }
  if (isFeatureOn("competencyProfile")) {
    const result = measurementResults(compute().analysis, cb);
    html += `<section class="card"><h2>사업 개선 기록</h2><p>수치·자유응답·관찰 기록을 검토해 담당자가 작성하세요. 개인을 식별할 수 있는 내용은 기록하지 마세요.</p>${result.improvements.map(task => `<fieldset><legend>개선 과제</legend>${Object.entries({evidence:"검토한 근거(문항·영역·의견)",action:"개선 과제",owner:"담당자 또는 담당 부서",reviewDate:"확인 시점"}).map(([field,label]) => `<label class="field">${label}<input class="in" data-change="improvement-edit" data-id="${esc(task.id)}" data-field="${field}" value="${esc(task[field])}" maxlength="1000"></label>`).join("")}<button class="btn" data-act="improvement-delete" data-id="${esc(task.id)}">과제 삭제</button></fieldset>`).join("")}<button class="btn" data-act="improvement-add">개선 과제 추가</button></section>`;
  }
  if (isFeatureOn("standardComparisons")) html += `<section class="card"><h2>다른 프로젝트와 기술적 비교</h2><p>현재 프로젝트와 같은 기준으로 측정한 프로젝트를 선택하세요. 개인을 연결하거나 사업 순위를 매기지 않습니다.</p><label class="btn">비교할 프로젝트(JSON)<input type="file" accept=".json" data-change="comparison-load" hidden></label>${comparison ? `<p>${esc(comparison.message)}</p>${comparison.rows ? `<ul>${comparison.rows.map(r => `<li>${esc(r.name)} — 현재 변화 ${num(r.current)} / 비교 변화 ${num(r.other)}</li>`).join("")}</ul><p class="small muted">표본 구성과 조사 시점 차이가 있으므로 차이를 사업 효과 차이로 해석하지 마세요.</p>` : ""}` : ""}</section>`;
  return html;
}
export const measurementActions = {
  "instrument-xlsx": async el => {
    if(!isFeatureOn("surveyVersioning")) return;
    try {
      const file=el.files?.[0]; if(!file) return;
      if(file.size>2*1024*1024) throw new Error("문항정보 파일은 2MB 이하여야 합니다.");
      const dataset=parseFile(await readFileBytes(file),file.name,{XLSX:await loadXlsx()});
      const sheets=dataset.sheets.filter(s=>/^(문항정보|코드북)$/.test(s.name.replace(/\s/g,"")));
      if(sheets.length!==1) throw new Error("문항정보 또는 코드북 시트가 정확히 하나 필요합니다.");
      draft=instrumentFromSheet(sheets[0]); refresh();
    } catch(e) { toast(e.message,"bad"); }
  },
  "improvement-add": () => { if (!isFeatureOn("competencyProfile")) return; (state.codebook.improvements ||= []).push({id:crypto.randomUUID(),evidence:"",action:"",owner:"",reviewDate:""}); invalidate(); refresh(); },
  "improvement-edit": el => { if (!isFeatureOn("competencyProfile") || !["evidence","action","owner","reviewDate"].includes(el.dataset.field)) return; const task=state.codebook.improvements?.find(t=>t.id===el.dataset.id); if(task) { task[el.dataset.field]=el.value.slice(0,1000); invalidate(); refresh(); } },
  "improvement-delete": el => { if (!isFeatureOn("competencyProfile")) return; state.codebook.improvements=(state.codebook.improvements||[]).filter(t=>t.id!==el.dataset.id); invalidate(); refresh(); },
  "instrument-meta": el => {
    if (!isFeatureOn("surveyVersioning") || !["name","version","source","ageGroup","measurementTime"].includes(el.dataset.field)) return;
    state.codebook.instrument = { ...state.codebook.instrument, [el.dataset.field]: el.value.slice(0,500), origin:"user", scoring:"paired-common-half-v2" };
    invalidate(); refresh();
  },
  "instrument-save": () => { if (isFeatureOn("surveyVersioning")) download(JSON.stringify(instrumentFromCodebook(state.codebook), null, 2), "측정도구.json", "application/json"); },
  "instrument-load": async el => {
    if (!isFeatureOn("surveyVersioning")) return;
    try { const f = el.files?.[0]; if (!f) return; if (f.size > 2*1024*1024) throw new Error("파일은 2MB 이하여야 합니다."); draft = parseInstrument(await readFileText(f)); refresh(); } catch(e) { toast(e.message,"bad"); }
  },
  "instrument-cancel": () => { draft = null; refresh(); },
  "instrument-apply": () => { if (!isFeatureOn("surveyVersioning") || !draft) return; try { state.codebook = applyInstrument(draft,state.codebook); draft=null; invalidate(); refresh(); } catch(e) { toast(e.message,"bad"); } },
  "comparison-load": async el => {
    if (!isFeatureOn("standardComparisons")) return;
    comparison = null;
    try {
      const f = el.files?.[0]; if (!f) return; if(f.size>80*1024*1024) throw new Error("프로젝트가 너무 큽니다.");
      const p = parseProject(await readFileText(f));
      if (!p.codebook || !p.dataset) throw new Error("원자료를 포함한 프로젝트 파일이 필요합니다.");
      const compatible = comparisonCompatibility(state.codebook,p.codebook);
      if ((p.settings?.scoreBasis || "exact") !== state.settings.scoreBasis) compatible.reasons.push("100점 환산 기준이 다름");
      if (!!p.excludeStraight !== !!state.excludeStraight) compatible.reasons.push("응답 제외 기준이 다름");
      if (state.excludeStraight || p.excludeStraight) compatible.reasons.push("응답 제외가 적용된 프로젝트 비교는 아직 지원하지 않음");
      compatible.compatible = compatible.reasons.length === 0;
      if (!compatible.compatible) comparison={message: compatible.reasons.join(" · ")};
      else {
        const other=analyzeSurvey(buildSurvey(p.dataset,p.codebook), { scoreBasis: p.settings?.scoreBasis || "exact" }).prepost?.domains || [];
        comparison={message:"측정 기준 일치 · 기술적 비교", rows:(compute().analysis.prepost?.domains || []).filter(d=>d.id!=="ALL").map(d=>({name:d.name,current:d.diff,other:other.find(o=>o.name===d.name)?.diff}))};
      }
      comparison.key = comparisonKey();
      refresh();
    } catch(e) { toast(e.message,"bad"); refresh(); }
  },
};
