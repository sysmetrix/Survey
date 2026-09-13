// ② 데이터 설정 화면: 설계·열 역할·척도·역문항·영역·사전사후 짝·매칭·불성실응답
import { state, compute, invalidate } from "../store.js";
import { ROLES, normKey } from "../../model/detect.js";
import { DESIGN_LABELS, rawColumn } from "../../model/codebook.js";
import { LABEL_SETS, matchLabelSet, mapWithSet } from "../../model/label-sets.js";
import { unmappedValues } from "../../model/recode.js";
import { maskPII, isBlank } from "../../core/util.js";
import { esc, option, levelBadge, toast } from "../util.js";
import { refresh, go } from "../router.js";

const SHEET_ROLE = { data: "응답", pre: "사전 응답", post: "사후 응답", codebook: "문항정보", business: "사업정보", kpi: "성과지표", guide: "안내" };
const IS_NUM = s => /^[-+]?\d+(\.\d+)?$/.test(s);
let expanded = null; // 보기 점수 패널이 열린 열

/** 열의 문자 응답(숫자 아닌 값)과 응답 수 */
function textResponses(col) {
  const counts = new Map();
  rawColumn(state.dataset, col).forEach(v => { if (isBlank(v)) return; const s = String(v).trim(); if (!IS_NUM(s)) counts.set(s, (counts.get(s) || 0) + 1); });
  return counts;
}

function labelPanel(c, unm) {
  const counts = textResponses(c);
  const map = c.labelMap || {};
  const entries = [...counts.entries()].sort((a, b) => (map[a[0]] ?? 99) - (map[b[0]] ?? 99) || b[1] - a[1]);
  const { min = 1, max = 5 } = c.scale || {};
  const range = unm.filter(u => u.reason === "range");
  const key = esc(c.key);
  return `<tr class="labelrow"><td colspan="9"><div class="labelpanel">
    <div class="row between wrap"><b>‘${esc(c.label)}’ 보기별 점수</b><span class="small muted">척도 ${min}~${max}점 · 숫자로 입력된 응답은 그대로 사용 · 빈칸 = 무응답 처리</span></div>
    ${entries.length ? `<table class="tbl mini"><tr><th>응답 문구</th><th class="c">응답 수</th><th>점수</th></tr>${entries.map(([s, n]) => `<tr class="${map[s] === undefined ? "unmapped" : ""}"><td>${esc(s)}</td><td class="c">${n}</td><td><input class="in num" type="number" min="${min}" max="${max}" step="1" value="${map[s] ?? ""}" placeholder="?" data-change="labelmap" data-key="${key}" data-raw="${esc(s)}"></td></tr>`).join("")}</table>` : `<p class="small muted">문자 응답이 없습니다(모두 숫자).</p>`}
    ${range.length ? `<p class="small bad-text">척도 범위(${min}~${max}) 밖 값: ${range.map(u => `${esc(u.value)}(${u.n}건)`).join(", ")} — 척도 범위를 확인하세요.</p>` : ""}
    <div class="row gap wrap">
      <label class="small">보기 세트로 채우기 <select class="in" data-change="labelset" data-key="${key}">${option("", "선택…", true)}${LABEL_SETS.map(s => option(s.id, s.name, false)).join("")}</select></label>
      <button class="btn sm" data-act="labelmap-reverse" data-key="${key}">점수 뒤집기</button>
      <button class="btn sm" data-act="labelmap-apply-all" data-key="${key}">같은 보기를 쓰는 문항에 모두 적용</button>
      <button class="btn sm ghost" data-act="toggle-labels" data-key="${key}">닫기</button>
    </div></div></td></tr>`;
}

/** 역할을 척도로 바꿀 때 문자 응답 자동 매핑 시도 */
function autoMapLabels(c) {
  const texts = [...textResponses(c).keys()];
  if (!texts.length) return;
  const vals = rawColumn(state.dataset, c).filter(v => !isBlank(v) && !IS_NUM(String(v).trim()));
  const ls = matchLabelSet(vals, 0.5);
  if (ls) { c.labelMap = { ...(c.labelMap || {}), ...Object.fromEntries(ls.map) }; c.scale = { min: ls.set.min, max: ls.set.max }; c.labelSetId = ls.set.id; }
  if (texts.some(t => (c.labelMap || {})[t] === undefined)) expanded = c.key;
}

