// ② 데이터 설정 화면: 설계·열 역할·척도·역문항·영역·사전사후 짝·매칭·불성실응답
import { state, compute, invalidate, chooseDataSheet } from "../store.js";
import { ROLES, normKey } from "../../model/detect.js";
import { DESIGN_LABELS, rawColumn, dataSheetCandidates } from "../../model/codebook.js";
import { LABEL_SETS, matchLabelSet, mapWithSet } from "../../model/label-sets.js";
import { unmappedValues } from "../../model/recode.js";
import { YEAR_SCHEMES, DEFAULT_YEAR_SCHEME, REF_YEAR, yearToBucket } from "../../model/year-bucket.js";
import { maskPII, isBlank } from "../../core/util.js";
import { esc, option, levelBadge, toast, busy, busyDone, nextFrame } from "../util.js";
import { refresh, go } from "../router.js";
import { scoreBasisPanel, scoreBasisActions } from "../score-basis.js";
import { icon } from "../icons.js";

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
  return `<tr class="labelrow"><td colspan="10"><div class="labelpanel">
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

function yearBucketPanel(c) {
  const kind = c.detected.yearKind;
  const schemes = YEAR_SCHEMES[kind];
  const refYear = c.yearRefYear || REF_YEAR;
  const active = c.yearScheme ?? DEFAULT_YEAR_SCHEME[kind];
  const raw = rawColumn(state.dataset, c);
  const counts = new Map();
  raw.forEach(v => {
    if (isBlank(v)) return;
    const label = yearToBucket(v, kind, active, refYear);
    if (label !== null) counts.set(label, (counts.get(label) || 0) + 1);
  });
  const groupList = [...counts.entries()].sort((a, b) => String(a[0]).localeCompare(String(b[0]), "ko"));
  const activeObj = schemes.find(s => s.id === active);
  const key = esc(c.key);
  return `<tr class="labelrow"><td colspan="10"><div class="labelpanel">
    <div class="row between wrap"><b>‘${esc(c.label)}’ 연도 → 구간 설정</b>
      <span class="small muted">${kind === "birth" ? "출생연도를 연령대로 바꿔 응답자 특성별 비교에 사용합니다" : "활동 시작연도를 년차로 바꿔 응답자 특성별 비교에 사용합니다"}</span></div>
    <div class="row gap wrap">
      <label class="small">구간 방식 <select class="in" data-change="yearscheme" data-key="${key}">${schemes.map(s => option(s.id, s.name, active === s.id)).join("")}</select></label>
      <label class="small">기준 연도 <input class="in num" type="number" style="width:5.5em" value="${refYear}" data-change="yearref" data-key="${key}"></label>
      <button class="btn sm ghost" data-act="toggle-yearbucket" data-key="${key}">닫기</button>
    </div>
    <table class="tbl mini"><tr><th>구간</th><th class="c">인원</th></tr>${groupList.map(([lb, n]) =>
      `<tr><td>${esc(lb)}</td><td class="c">${n}${n < 10 ? ` <span class="small warn-text">10명 미만</span>` : ""}</td></tr>`).join("")}
    </table>
    ${groupList.length > 12 ? `<p class="small bad-text">구간이 ${groupList.length}개로 12개를 넘어 이 방식으로는 특성별 비교에서 제외됩니다. 다른 구간 방식을 선택하세요.</p>` : ""}
    <p class="small muted">${activeObj?.law
      ? "※ 청소년기본법 제3조(9~24세)·청년기본법 제3조(19~34세) 기준을 인용했습니다. 두 법의 적용 연령이 19~24세에서 겹치므로, 이 앱에서는 24세 이하=청소년, 25~34세=청년으로 겹치지 않게 재구성했습니다."
      : "※ 이 구간은 법적·통계적 표준이 아니라 이 앱이 정한 편집 기본값입니다. 필요하면 다른 방식을 선택하세요."}</p>
  </div></td></tr>`;
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

const shallowEq = (a, b) => {
  if (a === b) return true;
  if (!a || !b) return false;
  const ak = Object.keys(a), bk = Object.keys(b);
  return ak.length === bk.length && ak.every(k => a[k] === b[k]);
};

/** 자동 판별 값(c.auto)에서 손으로 고친 게 있는지 — 되돌리기 버튼을 보일지 결정 */
function colEdited(cb, c) {
  const a = c.auto;
  if (!a) return false;
  const domainName = c.domain ? cb.domains.find(d => d.id === c.domain)?.name ?? null : null;
  return c.label !== a.label || c.role !== a.role || c.reverse !== a.reverse || c.time !== a.time || c.isOverall !== a.isOverall
    || c.labelSetId !== a.labelSetId || domainName !== a.domainName || c.yearScheme !== a.yearScheme || c.yearRefYear !== a.yearRefYear
    || !shallowEq(c.scale, a.scale) || !shallowEq(c.labelMap, a.labelMap);
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
  const sheetCandidates = dataSheetCandidates(state.dataset);
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
    const labelBtn = scaled ? `<div><button class="btn sm ${nUnm ? "" : "ghost"}" data-act="toggle-labels" data-key="${esc(c.key)}">보기 점수${nUnm ? ` <span class="badge bad">미변환 ${nUnm}</span>` : c.labelMap ? ` <span class="badge info">문구 ${Object.keys(c.labelMap).length}</span>` : ""}</button>${c.labelAmbiguous ? `<div class="small warn-text">4점/5점 확인</div>` : ""}</div>` : "";
    const yearKind = c.role === "demographic" ? c.detected?.yearKind : null;
    const yScheme = yearKind ? (c.yearScheme ?? DEFAULT_YEAR_SCHEME[yearKind]) : null;
    const ySchemeObj = yearKind ? YEAR_SCHEMES[yearKind].find(s => s.id === yScheme) : null;
    const yearBtn = yearKind
      ? `<div><button class="btn sm ${yScheme !== "raw" ? "" : "ghost"}" data-act="toggle-yearbucket" data-key="${esc(c.key)}">연도 구간${yScheme !== "raw" ? ` <span class="badge info">${esc((ySchemeObj?.name || "").split("(")[0])}</span>` : ` <span class="badge">구간 없음</span>`}</button></div>`
      : "";
    return (`<tr class="${c.role === "ignore" ? "dim" : ""}">
      <td class="small muted">${multiSheet ? esc(cb.sheets[c.sheet].name) + "<br>" : ""}${c.index + 1}</td>
      <td class="hdr" title="${esc(c.header)}">${esc(c.header)}<div class="small muted">${esc(sampleValues(c))}</div></td>
      <td><input class="in" value="${esc(c.label)}" data-change="col" data-key="${esc(c.key)}" data-field="label" aria-label="'${esc(c.header)}' 열의 표시 이름"></td>
      <td><select class="in" data-change="col" data-key="${esc(c.key)}" data-field="role" aria-label="'${esc(c.label)}' 열의 역할">${Object.entries(ROLES).map(([k, v]) => option(k, v, c.role === k)).join("")}</select>
        ${conf < 0.7 && !c.labelAmbiguous ? `<div class="small warn-text" title="${esc(c.detected.reason)}">판별 불확실</div>` : ""}${c.pii ? `<div class="small warn-text">개인정보 추정</div>` : ""}${labelBtn}${yearBtn}</td>
      <td class="nowrap">${numeric ? `<input class="in num" type="number" value="${c.scale?.min ?? ""}" data-change="col" data-key="${esc(c.key)}" data-field="min" aria-label="'${esc(c.label)}' 척도 최솟값">~<input class="in num" type="number" value="${c.scale?.max ?? ""}" data-change="col" data-key="${esc(c.key)}" data-field="max" aria-label="'${esc(c.label)}' 척도 최댓값">` : ""}</td>
      <td class="c">${c.role === "likert" ? `<input type="checkbox" ${c.reverse ? "checked" : ""} data-change="col" data-key="${esc(c.key)}" data-field="reverse" aria-label="'${esc(c.label)}' 역문항으로 처리">` : ""}</td>
      <td>${c.role === "likert" ? `<input class="in" list="domainList" value="${esc(domainName(c.domain))}" placeholder="(없음)" data-change="col" data-key="${esc(c.key)}" data-field="domain" aria-label="'${esc(c.label)}' 영역">` : ""}</td>
      <td>${numeric ? `<select class="in" data-change="col" data-key="${esc(c.key)}" data-field="time" aria-label="'${esc(c.label)}' 시점">${option("", "-", !c.time)}${option("pre", "사전", c.time === "pre")}${option("post", "사후", c.time === "post")}</select>` : ""}</td>
      <td class="c">${c.role === "likert" && c.time !== "pre" ? `<input type="checkbox" ${c.isOverall ? "checked" : ""} data-change="col" data-key="${esc(c.key)}" data-field="isOverall" aria-label="'${esc(c.label)}'을(를) 전반 만족 문항으로 표시">` : ""}</td>
      <td class="c">${colEdited(cb, c) ? `<button class="icon-btn sm" data-act="col-reset" data-key="${esc(c.key)}" title="자동 판별 값으로 되돌리기" aria-label="'${esc(c.label)}' 자동 판별 값으로 되돌리기">${icon("undo", 14)}</button>` : ""}</td>
    </tr>`) + (scaled && expanded === c.key ? labelPanel(c, unm) : "") + (yearKind && expanded === c.key ? yearBucketPanel(c) : "");
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

  ${sheetCandidates.length > 1 ? `<section class="card">
    <h2>응답 시트 선택</h2>
    <p class="muted">이 파일에 설문 응답으로 보이는 시트가 여러 개 있습니다. 지금은 한 번에 한 시트만 분석하므로, 분석할 시트를 고르세요.</p>
    <div class="row gap wrap" role="radiogroup" aria-label="응답 시트">
      ${sheetCandidates.map(c => `<label class="check"><input type="radio" name="data-sheet" value="${c.index}" ${cb.responseSheets[0] === c.index ? "checked" : ""} data-change="data-sheet"> ${esc(c.name)} <span class="small muted">(${c.nRows}행)</span></label>`).join("")}
    </div>
  </section>` : ""}

  ${r.analysis.items.length ? scoreBasisPanel(r.analysis.items, { compact: true }) : ""}

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
      <span class="small muted">역할: 척도 문항=리커트, 응답자 특성=집단 비교 기준, 복수응답=쉼표 구분 선택형 · 영역: 같은 이름끼리 묶어 영역 점수 계산 · 출생연도·활동 시작연도 등 연도 열은 연령대·년차 구간으로 바꿔 특성 비교에 사용합니다('연도 구간' 버튼에서 방식 변경)</span></div>
    <datalist id="domainList">${cb.domains.map(d => `<option value="${esc(d.name)}">`).join("")}</datalist>
    <div class="tblwrap"><table class="tbl setup">
      <thead><tr><th>#</th><th>원래 열 이름 · 응답 예</th><th>표시 이름</th><th>역할</th><th>척도 범위</th><th>역문항</th><th>영역</th><th>시점</th><th>전반 만족</th><th></th></tr></thead>
      <tbody>${colRows}</tbody>
    </table></div>
    <div class="row end gap"><button class="btn" data-act="goto" data-to="business">다음: 성과지표(선택) →</button></div>
  </section>`;
}

