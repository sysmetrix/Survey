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
import { isFeatureOn, isAdminPreview } from "../../admin/flags-client.js";

const SHEET_ROLE = { data: "응답", pre: "사전 응답", post: "사후 응답", codebook: "문항정보", business: "사업정보", kpi: "성과지표", guide: "안내" };
const IS_NUM = s => /^[-+]?\d+(\.\d+)?$/.test(s);
let expanded = null; // 보기 점수 패널이 열린 열
let expandedPop = null; // 모집단 비율 패널이 열린 열(관리자 미리보기 기능)
let columnFilter = "all";
let selectedColumnKey = "";
let mappingMode = "quick";

/** 전체 표에서 설정을 열 때, 새로 그린 표의 선택 행을 본문 중앙에 유지한다.
 * 페이지 자체를 이동시키지 않고 표의 독립 스크롤 영역만 움직인다. */
function centerSelectedTableRow(key) {
  if (mappingMode !== "table" || typeof document === "undefined") return;
  const schedule = typeof requestAnimationFrame === "function" ? requestAnimationFrame : fn => setTimeout(fn, 0);
  schedule(() => schedule(() => {
    const wrap = document.querySelector(".setup-table-wrap");
    const button = [...(wrap?.querySelectorAll('[data-act="column-select"]') || [])]
      .find(el => el.dataset.key === key);
    const row = button?.closest("tr");
    if (!wrap || !row) return;
    const wrapBox = wrap.getBoundingClientRect();
    const rowBox = row.getBoundingClientRect();
    const target = wrap.scrollTop + rowBox.top - wrapBox.top - (wrap.clientHeight - rowBox.height) / 2;
    wrap.scrollTop = Math.max(0, Math.min(target, wrap.scrollHeight - wrap.clientHeight));
  }));
}

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
  return `<section class="mapping-detail-panel labelpanel">
    <div class="row between wrap"><b>‘${esc(c.label)}’ 보기별 점수</b><span class="small muted">척도 ${min}~${max}점 · 숫자로 입력된 응답은 그대로 사용 · 빈칸 = 무응답 처리</span></div>
    ${entries.length ? `<table class="tbl mini"><tr><th>응답 문구</th><th class="c">응답 수</th><th>점수</th></tr>${entries.map(([s, n]) => `<tr class="${map[s] === undefined ? "unmapped" : ""}"><td>${esc(s)}</td><td class="c">${n}</td><td><input class="in num" type="number" min="${min}" max="${max}" step="1" value="${map[s] ?? ""}" placeholder="?" data-change="labelmap" data-key="${key}" data-raw="${esc(s)}"></td></tr>`).join("")}</table>` : `<p class="small muted">문자 응답이 없습니다(모두 숫자).</p>`}
    ${entries.some(([s]) => map[s] === undefined) ? `<p class="small warn-text">미변환 응답이 있습니다. 각 문구에 점수를 지정하면 분석에 반영됩니다.</p>` : ""}
    ${range.length ? `<p class="small bad-text">척도 범위(${min}~${max}) 밖 값: ${range.map(u => `${esc(u.value)}(${u.n}건)`).join(", ")} — 척도 범위를 확인하세요.</p>` : ""}
    <div class="row gap wrap">
      <label class="small">보기 세트로 채우기 <select class="in" data-change="labelset" data-key="${key}">${option("", "선택…", true)}${LABEL_SETS.map(s => option(s.id, s.name, false)).join("")}</select></label>
      <button class="btn sm" data-act="labelmap-reverse" data-key="${key}">점수 뒤집기</button>
      <button class="btn sm" data-act="labelmap-apply-all" data-key="${key}">같은 보기를 쓰는 문항에 모두 적용</button>
      <button class="btn sm ghost" data-act="toggle-labels" data-key="${key}">닫기</button>
    </div></section>`;
}