function sampleValues(col) {
  const rows = state.dataset.sheets[col.sheet].rows;
  const seen = [];
  for (const r of rows) {
    const v = r[col.index];
    if (v === null || v === undefined || v === "") continue;
    const s = v instanceof Date ? v.toISOString().slice(0, 10) : String(v);
    if (!seen.includes(s)) seen.push(s);
    if (seen.length >= 4) break;
  }
  return seen.map(s => (col.pii ? maskPII(s).replace(/[가-힣]/g, "○") : s)).map(s => (s.length > 18 ? s.slice(0, 17) + "…" : s)).join(" · ");
}

export function render() {
  const cb = state.codebook, r = compute();
  const sv = r.survey;
  const domainName = id => cb.domains.find(d => d.id === id)?.name || "";
  const multiSheet = cb.responseSheets.length > 1;
  const idCandidates = si => cb.columns.filter(c => c.sheet === si && ["id", "ignore", "demographic", "numeric"].includes(c.role));
  const m = sv.matching;

  const unmappedCols = [];
  const colRows = cb.columns.map(c => {
    const numeric = ["likert", "nps", "numeric"].includes(c.role);
    const conf = c.detected?.confidence ?? 1;
    const scaled = ["likert", "nps"].includes(c.role);
    const unm = scaled ? unmappedValues(c, rawColumn(state.dataset, c)) : [];
    const nUnm = unm.reduce((s, u) => s + u.n, 0);
    if (nUnm) unmappedCols.push({ c, n: nUnm });
    const labelBtn = scaled ? `<div><button class="btn sm ${nUnm ? "" : "ghost"}" data-act="toggle-labels" data-key="${esc(c.key)}">보기 점수${nUnm ? ` <span class="badge bad">미변환 ${nUnm}</span>` : c.labelMap ? ` <span class="badge ok">문구 ${Object.keys(c.labelMap).length}</span>` : ""}</button>${c.labelAmbiguous ? `<div class="small warn-text">4점/5점 확인</div>` : ""}</div>` : "";
    return (`<tr class="${c.role === "ignore" ? "dim" : ""}">
      <td class="small muted">${multiSheet ? esc(cb.sheets[c.sheet].name) + "<br>" : ""}${c.index + 1}</td>
      <td class="hdr" title="${esc(c.header)}">${esc(c.header)}<div class="small muted">${esc(sampleValues(c))}</div></td>
      <td><input class="in" value="${esc(c.label)}" data-change="col" data-key="${esc(c.key)}" data-field="label"></td>
      <td><select class="in" data-change="col" data-key="${esc(c.key)}" data-field="role">${Object.entries(ROLES).map(([k, v]) => option(k, v, c.role === k)).join("")}</select>
        ${conf < 0.7 && !c.labelAmbiguous ? `<div class="small warn-text" title="${esc(c.detected.reason)}">판별 불확실</div>` : ""}${c.pii ? `<div class="small warn-text">개인정보 추정</div>` : ""}${labelBtn}</td>
      <td class="nowrap">${numeric ? `<input class="in num" type="number" value="${c.scale?.min ?? ""}" data-change="col" data-key="${esc(c.key)}" data-field="min">~<input class="in num" type="number" value="${c.scale?.max ?? ""}" data-change="col" data-key="${esc(c.key)}" data-field="max">` : ""}</td>
      <td class="c">${c.role === "likert" ? `<input type="checkbox" ${c.reverse ? "checked" : ""} data-change="col" data-key="${esc(c.key)}" data-field="reverse">` : ""}</td>
      <td>${c.role === "likert" ? `<input class="in" list="domainList" value="${esc(domainName(c.domain))}" placeholder="(없음)" data-change="col" data-key="${esc(c.key)}" data-field="domain">` : ""}</td>
      <td>${numeric ? `<select class="in" data-change="col" data-key="${esc(c.key)}" data-field="time">${option("", "-", !c.time)}${option("pre", "사전", c.time === "pre")}${option("post", "사후", c.time === "post")}</select>` : ""}</td>
      <td class="c">${c.role === "likert" && c.time !== "pre" ? `<input type="checkbox" ${c.isOverall ? "checked" : ""} data-change="col" data-key="${esc(c.key)}" data-field="isOverall">` : ""}</td>
    </tr>`) + (scaled && expanded === c.key ? labelPanel(c, unm) : "");
  }).join("");
  const unmappedWarn = unmappedCols.length ? `<li>${levelBadge("error")} 점수로 바뀌지 않은 응답이 있는 문항 ${unmappedCols.length}개: ${unmappedCols.slice(0, 4).map(u => `${esc(u.c.label)}(${u.n}건)`).join(", ")}${unmappedCols.length > 4 ? " 등" : ""} — 아래 표의 <b>보기 점수</b>에서 문구별 점수를 지정하세요(지정 전에는 무응답으로 처리).</li>` : "";

  return `
  <section class="card">
    <div class="row between wrap">
      <div><h2>데이터 설정</h2><p class="muted">자동 판별 결과를 확인하고 필요한 부분만 고치세요. 변경 사항은 분석·보고서에 바로 반영됩니다.</p></div>
      <div class="row gap"><button class="btn" data-act="goto" data-to="business">다음: 성과지표(선택) →</button><button class="btn ghost" data-act="goto" data-to="dash">건너뛰고 분석 결과 보기</button></div>
    </div>
    <div class="facts">
      <div><span>파일</span><b>${esc(state.dataset.fileName)}</b></div>
      <div><span>시트</span><b>${cb.sheets.map(s => `${esc(s.name)}(${SHEET_ROLE[s.role] || s.role})`).join(", ")}</b></div>
      <div><span>분석 응답자</span><b>${sv.n}명</b></div>
      <div><span>조사 설계</span><select class="in" data-change="design">${Object.entries(DESIGN_LABELS).map(([k, v]) => option(k, v, cb.design === k)).join("")}</select></div>
    </div>
    ${r.codebookWarnings.length || unmappedWarn ? `<ul class="warnings">${unmappedWarn}${r.codebookWarnings.map(w => `<li>${levelBadge(w.level)} ${esc(w.msg)}</li>`).join("")}</ul>` : ""}
  </section>

  ${cb.design === "prepost-sheets" ? `
  <section class="card">
    <h2>사전·사후 응답자 연결</h2>
    <div class="row gap wrap">
      ${cb.responseSheets.map((si, i) => `<label class="field">${i === 0 ? "사전" : "사후"} 시트 ID 열
        <select class="in" data-change="idkey" data-i="${i}">${option("", "(선택)", !cb.pairing.idKeys[i])}${idCandidates(si).map(c => option(c.key, c.label, cb.pairing.idKeys[i] === c.key)).join("")}</select></label>`).join("")}
    </div>
    ${m ? `<div class="facts">
      <div><span>매칭</span><b class="ok-text">${m.pairs.length}명</b></div>
      <div><span>사전만 응답</span><b>${m.preOnly.length}명</b></div>
      <div><span>사후만 응답</span><b>${m.postOnly.length}명</b></div>
      <div><span>중복 ID</span><b>${m.dupPre + m.dupPost}건</b></div>
    </div>
    <p class="small muted">매칭 기준: ${esc(m.keyDesc)} (공백·하이픈·대소문자 차이는 자동 무시)</p>
    ${m.candidates.length ? `<h3>확인이 필요한 유사 ID (${m.candidates.length}건)</h3><table class="tbl"><tr><th>사전 행</th><th>사후 행</th><th>이유</th><th></th></tr>${m.candidates.slice(0, 30).map(cd => `<tr><td>${cd.pre + 1}</td><td>${cd.post + 1}</td><td>${esc(cd.reason)}</td><td><button class="btn sm" data-act="confirm-match" data-pre="${cd.pre}" data-post="${cd.post}">같은 사람</button></td></tr>`).join("")}</table>` : ""}` : ""}
  </section>` : ""}

  <section class="card">
    <h2>자료 점검</h2>
    <label class="check"><input type="checkbox" ${state.excludeStraight ? "checked" : ""} data-change="exclude-straight">
      모든 척도 문항에 같은 값으로 응답한 사례(불성실 응답 의심) <b>${r.straight}명</b> 분석에서 제외</label>
  </section>

  <section class="card">
    <div class="row between wrap"><h2>문항(열) 설정</h2>
      <span class="small muted">역할: 척도 문항=리커트, 응답자 특성=집단 비교 기준, 복수응답=쉼표 구분 선택형 · 영역: 같은 이름끼리 묶어 영역 점수 계산</span></div>
    <datalist id="domainList">${cb.domains.map(d => `<option value="${esc(d.name)}">`).join("")}</datalist>
    <div class="tblwrap"><table class="tbl setup">
      <thead><tr><th>#</th><th>원래 열 이름 · 응답 예</th><th>표시 이름</th><th>역할</th><th>척도 범위</th><th>역문항</th><th>영역</th><th>시점</th><th>전반 만족</th></tr></thead>
      <tbody>${colRows}</tbody>
    </table></div>
    <div class="row end gap"><button class="btn" data-act="goto" data-to="business">다음: 성과지표(선택) →</button></div>
  </section>`;
}