const colByKey = key => state.codebook.columns.find(x => x.key === key);

export const actions = {
  ...scoreBasisActions,
  "toggle-labels": el => { expanded = expanded === el.dataset.key ? null : el.dataset.key; refresh(); },
  "toggle-yearbucket": el => { expanded = expanded === el.dataset.key ? null : el.dataset.key; refresh(); },
  yearscheme: el => { const c = colByKey(el.dataset.key); if (!c) return; c.yearScheme = el.value; invalidate(); refresh(); },
  yearref: el => {
    const c = colByKey(el.dataset.key); if (!c) return;
    const v = Number(el.value);
    c.yearRefYear = Number.isFinite(v) && v > 1900 ? v : null;
    invalidate(); refresh();
  },
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
  "data-sheet": async el => {
    const idx = +el.value;
    if (idx === state.codebook.responseSheets[0]) return;
    const name = state.dataset.sheets[idx]?.name || "";
    busy(true, `'${name}' 시트로 문항을 다시 판별하는 중…`);
    await nextFrame();
    chooseDataSheet(idx);
    try { compute(); }
    catch (e) { console.error(e); busy(false); refresh(); toast(`시트를 바꾸지 못했습니다: ${e.message}`, "bad", 6000); return; }
    busy(false);
    refresh();
    busyDone(`'${name}' 시트로 다시 판별했습니다.`);
  },
  "exclude-straight": async el => {
    const checked = el.checked;
    busy(true, checked ? "불성실 응답 의심 사례를 제외하고\n분석을 다시 계산하는 중…" : "제외했던 사례를 다시 포함하고\n분석을 다시 계산하는 중…");
    await nextFrame();
    state.excludeStraight = checked;
    invalidate();
    let r;
    try { r = compute(); }
    catch (e) {
      console.error(e);
      state.excludeStraight = !checked; invalidate();
      busy(false); refresh();
      toast(`처리하지 못했습니다: ${e.message}`, "bad", 6000);
      return;
    }
    busy(false);
    refresh();
    busyDone(checked ? `불성실 응답 의심 사례 ${r?.excludedCount ?? ""}명을 제외했습니다.` : "제외했던 사례를 다시 포함했습니다.");
  },
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
      if (c.role === "demographic" && c.detected?.yearKind && c.yearScheme === undefined) c.yearScheme = DEFAULT_YEAR_SCHEME[c.detected.yearKind];
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
  "col-reset": el => {
    const cb = state.codebook;
    const c = colByKey(el.dataset.key);
    if (!c?.auto) return;
    const a = c.auto;
    c.label = a.label; c.role = a.role; c.scale = a.scale ? { ...a.scale } : null;
    c.labelMap = a.labelMap ? { ...a.labelMap } : null; c.labelSetId = a.labelSetId; c.labelAmbiguous = a.labelAmbiguous;
    c.reverse = a.reverse; c.time = a.time; c.isOverall = a.isOverall;
    c.yearScheme = a.yearScheme; c.yearRefYear = a.yearRefYear;
    if (a.domainName) {
      let d = cb.domains.find(x => x.name === a.domainName);
      if (!d) { d = { id: `D${cb.domains.reduce((mx, x) => Math.max(mx, +x.id.slice(1) || 0), 0) + 1}`, name: a.domainName }; cb.domains.push(d); }
      c.domain = d.id;
    } else c.domain = null;
    cb.domains = cb.domains.filter(d => cb.columns.some(x => x.domain === d.id));
    c.pairKey = c.time ? (cb.design === "prepost-sheets" ? normKey(c.header) : normKey(c.label)) : null;
    toast(`'${a.label}' 열을 자동 판별 값으로 되돌렸습니다`, "ok");
    invalidate(); refresh();
  },
};

export { go };