/** 모집단 비율(선택) 패널 — 관리자 전용 미리보기 기능(응답자 대표성 체크) */
function popPanel(c, sv) {
  const vals = sv.values(c.key).filter(v => v !== null).map(String);
  const counts = new Map();
  vals.forEach(v => counts.set(v, (counts.get(v) || 0) + 1));
  const n = vals.length;
  const pop = c.popPct || {};
  const names = [...new Set([...counts.keys(), ...Object.keys(pop)])];
  const key = esc(c.key);
  return `<section class="mapping-detail-panel labelpanel">
    <div class="row between wrap"><b>‘${esc(c.label)}’ 모집단 비율(선택)</b><span class="small muted">전체 사업 대상자 중 이 항목의 비율을 알고 있으면 입력하세요(예: 대상자 성비). 입력한 항목만 응답자 분포와 비교해 자료 품질 화면에 표시합니다.</span></div>
    <table class="tbl mini"><tr><th>구분</th><th class="c">응답자 수</th><th class="c">응답자 비율</th><th>모집단 비율(%)</th></tr>${names.map(nm => {
      const obs = counts.get(nm) || 0;
      const observedPct = n ? (obs / n * 100).toFixed(1) : "-";
      return `<tr><td>${esc(nm)}</td><td class="c">${obs}</td><td class="c">${observedPct}</td><td><input class="in num" type="number" min="0" max="100" step="0.1" value="${pop[nm] ?? ""}" placeholder="?" data-change="poppct" data-key="${key}" data-cat="${esc(nm)}"></td></tr>`;
    }).join("")}</table>
    <div class="row gap wrap"><button class="btn sm ghost" data-act="toggle-poppanel" data-key="${key}">닫기</button></div>
  </section>`;
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
  return `<section class="mapping-detail-panel labelpanel">
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
    <p class="small muted">${activeObj?.description ? `${activeObj.description}. 출생연도만 있으면 생일 전후를 알 수 없어 근사 만 나이로 분류합니다.` : activeObj?.law
      ? "※ 청소년기본법 제3조(9~24세)·청년기본법 제3조(19~34세) 기준을 인용했습니다. 두 법의 적용 연령이 19~24세에서 겹치므로, 이 앱에서는 24세 이하=청소년, 25~34세=청년으로 겹치지 않게 재구성했습니다."
      : "※ 이 구간은 법적·통계적 표준이 아니라 이 앱이 정한 편집 기본값입니다. 필요하면 다른 방식을 선택하세요."}</p>
  </section>`;
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
  const hasSeparateSheets = cb.responseSheets.length === 2 && cb.responseSheets.every(si => Array.isArray(state.dataset.sheets[si]?.rows));
  const designGuides = {
    single: "한 번 받은 설문 결과만 분석합니다.",
    "prepost-wide": "같은 사람의 사전·사후 응답이 한 시트에 함께 있을 때 선택합니다.",
    "prepost-sheets": "한 파일 안의 사전·사후 응답 시트를 ID로 연결해 변화량을 봅니다.",
    retrospective: "사후 설문에서 참여 전과 현재를 함께 물었을 때 선택합니다.",
  };
  const designChoices = Object.entries(DESIGN_LABELS).map(([key, label]) => {
    const unavailable = key === "prepost-sheets" && !hasSeparateSheets;
    const help = unavailable ? "현재 파일에는 응답 시트가 1개입니다. 사전·사후 응답 시트 2개가 있는 파일에서 사용할 수 있습니다." : designGuides[key];
    return `<label class="design-choice${cb.design === key ? " on" : ""}${unavailable ? " locked" : ""}"><input type="radio" name="survey-design" value="${key}" ${cb.design === key ? "checked" : ""} ${unavailable ? "disabled" : ""} data-change="design"><span class="design-choice-copy"><b>${esc(label)}</b><small>${help}</small></span>${unavailable ? '<span class="badge muted">준비 필요</span>' : cb.design === key ? '<span class="badge info">선택됨</span>' : ""}</label>`;
  }).join("");

  const unmappedCols = [];
  const renderTableRow = c => {
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
    const popOn = c.role === "demographic" && isFeatureOn("respondentRepresentativeness");
    const popCount = c.popPct ? Object.keys(c.popPct).length : 0;
    const popBtn = popOn ? `<div><button class="btn sm ${popCount ? "" : "ghost"}" data-act="toggle-poppanel" data-key="${esc(c.key)}">모집단 비율${popCount ? ` <span class="badge info">${popCount}개</span>` : ""}</button></div>` : "";
    const reviewNotes = [
      conf < .7 && !c.labelAmbiguous ? "자동 판별 확인" : "",
      c.labelAmbiguous ? "4·5점 척도 확인" : "",
      c.pii ? "개인정보 가능성" : "",
      nUnm ? `보기 점수 ${nUnm}건` : "",
    ].filter(Boolean);
    const summary = (() => {
      if (numeric) return [`${c.scale?.min ?? "?"}~${c.scale?.max ?? "?"}점`, c.time === "pre" ? "사전" : c.time === "post" ? "사후" : "시점 없음", c.domain ? domainName(c.domain) : "", c.reverse ? "점수 반대" : "", c.isOverall ? "대표 만족" : ""].filter(Boolean);
      if (c.role === "demographic") return ["대상별 비교에 사용"];
      if (c.role === "id") return ["응답자 연결에 사용"];
      if (c.role === "ignore") return ["분석·보고서에서 제외"];
      return ["점수 계산 없이 분류"];
    })();
    const detail = `<div class="setup-grid-detail-body"><div class="setup-grid-detail-head"><div><b>${esc(c.label || c.header)}</b><span>${reviewNotes.length ? reviewNotes.join(" · ") : "이 문항의 세부 설정을 바로 수정합니다."}</span></div>${colEdited(cb, c) ? `<button class="btn sm ghost" data-act="col-reset" data-key="${esc(c.key)}">${icon("undo", 14)}자동 판별로 되돌리기</button>` : ""}</div><div class="setup-grid-detail-fields"><label class="field">표시 이름<input class="in" value="${esc(c.label)}" data-change="col" data-key="${esc(c.key)}" data-field="label" aria-label="'${esc(c.header)}' 열의 표시 이름"></label>${numeric ? `<label class="field">척도 범위<span class="inline-inputs"><input class="in num" type="number" value="${c.scale?.min ?? ""}" data-change="col" data-key="${esc(c.key)}" data-field="min" aria-label="'${esc(c.label)}' 척도 최솟값"><i>~</i><input class="in num" type="number" value="${c.scale?.max ?? ""}" data-change="col" data-key="${esc(c.key)}" data-field="max" aria-label="'${esc(c.label)}' 척도 최댓값"></span></label><label class="field">측정 시점<select class="in" data-change="col" data-key="${esc(c.key)}" data-field="time" aria-label="'${esc(c.label)}' 시점">${option("", "시점 없음", !c.time)}${option("pre", "사전", c.time === "pre")}${option("post", "사후", c.time === "post")}</select></label>` : ""}${c.role === "likert" ? `<label class="field">같이 묶어 볼 주제 <span class="small muted">(선택)</span><input class="in" list="domainList" value="${esc(domainName(c.domain))}" placeholder="예: 참여 경험" data-change="col" data-key="${esc(c.key)}" data-field="domain" aria-label="'${esc(c.label)}' 같이 묶어 볼 주제"></label><label class="node-switch"><input type="checkbox" ${c.reverse ? "checked" : ""} data-change="col" data-key="${esc(c.key)}" data-field="reverse"><span><b>점수 방향 반대로</b><small>부정 문항일 때만 선택합니다.</small></span></label>${c.time !== "pre" ? `<label class="node-switch"><input type="checkbox" ${c.isOverall ? "checked" : ""} data-change="col" data-key="${esc(c.key)}" data-field="isOverall"><span><b>대표 만족도 문항</b><small>전반 만족도를 보여 줄 문항으로 사용합니다.</small></span></label>` : ""}` : ""}</div><div class="setup-grid-detail-actions">${labelBtn}${yearBtn}${popBtn}</div>${scaled && expanded === c.key ? labelPanel(c, unm) : ""}${yearKind && expanded === c.key ? yearBucketPanel(c) : ""}${popOn && expandedPop === c.key ? popPanel(c, sv) : ""}</div>`;
    return (`<tr class="setup-grid-row ${c.role === "ignore" ? "dim" : ""}">
      <td class="setup-grid-index"><span>${c.index + 1}</span></td>
      <td class="setup-grid-question" title="${esc(c.header)}"><strong>${esc(c.header)}</strong><small>${multiSheet ? esc(cb.sheets[c.sheet].name) + " · " : ""}${esc(sampleValues(c) || "응답 예 없음")}</small></td>
      <td class="setup-grid-role"><select class="in" data-change="col" data-key="${esc(c.key)}" data-field="role" aria-label="'${esc(c.label)}' 열의 역할">${Object.entries(ROLES).map(([k, v]) => option(k, v, c.role === k)).join("")}</select></td>
      <td class="setup-grid-summary"><div>${summary.map(v => `<span>${esc(v)}</span>`).join("")}</div>${reviewNotes.length ? `<small>${esc(reviewNotes.join(" · "))}</small>` : ""}</td>
      <td class="setup-grid-edit"><button class="btn sm ${selectedColumnKey === c.key ? "primary" : ""}" data-act="column-select" data-key="${esc(c.key)}">${selectedColumnKey === c.key ? "설정 중" : "설정"}</button></td>
    </tr>${selectedColumnKey === c.key ? `<tr class="setup-grid-detail"><td colspan="5">${detail}</td></tr>` : ""}`);
  };
  const unmappedWarn = unmappedCols.length ? `<li>${levelBadge("error")} 점수로 바뀌지 않은 응답이 있는 문항 ${unmappedCols.length}개: ${unmappedCols.slice(0, 4).map(u => `${esc(u.c.label)}(${u.n}건)`).join(", ")}${unmappedCols.length > 4 ? " 등" : ""} — 아래 표의 <b>보기 점수</b>에서 문구별 점수를 지정하세요(지정 전에는 무응답으로 처리).</li>` : "";
  const needsReview = c => (c.detected?.confidence ?? 1) < .7 || c.labelAmbiguous || c.pii || (["likert", "nps"].includes(c.role) && unmappedValues(c, rawColumn(state.dataset, c)).length > 0);
  const filters = [["all", "전체"], ["review", "확인 필요"], ["scale", "척도·NPS"], ["profile", "응답자 특성"], ["other", "기타"]];
  const matchesColumn = c => columnFilter === "all"
    || (columnFilter === "review" && needsReview(c))
    || (columnFilter === "scale" && ["likert", "nps"].includes(c.role))
    || (columnFilter === "profile" && c.role === "demographic")
    || (columnFilter === "other" && !["likert", "nps", "demographic"].includes(c.role));
  let visibleColumns = cb.columns.filter(matchesColumn);
  // A filter belongs to the prior dataset/view. Never let that stale state hide
  // the only controls that can recover the question workspace.
  if (!visibleColumns.length && cb.columns.length && columnFilter !== "all") {
    columnFilter = "all";
    selectedColumnKey = "";
    visibleColumns = cb.columns;
  }
  const selectedColumn = visibleColumns.find(c => c.key === selectedColumnKey) || visibleColumns[0] || null;
  const filterCount = id => cb.columns.filter(c => id === "all" || (id === "review" && needsReview(c)) || (id === "scale" && ["likert", "nps"].includes(c.role)) || (id === "profile" && c.role === "demographic") || (id === "other" && !["likert", "nps", "demographic"].includes(c.role))).length;
  const tableRows = visibleColumns.map(renderTableRow).join("");
  const tableWorkspace = `<section class="setup-table-workspace" aria-label="전체 표 편집">
    <div class="setup-workspace-note"><div><b>전체 표 편집</b><span>여러 문항을 비교하며 수정할 때 사용합니다. 필요한 문항만 걸러서, 한 행에서 분석 방식과 결과 반영을 함께 확인하세요.</span></div><span class="badge ${visibleColumns.filter(needsReview).length ? "warn" : "info"}">${visibleColumns.filter(needsReview).length ? `확인 필요 ${visibleColumns.filter(needsReview).length}개` : `${visibleColumns.length}개 문항`}</span></div>
    <div class="column-filter-list setup-table-filter" role="group" aria-label="전체 표 문항 필터">${filters.map(([id, label]) => `<button class="column-filter${columnFilter === id ? " on" : ""}" data-act="column-filter" data-filter="${id}" aria-pressed="${columnFilter === id}">${label}<b>${filterCount(id)}</b></button>`).join("")}</div>
    <div class="tbl-wrap setup-table-wrap"><table class="tbl setup-grid"><thead><tr><th>#</th><th>문항</th><th>분석 역할</th><th>현재 설정</th><th>수정</th></tr></thead><tbody>${tableRows || `<tr><td colspan="5"><div class="empty-inline"><div><b>해당 문항이 없습니다</b><p class="small muted">다른 필터를 선택해 주세요.</p></div></div></td></tr>`}</tbody></table></div>
    <p class="setup-table-help">행은 빠르게 비교하고, <b>설정</b>을 누르면 해당 문항의 모든 옵션이 바로 아래에 펼쳐집니다. ‘같이 묶을 주제’는 같은 주제를 묻는 척도 문항이 2개 이상일 때만 입력하세요.</p>
  </section>`;
  const nodeState = c => needsReview(c) ? "review" : c.role === "ignore" ? "muted" : "ready";
  const nodeBadge = c => needsReview(c) ? "확인 필요" : c.role === "ignore" ? "분석 제외" : "설정됨";
  const mapDestination = c => {
    const parts = [];
    if (c.domain) parts.push(domainName(c.domain));
    if (c.time) parts.push(c.time === "pre" ? "사전" : "사후");
    if (!parts.length && ["likert", "nps", "numeric"].includes(c.role)) parts.push(`${c.scale?.min ?? "?"}~${c.scale?.max ?? "?"}점`);
    return parts.join(" · ") || (c.role === "ignore" ? "분석에 사용하지 않음" : "분석 흐름에 연결");
  };
  const mapLanes = [
    ["measure", "성과·측정", "점수와 변화로 읽는 문항", c => ["likert", "nps", "numeric"].includes(c.role)],
    ["profile", "응답자 특성", "대상별 차이를 보는 문항", c => c.role === "demographic"],
    ["support", "운영·기타", "식별·분류·분석 제외 문항", c => !["likert", "nps", "numeric", "demographic"].includes(c.role)],
  ];
  const questionMap = `<section class="question-map" aria-label="문항 연결 구조">
    <div class="question-map-head"><div><span class="eyebrow">문항 연결 구조</span><h3>문항이 분석에 어떻게 연결되는지 확인하세요</h3></div><span class="small muted">노드를 선택하면 연결 값만 편집합니다.</span></div>
    <div class="column-filter-list question-map-filter" role="group" aria-label="문항 상태 필터">${filters.map(([id, label]) => `<button class="column-filter${columnFilter === id ? " on" : ""}" data-act="column-filter" data-filter="${id}" aria-pressed="${columnFilter === id}">${label}<b>${filterCount(id)}</b></button>`).join("")}</div>
    ${selectedColumn ? `<div class="selected-map-flow" aria-label="선택한 문항의 분석 흐름"><div class="flow-node source"><span>원본 문항</span><b>${esc(selectedColumn.label || selectedColumn.header)}</b></div><span class="flow-link">${icon("right", 16)}</span><div class="flow-node role"><span>분석 역할</span><b>${esc(ROLES[selectedColumn.role] || selectedColumn.role)}</b></div><span class="flow-link">${icon("right", 16)}</span><div class="flow-node target"><span>분석 연결</span><b>${esc(mapDestination(selectedColumn))}</b></div></div>` : `<div class="empty-inline"><div><b>불러온 문항이 없습니다</b><p class="small muted">파일을 다시 불러오면 문항 연결 지도가 표시됩니다.</p></div></div>`}
    <div class="question-map-lanes">${mapLanes.map(([id, title, detail, accepts]) => {
      const cols = visibleColumns.filter(accepts);
      return `<section class="question-map-lane ${id}"><header><span class="map-lane-port"></span><div><b>${title}</b><small>${detail}</small></div><em>${cols.length}</em></header><div class="question-map-nodes">${cols.map(col => `<button class="question-map-node ${nodeState(col)}${selectedColumn?.key === col.key ? " on" : ""}" data-act="column-select" data-key="${esc(col.key)}" aria-pressed="${selectedColumn?.key === col.key}"><span class="map-node-index">${col.index + 1}</span><span class="map-node-copy"><strong>${esc(col.label || col.header)}</strong><small>${esc(ROLES[col.role] || col.role)} ${icon("right", 11)} ${esc(mapDestination(col))}</small></span><span class="map-node-state ${nodeState(col)}"></span></button>`).join("") || `<p class="map-lane-empty">이 분류의 문항이 없습니다.</p>`}</div></section>`;
    }).join("")}</div>
  </section>`;
  let columnWorkspace = selectedColumn ? (() => {
    const c = selectedColumn;
    const numeric = ["likert", "nps", "numeric"].includes(c.role);
    const scaled = ["likert", "nps"].includes(c.role);
    const unm = scaled ? unmappedValues(c, rawColumn(state.dataset, c)) : [];
    const yearKind = c.role === "demographic" ? c.detected?.yearKind : null;
    const yScheme = yearKind ? (c.yearScheme ?? DEFAULT_YEAR_SCHEME[yearKind]) : null;
    const yName = yearKind ? YEAR_SCHEMES[yearKind].find(s => s.id === yScheme)?.name : "";
    const popOn = c.role === "demographic" && isFeatureOn("respondentRepresentativeness");
    return `<div class="column-workspace"><aside class="column-node-list"><div class="column-filter-list" role="group" aria-label="문항 상태 필터">${filters.map(([id, label]) => `<button class="column-filter${columnFilter === id ? " on" : ""}" data-act="column-filter" data-filter="${id}" aria-pressed="${columnFilter === id}">${label}<b>${filterCount(id)}</b></button>`).join("")}</div><div class="column-nodes">${visibleColumns.map((col, i) => `<button class="column-node ${nodeState(col)}${c.key === col.key ? " on" : ""}" data-act="column-select" data-key="${esc(col.key)}" aria-pressed="${c.key === col.key}"><span class="column-node-index">${col.index + 1}</span><span class="column-node-copy"><strong>${esc(col.label || col.header)}</strong><small>${esc(ROLES[col.role] || col.role)} · ${esc(sampleValues(col) || "응답 예 없음")}</small></span><span class="badge ${nodeState(col) === "review" ? "warn" : nodeState(col) === "ready" ? "ok" : "muted"}">${nodeBadge(col)}</span></button>`).join("") || `<div class="empty-inline"><div><b>해당 문항이 없습니다</b><p class="small muted">다른 필터를 선택해 주세요.</p></div></div>`}</div></aside><section class="column-editor" aria-label="선택 문항 설정"><header class="column-editor-head"><div><span class="column-editor-index">${c.index + 1}번 열 · ${esc(c.header)}</span><h3>${esc(c.label || c.header)}</h3></div><div class="row gap"><span class="badge ${nodeState(c) === "review" ? "warn" : "info"}">${esc(ROLES[c.role] || c.role)}</span>${colEdited(cb, c) ? `<button class="icon-btn sm" data-act="col-reset" data-key="${esc(c.key)}" title="자동 판별로 되돌리기" aria-label="${esc(c.label)} 자동 판별로 되돌리기">${icon("undo", 14)}</button>` : ""}</div></header><div class="column-node-flow"><span>원본 열</span>${icon("right", 14)}<b>${esc(ROLES[c.role] || c.role)}</b>${numeric ? `${icon("right", 14)}<span>${c.scale?.min ?? "?"}~${c.scale?.max ?? "?"}점</span>` : ""}${c.domain ? `${icon("right", 14)}<span>${esc(domainName(c.domain))}</span>` : ""}${c.time ? `<span class="badge info">${c.time === "pre" ? "사전" : "사후"}</span>` : ""}</div><div class="column-edit-grid"><label class="field">표시 이름<input class="in" value="${esc(c.label)}" data-change="col" data-key="${esc(c.key)}" data-field="label" aria-label="${esc(c.header)} 표시 이름"></label><label class="field">분석 역할<select class="in" data-change="col" data-key="${esc(c.key)}" data-field="role" aria-label="${esc(c.label)} 역할">${Object.entries(ROLES).map(([key, value]) => option(key, value, c.role === key)).join("")}</select></label>${numeric ? `<label class="field">척도 범위<span class="inline-inputs"><input class="in num" type="number" value="${c.scale?.min ?? ""}" data-change="col" data-key="${esc(c.key)}" data-field="min" aria-label="${esc(c.label)} 척도 최솟값"><i>~</i><input class="in num" type="number" value="${c.scale?.max ?? ""}" data-change="col" data-key="${esc(c.key)}" data-field="max" aria-label="${esc(c.label)} 척도 최댓값"></span></label><label class="field">측정 시점<select class="in" data-change="col" data-key="${esc(c.key)}" data-field="time" aria-label="${esc(c.label)} 시점">${option("", "시점 없음", !c.time)}${option("pre", "사전", c.time === "pre")}${option("post", "사후", c.time === "post")}</select></label>` : ""}${c.role === "likert" ? `<label class="field">분석 영역<input class="in" list="domainList" value="${esc(domainName(c.domain))}" placeholder="영역 없음" data-change="col" data-key="${esc(c.key)}" data-field="domain" aria-label="${esc(c.label)} 영역"></label><label class="node-switch"><input type="checkbox" ${c.reverse ? "checked" : ""} data-change="col" data-key="${esc(c.key)}" data-field="reverse"><span><b>역문항</b><small>점수 방향을 반대로 계산</small></span></label>${c.time !== "pre" ? `<label class="node-switch"><input type="checkbox" ${c.isOverall ? "checked" : ""} data-change="col" data-key="${esc(c.key)}" data-field="isOverall"><span><b>전반 만족</b><small>대표 만족도 문항으로 사용</small></span></label>` : ""}` : ""}</div><div class="column-actions">${scaled ? `<button class="btn sm ${unm.length ? "primary" : ""}" data-act="toggle-labels" data-key="${esc(c.key)}">${icon("edit", 15)}보기 점수 설정${unm.length ? ` <span class="badge bad">${unm.reduce((sum, item) => sum + item.n, 0)}건 확인</span>` : ""}</button>` : ""}${yearKind ? `<button class="btn sm" data-act="toggle-yearbucket" data-key="${esc(c.key)}">${icon("grid", 15)}연도 구간${yName ? ` · ${esc(yName)}` : ""}</button>` : ""}${popOn ? `<button class="btn sm" data-act="toggle-poppanel" data-key="${esc(c.key)}">${icon("users", 15)}모집단 비율${c.popPct ? ` · ${Object.keys(c.popPct).length}개` : ""}</button>` : ""}</div>${scaled && expanded === c.key ? labelPanel(c, unm) : ""}${yearKind && expanded === c.key ? yearBucketPanel(c) : ""}${popOn && expandedPop === c.key ? popPanel(c, sv) : ""}</section></div>`;
  })() : `<div class="empty-inline"><div><b>설정할 문항이 없습니다</b><p class="small muted">다른 필터를 선택해 주세요.</p></div></div>`;
  // 연결 구조 화면도 빠른 설정과 같은 말로 보여 줘 두 화면의 의미가 어긋나지 않게 한다.
  columnWorkspace = columnWorkspace
    .replace('<div class="column-edit-grid">', '<div class="role-guide"><b>분석 역할은 결과에 이 열을 쓰는 방법입니다.</b><span>점수로 읽을 문항은 ‘척도 문항’, 대상별 차이를 볼 정보는 ‘응답자 특성’, 보고서에 쓰지 않을 열은 ‘분석 제외’를 고르세요.</span></div><div class="column-edit-grid">')
    .replace("분석 영역<input", "같이 묶어 볼 주제 (선택)<small>같은 주제를 묻는 문항이 2개 이상일 때만 같은 이름을 입력합니다. 한 문항만 분석하면 비워 두세요.</small><input")
    .replace('placeholder="영역 없음"', 'placeholder="예: 참여 경험"')
    .replace("점수 방향을 반대로 계산", "부정 문항일 때만 선택합니다.")
    .replace("전반 만족</b><small>대표 만족도 문항으로 사용", "대표 만족도 문항</b><small>전반 만족도를 보여 줄 문항으로 사용");
  const detailForBulk = c => {
    const scaled = ["likert", "nps"].includes(c.role);
    const unm = scaled ? unmappedValues(c, rawColumn(state.dataset, c)) : [];
    const yearKind = c.role === "demographic" ? c.detected?.yearKind : null;
    const popOn = c.role === "demographic" && isFeatureOn("respondentRepresentativeness");
    return (scaled && expanded === c.key ? labelPanel(c, unm) : "")
      + (yearKind && expanded === c.key ? yearBucketPanel(c) : "")
      + (popOn && expandedPop === c.key ? popPanel(c, sv) : "");
  };
  const bulkQuestionCard = c => {
    const numeric = ["likert", "nps", "numeric"].includes(c.role);
    const scaled = ["likert", "nps"].includes(c.role);
    const unm = scaled ? unmappedValues(c, rawColumn(state.dataset, c)) : [];
    const yearKind = c.role === "demographic" ? c.detected?.yearKind : null;
    const yScheme = yearKind ? (c.yearScheme ?? DEFAULT_YEAR_SCHEME[yearKind]) : null;
    const yName = yearKind ? YEAR_SCHEMES[yearKind].find(s => s.id === yScheme)?.name : "";
    const popOn = c.role === "demographic" && isFeatureOn("respondentRepresentativeness");
    const optionOpen = Boolean(c.domain || c.reverse || c.isOverall || unm.length || expanded === c.key || expandedPop === c.key);
    const optionTitle = c.role === "likert" ? "문항 묶기·추가 옵션" : yearKind ? "분류·추가 옵션" : "채점 옵션";
    const optionGuide = c.role === "likert"
      ? (c.domain ? `현재 ‘${esc(domainName(c.domain))}’ 주제로 묶어 봅니다.` : "한 문항만 볼 때는 열 필요가 없습니다.")
      : yearKind ? "연도 구간과 모집단 비율이 필요할 때만 설정합니다." : "문자 보기의 점수가 맞는지만 확인합니다.";
    const optionContent = `${c.role === "likert" ? `<div class="bulk-option-grid"><label class="field bulk-domain-field"><span>같이 묶어 볼 주제 <em>선택</em></span><input class="in" list="domainList" value="${esc(domainName(c.domain))}" placeholder="예: 참여 경험" data-change="col" data-key="${esc(c.key)}" data-field="domain" aria-label="${esc(c.label)} 같이 묶어 볼 주제"><small>같은 주제를 묻는 문항이 2개 이상일 때만 같은 이름을 입력합니다. 한 문항만 분석하면 비워 두세요.</small></label><label class="node-switch"><input type="checkbox" ${c.reverse ? "checked" : ""} data-change="col" data-key="${esc(c.key)}" data-field="reverse"><span><b>점수 방향 반대로</b><small>부정 문항의 점수를 반대로 계산합니다.</small></span></label>${c.time !== "pre" ? `<label class="node-switch"><input type="checkbox" ${c.isOverall ? "checked" : ""} data-change="col" data-key="${esc(c.key)}" data-field="isOverall"><span><b>대표 만족도 문항</b><small>전반 만족도를 보여 줄 문항으로 사용합니다.</small></span></label>` : ""}</div>` : ""}<div class="bulk-question-actions">${scaled ? `<button class="btn sm ${unm.length ? "primary" : ""}" data-act="toggle-labels" data-key="${esc(c.key)}">${icon("edit", 15)}보기 점수 설정${unm.length ? ` <span class="badge bad">${unm.reduce((sum, item) => sum + item.n, 0)}건 확인</span>` : ""}</button>` : ""}${yearKind ? `<button class="btn sm" data-act="toggle-yearbucket" data-key="${esc(c.key)}">${icon("grid", 15)}연도 구간${yName ? ` · ${esc(yName)}` : ""}</button>` : ""}${popOn ? `<button class="btn sm" data-act="toggle-poppanel" data-key="${esc(c.key)}">${icon("users", 15)}모집단 비율${c.popPct ? ` · ${Object.keys(c.popPct).length}개` : ""}</button>` : ""}</div>${detailForBulk(c)}`;
    const hasOptions = c.role === "likert" || scaled || yearKind || popOn;
    return `<article class="bulk-question-card ${nodeState(c)}"><header><div class="bulk-question-id"><span>${c.index + 1}</span><div><b>${esc(c.header)}</b><small>${esc(sampleValues(c) || "응답 예 없음")}</small></div></div><div class="row gap"><span class="badge ${nodeState(c) === "review" ? "warn" : nodeState(c) === "ready" ? "ok" : "muted"}">${nodeBadge(c)}</span>${colEdited(cb, c) ? `<button class="icon-btn sm" data-act="col-reset" data-key="${esc(c.key)}" title="자동 판별로 되돌리기" aria-label="${esc(c.label)} 자동 판별로 되돌리기">${icon("undo", 14)}</button>` : ""}</div></header><div class="bulk-question-fields"><label class="field">표시 이름<input class="in" value="${esc(c.label)}" data-change="col" data-key="${esc(c.key)}" data-field="label" aria-label="${esc(c.header)} 표시 이름"></label><label class="field">분석 역할<select class="in" data-change="col" data-key="${esc(c.key)}" data-field="role" aria-label="${esc(c.label)} 역할">${Object.entries(ROLES).map(([key, value]) => option(key, value, c.role === key)).join("")}</select></label>${numeric ? `<label class="field">척도 범위<span class="inline-inputs"><input class="in num" type="number" value="${c.scale?.min ?? ""}" data-change="col" data-key="${esc(c.key)}" data-field="min" aria-label="${esc(c.label)} 척도 최솟값"><i>~</i><input class="in num" type="number" value="${c.scale?.max ?? ""}" data-change="col" data-key="${esc(c.key)}" data-field="max" aria-label="${esc(c.label)} 척도 최댓값"></span></label><label class="field">측정 시점<select class="in" data-change="col" data-key="${esc(c.key)}" data-field="time" aria-label="${esc(c.label)} 시점">${option("", "시점 없음", !c.time)}${option("pre", "사전", c.time === "pre")}${option("post", "사후", c.time === "post")}</select></label>` : ""}</div>${hasOptions ? `<details class="bulk-question-options"${optionOpen ? " open" : ""}><summary><span><b>${optionTitle}</b><small>${optionGuide}</small></span>${unm.length ? `<span class="badge bad">${unm.reduce((sum, item) => sum + item.n, 0)}건 확인</span>` : ""}</summary><div class="bulk-question-options-body">${optionContent}</div></details>` : ""}</article>`;
  };
  const orderedColumns = [...cb.columns].sort((a, b) => Number(needsReview(b)) - Number(needsReview(a)) || a.index - b.index);
  const reviewCount = orderedColumns.filter(needsReview).length;
  const bulkWorkspace = `<section class="bulk-settings" aria-label="빠른 설정">
    <div class="bulk-settings-note"><div><b>빠른 설정</b><span>① 확인 필요 문항부터 보고 ② 이름·역할을 확인한 뒤 ③ 필요한 옵션만 수정하세요.</span></div><span class="badge ${reviewCount ? "warn" : "ok"}">${reviewCount ? `확인 필요 ${reviewCount}개` : "모두 확인됨"}</span></div>
    <div class="bulk-question-list">${orderedColumns.map(bulkQuestionCard).join("")}</div>
  </section>`;
  const qualityControl = r.straight
    ? `<label class="quality-toggle"><input type="checkbox" ${state.excludeStraight ? "checked" : ""} data-change="exclude-straight"><span><b>${state.excludeStraight ? `동일 점수 응답 ${r.straight}명 제외 적용됨` : `동일 점수 응답 ${r.straight}명`}</b><small>${state.excludeStraight ? "분석·보고서에서 이 응답을 제외하고 있습니다." : "내용을 확인한 뒤 선택하면 분석·보고서에서 제외합니다."}</small></span></label>`
    : `<div class="quality-status"><b>제외할 응답 없음</b><small>3개 이상 척도 문항에 모두 같은 점수로 답한 사람이 없습니다.</small></div>`;
  const supportPanel = `<section class="card setup-support-card">
    <div class="setup-support-title"><span><em>분석 전 확인</em><b>결과 점수와 응답 품질</b><small>보고서에 쓰일 점수 기준을 고르고, 제외할 응답이 있는지 확인합니다.</small></span></div>
    <div class="setup-support-body">
      ${scoreBasisPanel(r.analysis.items, { embedded: true })}
      <section class="setup-quality-check"><div><span class="eyebrow">응답 품질 점검</span><h3>같은 점수를 반복해 답한 응답</h3><p>3개 이상 척도 문항에 모두 같은 점수로 답한 경우입니다. 성실 응답일 수도 있어 자동으로 제외하지 않습니다.</p></div>${qualityControl}</section>
    </div>
  </section>`;

  return `
  <section class="card setup-overview">
    <div class="page-head">
      <div><h1>데이터 설정</h1><p class="muted">자동 판별 결과를 확인하고 필요한 부분만 고치세요. 변경 사항은 분석·보고서에 바로 반영됩니다.</p></div>
      <div class="row gap"><button class="btn" data-act="goto" data-to="business">다음: 성과지표(선택) →</button><button class="btn ghost" data-act="goto" data-to="dash">건너뛰고 분석 결과 보기</button></div>
    </div>
    <div class="facts">
      <div><span>파일</span><b>${esc(state.dataset.fileName)}</b></div>
      <div><span>시트</span><b>${cb.sheets.map(s => `${esc(s.name)}(${SHEET_ROLE[s.role] || s.role})`).join(", ")}</b></div>
      <div><span>분석 응답자</span><b>${sv.n}명</b></div>
    </div>
    <section class="setup-design" aria-labelledby="design-title"><div class="setup-design-head"><span class="eyebrow">조사 방식</span><h2 id="design-title">응답을 어떻게 받았나요?</h2><p>선택에 따라 사전·사후 변화 분석과 응답자 연결 방법이 달라집니다. 확실하지 않으면 ‘단일 시점 조사’로 시작하세요.</p></div><div class="design-choice-list" role="radiogroup" aria-label="조사 방식">${designChoices}</div></section>
    ${r.codebookWarnings.length || unmappedWarn ? `<ul class="warnings">${unmappedWarn}${r.codebookWarnings.map(w => `<li>${levelBadge(w.level)} ${esc(w.msg)}</li>`).join("")}</ul>` : ""}
  </section>

  ${sheetCandidates.length > 1 ? `<section class="card">
    <h2>응답 시트 선택</h2>
    <p class="muted">이 파일에 설문 응답으로 보이는 시트가 여러 개 있습니다. 지금은 한 번에 한 시트만 분석하므로, 분석할 시트를 고르세요.</p>
    <div class="row gap wrap" role="radiogroup" aria-label="응답 시트">
      ${sheetCandidates.map(c => `<label class="check"><input type="radio" name="data-sheet" value="${c.index}" ${cb.responseSheets[0] === c.index ? "checked" : ""} data-change="data-sheet"> ${esc(c.name)} <span class="small muted">(${c.nRows}행)</span></label>`).join("")}
    </div>
  </section>` : ""}

  ${supportPanel}

  ${cb.design === "prepost-sheets" ? `
  <section class="card prepost-link-card">
    <div class="prepost-link-head"><div><span class="eyebrow">사전·사후 연결</span><h2>두 시트에서 같은 응답자를 찾습니다</h2><p>사전·사후 시트에 공통으로 있는 ID 열을 고르세요. 이름·전화번호 원문은 저장하지 않고, 연결에 필요한 값만 이 브라우저에서 비교합니다.</p></div><span class="badge ${cb.pairing.idKeys.every(Boolean) ? "ok" : "warn"}">${cb.pairing.idKeys.every(Boolean) ? "ID 열 선택됨" : "ID 열 선택 필요"}</span></div>
    <div class="prepost-id-grid">
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
    <div class="row between wrap"><h2>문항(열) 설정</h2>
      <span class="small muted">처음에는 빠른 설정에서 문항 역할을 확인하세요. 문항 간 연결을 검토할 때만 연결 구조를 사용합니다.${isFeatureOn("respondentRepresentativeness") && isAdminPreview("respondentRepresentativeness") ? ' · 응답자 특성 열의 모집단 비율은 <span class="badge muted">관리자 미리보기</span> 기능입니다' : ""}</span></div>
    <datalist id="domainList">${cb.domains.map(d => `<option value="${esc(d.name)}">`).join("")}</datalist>
    <div class="setup-mode-tabs" role="tablist" aria-label="문항 설정 방식"><button class="setup-mode-tab${mappingMode === "quick" ? " on" : ""}" role="tab" aria-selected="${mappingMode === "quick"}" data-act="setup-mode" data-mode="quick">빠른 설정</button><button class="setup-mode-tab${mappingMode === "table" ? " on" : ""}" role="tab" aria-selected="${mappingMode === "table"}" data-act="setup-mode" data-mode="table">전체 표 편집</button><button class="setup-mode-tab${mappingMode === "map" ? " on" : ""}" role="tab" aria-selected="${mappingMode === "map"}" data-act="setup-mode" data-mode="map">분석 연결 보기</button></div>
    ${mappingMode === "map" ? `${questionMap}${columnWorkspace}` : mappingMode === "table" ? tableWorkspace : `<section class="setup-workspace" aria-label="빠른 설정"><div class="setup-workspace-note"><div><b>빠른 설정</b><span>왼쪽에서 문항을 고르고, 오른쪽에서 필요한 설정을 모두 확인·수정하세요. 확인이 필요한 문항부터 먼저 보입니다.</span></div><span class="badge ${visibleColumns.filter(needsReview).length ? "warn" : "ok"}">${visibleColumns.filter(needsReview).length ? `확인 필요 ${visibleColumns.filter(needsReview).length}개` : "모두 확인됨"}</span></div>${columnWorkspace}</section>`}
    <div class="row end gap"><button class="btn" data-act="goto" data-to="business">다음: 성과지표(선택) →</button></div>
  </section>`;
}

const colByKey = key => state.codebook.columns.find(x => x.key === key);

export const actions = {
  ...scoreBasisActions,
  "setup-mode": el => { if (["map", "quick", "table"].includes(el.dataset.mode)) { mappingMode = el.dataset.mode; refresh(); } },
  "column-select": el => {
    if (!state.codebook.columns.some(c => c.key === el.dataset.key)) return;
    selectedColumnKey = el.dataset.key;
    refresh();
    centerSelectedTableRow(selectedColumnKey);
  },
  "column-filter": el => { if (["all", "review", "scale", "profile", "other"].includes(el.dataset.filter)) { columnFilter = el.dataset.filter; selectedColumnKey = ""; refresh(); } },
  "toggle-labels": el => { selectedColumnKey = el.dataset.key; expanded = expanded === el.dataset.key ? null : el.dataset.key; refresh(); },
  "toggle-yearbucket": el => { selectedColumnKey = el.dataset.key; expanded = expanded === el.dataset.key ? null : el.dataset.key; refresh(); },
  "toggle-poppanel": el => { selectedColumnKey = el.dataset.key; expandedPop = expandedPop === el.dataset.key ? null : el.dataset.key; refresh(); },
  poppct: el => {
    const c = colByKey(el.dataset.key); if (!c) return;
    c.popPct = { ...(c.popPct || {}) };
    const cat = el.dataset.cat;
    if (el.value === "") delete c.popPct[cat];
    else { const v = Number(el.value); if (Number.isFinite(v)) c.popPct[cat] = v; }
    if (!Object.keys(c.popPct).length) delete c.popPct;
    refresh();
  },
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
  design: el => {
    const next = el.value;
    const separateReady = state.codebook.responseSheets.length === 2
      && state.codebook.responseSheets.every(si => Array.isArray(state.dataset?.sheets[si]?.rows));
    if (next === "prepost-sheets" && !separateReady) {
      toast("사전·사후 시트 분리는 응답 시트 2개가 있는 파일에서만 선택할 수 있습니다.", "info", 6000);
      refresh();
      return;
    }
    const prev = state.codebook.design;
    state.codebook.design = next;
    invalidate();
    try { compute(); }
    catch (e) {
      console.error(e);
      state.codebook.design = prev;
      invalidate();
      toast(`조사 방식을 바꾸지 못했습니다: ${e.message}`, "bad", 6000);
    }
    refresh();
  },
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
    selectedColumnKey = c.key;
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