const colByKey = key => state.codebook.columns.find(x => x.key === key);

export const actions = {
  "toggle-labels": el => { expanded = expanded === el.dataset.key ? null : el.dataset.key; refresh(); },
  labelmap: el => {
    const c = colByKey(el.dataset.key); if (!c) return;
    const raw = el.dataset.raw;
    c.labelMap = { ...(c.labelMap || {}) };
    if (el.value === "") delete c.labelMap[raw];
    else { const v = Number(el.value); if (Number.isFinite(v)) c.labelMap[raw] = v; }
    c.labelAmbiguous = false;
    invalidate(); refresh();
  },
  labelset: el => {
    const c = colByKey(el.dataset.key), set = LABEL_SETS.find(s => s.id === el.value);
    if (!c || !set) return;
    const texts = [...textResponses(c).keys()];
    const m = mapWithSet(texts, set);
    c.labelMap = { ...(c.labelMap || {}), ...Object.fromEntries(m) };
    c.scale = { min: set.min, max: set.max }; c.labelSetId = set.id; c.labelAmbiguous = false;
    toast(`${set.name}: 문구 ${texts.length}개 중 ${m.size}개 자동 지정${m.size < texts.length ? " — 나머지는 직접 입력하세요" : ""}`, m.size ? "ok" : "bad");
    invalidate(); refresh();
  },
  "labelmap-reverse": el => {
    const c = colByKey(el.dataset.key); if (!c?.labelMap) return;
    const { min, max } = c.scale || { min: 1, max: 5 };
    c.labelMap = Object.fromEntries(Object.entries(c.labelMap).map(([k, v]) => [k, min + max - v]));
    invalidate(); refresh();
  },
  "labelmap-apply-all": el => {
    const src = colByKey(el.dataset.key); if (!src?.labelMap) return;
    const keys = new Set(Object.keys(src.labelMap));
    let n = 0;
    state.codebook.columns.forEach(c => {
      if (c === src || ["id", "timestamp"].includes(c.role)) return;
      const texts = [...textResponses(c).keys()];
      if (!texts.length || !texts.every(t => keys.has(t))) return;
      c.role = src.role === "nps" ? "nps" : "likert";
      c.labelMap = Object.fromEntries(texts.map(t => [t, src.labelMap[t]]));
      c.scale = { ...src.scale }; c.labelSetId = src.labelSetId || null; c.labelAmbiguous = false;
      n++;
    });
    toast(n ? `같은 보기를 쓰는 문항 ${n}개에 적용했습니다` : "같은 보기를 쓰는 다른 문항이 없습니다", n ? "ok" : "info");
    invalidate(); refresh();
  },
  design: el => { state.codebook.design = el.value; invalidate(); refresh(); },
  "exclude-straight": el => { state.excludeStraight = el.checked; invalidate(); refresh(); },
  idkey: el => { state.codebook.pairing.idKeys[+el.dataset.i] = el.value || null; invalidate(); refresh(); },
  "confirm-match": el => { state.codebook.pairing.confirmed[+el.dataset.pre] = +el.dataset.post; invalidate(); toast("매칭을 확정했습니다", "ok"); refresh(); },
  col: el => {
    const cb = state.codebook;
    const c = cb.columns.find(x => x.key === el.dataset.key);
    if (!c) return;
    const f = el.dataset.field;
    if (f === "label") c.label = el.value.trim() || c.header;
    else if (f === "role") {
      c.role = el.value;
      if (["likert", "nps"].includes(c.role) && !c.scale) c.scale = c.role === "nps" ? { min: 0, max: 10 } : { min: 1, max: 5 };
      if (c.role === "likert") autoMapLabels(c);
      if (c.role === "multi" && !c.options) c.options = [];
    } else if (f === "min" || f === "max") {
      const v = Number(el.value);
      c.scale = { ...(c.scale || { min: 1, max: 5 }), [f]: Number.isFinite(v) ? v : c.scale?.[f] };
    } else if (f === "reverse" || f === "isOverall") c[f] = el.checked;
    else if (f === "domain") {
      const name = el.value.trim();
      if (!name) c.domain = null;
      else {
        let d = cb.domains.find(x => x.name === name);
        if (!d) { d = { id: `D${cb.domains.reduce((mx, x) => Math.max(mx, +x.id.slice(1) || 0), 0) + 1}`, name }; cb.domains.push(d); }
        c.domain = d.id;
      }
      cb.domains = cb.domains.filter(d => cb.columns.some(x => x.domain === d.id));
    } else if (f === "time") {
      c.time = el.value || null;
      c.pairKey = c.time ? (cb.design === "prepost-sheets" ? normKey(c.header) : normKey(c.label)) : null;
      if (c.time && cb.design === "single") cb.design = "prepost-wide";
    }
    invalidate(); refresh();
  },
};

export { go };
