// ④ 분석 결과 화면: 핵심 지표 카드 + 장별 결과(보고서와 동일한 표·그래프) + 주관식 원문 + 자료 품질
import { state, compute, reportBlocks, invalidate } from "../store.js";
import { blocksToHtml, splitChapters } from "../../report/render-html.js";
import { f1, f2, signed, pText, DEFAULT_THRESHOLDS } from "../../narrative/vocab.js";
import { alphaLabel } from "../../stats/effectsize.js";
import { DESIGN_LABELS } from "../../model/codebook.js";
import { maskPII } from "../../core/util.js";
import { esc, option } from "../util.js";
import { go, refresh } from "../router.js";
import { icon } from "../icons.js";
import { resolvedTheme } from "../theme.js";
import { isFeatureOn } from "../../admin/flags-client.js";
import { representativenessCheck, REP_DIFF_CAUTION } from "../../analysis/representativeness.js";

const TYPE_LABEL = { positive: "긍정", negative: "부정", suggestion: "건의", neutral: "기타", none: "없음" };
let textFilter = { col: "", type: "", q: "" };
let tabsScrollLeft = 0; // 탭(장) 가로 스크롤 위치 — 탭 클릭마다 화면 전체가 다시 그려져도 유지

/** 매 렌더 뒤 호출(main.js) — 새로 그려진 .tabs 에 이전 가로 스크롤 위치를 되돌림 */
export function mount() {
  const el = document.querySelector(".tabs");
  if (!el) return;
  el.scrollLeft = tabsScrollLeft;
  el.addEventListener("scroll", () => { tabsScrollLeft = el.scrollLeft; }, { passive: true });
}

// 카드마다 상태색을 살짝 얹어(장식이 아니라 판정 의미로만) 6개 중 어디를 먼저 봐야 할지 한눈에 들어오게 함
const GRADE_TONE = { 우수: "good", 보통: "mid", 미흡: "bad" };
const ALPHA_TONE = a => (a >= 0.8 ? "good" : a >= 0.6 ? "mid" : "bad");
function levelTone(score100, t) {
  if (!Number.isFinite(score100)) return "";
  const [a, , c] = t.level;
  return score100 >= a ? "good" : score100 >= c ? "mid" : "bad";
}

function cards(r) {
  const A = r.analysis, E = r.evaluation, P = A.prepost;
  const t = { ...DEFAULT_THRESHOLDS, ...(state.settings.thresholds || {}) };
  const all = P?.domains.find(d => d.id === "ALL") || (P?.items.length === 1 ? P.items[0] : null);
  const sat = A.overallItem ? A.overallItem.score100 : A.total?.score100;
  const ppTone = all && (all.primary.p >= .05 ? "mid" : all.diff > 0 ? "good" : "bad");
  const npsTone = A.nps[0] && (A.nps[0].nps > 0 ? "good" : A.nps[0].nps < 0 ? "bad" : "mid");
  const smallSampleOn = isFeatureOn("smallSampleWarning"); // 관리자 전용 미리보기 — 화면에서 바로 보이는 소표본 주의
  const smallSuffix = small => (smallSampleOn && small ? " · ⚠ 소표본 주의" : "");
  const c = [
    ["응답자", `${A.meta.n}명`, `${DESIGN_LABELS[A.meta.design]}${smallSuffix(A.meta.n < t.minN)}`, smallSampleOn && A.meta.n < t.minN ? "mid" : ""],
    E && ["성과지표", `${E.summary.achieved}/${E.summary.measured} 달성`, `종합 ${E.summary.grade}`, GRADE_TONE[E.summary.grade] || ""],
    all && ["사전→사후", `${signed(all.diff)}점`, `${pText(all.primary.p)} · ${all.primary.effectLabel}${smallSuffix(Number.isFinite(all.n) && all.n < t.minN)}`, ppTone],
    Number.isFinite(sat) && ["만족도(100점)", `${f2(sat)}점`, A.overallItem ? A.overallItem.label : "척도 문항 평균", levelTone(sat, t)],
    A.nps[0] && ["NPS", signed(A.nps[0].nps, 1), `추천 ${f1(A.nps[0].promoters)}%`, npsTone],
    A.reliability && Number.isFinite(A.reliability.alpha) && ["신뢰도 α", f2(A.reliability.alpha), alphaLabel(A.reliability.alpha), ALPHA_TONE(A.reliability.alpha)],
  ].filter(Boolean);
  return `<div class="cards">${c.map(([title, v, s, tone]) => `<div class="kcard${tone ? ` t-${tone}` : ""}"><span>${esc(title)}</span><b>${esc(v)}</b><small>${esc(s)}</small></div>`).join("")}</div>`;
}

function textTab(r) {
  const A = r.analysis;
  if (!A.text.length) return `<p class="muted">주관식 문항이 없습니다.</p>`;
  const tx = A.text.find(t => t.key === textFilter.col) || A.text[0];
  const list = tx.responses.filter(x => (!textFilter.type || x.type === textFilter.type) && (!textFilter.q || x.text.includes(textFilter.q)));
  return `<div class="row gap wrap">
      <select class="in" data-change="tx-col">${A.text.map(t => option(t.key, t.label, t.key === tx.key)).join("")}</select>
      <input class="in" placeholder="검색어" value="${esc(textFilter.q)}" data-change="tx-q">
    </div>
    <div class="seg-filter" role="group" aria-label="응답 유형 필터">
      <button class="seg-btn${textFilter.type ? "" : " on"}" data-act="tx-type-set" data-type="">전체<span class="n">${tx.responses.length}</span></button>
      ${Object.entries(TYPE_LABEL).map(([k, v]) => `<button class="seg-btn${textFilter.type === k ? " on" : ""}" data-act="tx-type-set" data-type="${k}">${v}<span class="n">${tx.types[k]}</span></button>`).join("")}
    </div>
    <p class="small muted">${list.length}건 · 개인정보(전화·이메일 형태)는 자동 가림 · 분류는 규칙 기반이므로 원문과 함께 검토하세요.</p>
    <ul class="responses">${list.slice(0, 500).map(x => `<li><span class="badge ${x.type === "positive" ? "ok" : x.type === "negative" || x.type === "suggestion" ? "bad" : "muted"}">${TYPE_LABEL[x.type]}</span> ${esc(x.text)}</li>`).join("")}</ul>`;
}

function repHtml(sv, cb) {
  if (!isFeatureOn("respondentRepresentativeness")) return "";
  const rep = representativenessCheck(sv, cb.columns);
  if (!rep.length) return "";
  return `<h3>응답자 대표성(모집단 비율 대비)</h3>${rep.map(g => `
    <p class="small muted">${esc(g.label)} · 응답 ${g.n}명${g.maxDiff > REP_DIFF_CAUTION ? ` · <span class="warn-text">최대 ${f1(g.maxDiff)}%p 차이 — 표본이 모집단과 차이가 있어 해석 시 참고 필요</span>` : ""}</p>
    <table class="tbl mini"><tr><th>구분</th><th class="c">응답자 비율</th><th class="c">모집단 비율</th><th class="c">차이(%p)</th></tr>
      ${g.rows.filter(row => row.popPct !== null).map(row => `<tr><td>${esc(row.category)}</td><td class="c">${f1(row.observedPct)}</td><td class="c">${f1(row.popPct)}</td><td class="c ${Math.abs(row.diffPts) > REP_DIFF_CAUTION ? "warn-text" : ""}">${signed(row.diffPts, 1)}</td></tr>`).join("")}
    </table>`).join("")}`;
}

function qualityTab(r) {
  const sv = r.survey, cb = state.codebook, A = r.analysis;
  const cols = cb.columns.filter(c => c.role !== "ignore" && (cb.design !== "prepost-sheets" || c.sheet === sv.baseSheet || c.time === "pre"));
  const rows = cols.map(c => {
    let miss = "-", inv = "-";
    try { const col = sv.column(c.key); miss = col.missing ?? "-"; inv = col.invalid ?? "-"; } catch { /* 제외 열 */ }
    const pct = typeof miss === "number" ? f1(miss / sv.n * 100) : "-";
    return `<tr><td>${esc(c.label)}</td><td>${esc(c.role)}</td><td class="c">${miss}</td><td class="c ${Number(pct) > 20 ? "bad-text" : ""}">${pct}</td><td class="c ${inv > 0 ? "warn-text" : ""}">${inv}</td></tr>`;
  }).join("");
  const corr = A.correlation;
  const corrHtml = corr ? `<h3>문항 간 상관(Pearson r)</h3><div class="tblwrap"><table class="tbl corr"><tr><th></th>${corr.labels.map(l => `<th title="${esc(l)}">${esc(l.slice(0, 8))}</th>`).join("")}</tr>${corr.matrix.map((row, i) => `<tr><th class="l" title="${esc(corr.labels[i])}">${esc(corr.labels[i].slice(0, 14))}</th>${row.map((cell, j) => { const v = cell?.r; const a = Math.min(1, Math.abs(v || 0)); return `<td class="c" style="background:${i === j ? "var(--surface-3)" : v >= 0 ? `rgba(42,120,214,${a * 0.7})` : `rgba(199,72,69,${a * 0.7})`};color:${a > 0.55 && i !== j ? "#fff" : "inherit"}">${f2(v)}${cell?.p < 0.05 && i !== j ? "*" : ""}</td>`; }).join("")}</tr>`).join("")}</table></div>` : "";
  const reg = A.regression;
  const regHtml = reg ? `<h3>전반 만족도 영향 요인(다중회귀)</h3><p class="small muted">종속변수: ${esc(reg.dependent)} · R²=${f2(reg.r2)} · 수정 R²=${f2(reg.adjR2)} · n=${reg.n}</p>
    <table class="tbl"><tr><th>문항</th><th>B</th><th>β</th><th>t</th><th>p</th><th>VIF</th></tr>${reg.coef.slice(1).map(c => `<tr><td>${esc(c.name)}</td><td class="c">${f2(c.b)}</td><td class="c"><b>${f2(c.beta)}</b></td><td class="c">${f2(c.t)}</td><td class="c">${pText(c.p)}</td><td class="c ${c.vif > 5 ? "warn-text" : ""}">${f2(c.vif)}</td></tr>`).join("")}</table>` : "";
  return `<div class="grid2">
    <div><h3>열별 무응답·오류값</h3><div class="tblwrap"><table class="tbl"><tr><th>문항</th><th>역할</th><th>무응답</th><th>무응답%</th><th>범위 밖</th></tr>${rows}</table></div>
      <p class="small">불성실 응답 의심(모든 척도 동일값): <b>${r.straight}명</b> ${state.excludeStraight ? "(분석에서 제외됨)" : `<button class="btn sm" data-act="exclude">분석에서 제외</button>`}</p>
      ${repHtml(sv, cb)}</div>
    <div>${corrHtml}${regHtml}</div></div>`;
}

export function render({ sub }) {
  const r = compute();
  const chapters = splitChapters(reportBlocks());
  const tabs = [{ key: "summary", title: "요약" }, ...chapters.filter(c => c.key !== "summary").map(c => ({ key: c.key, title: c.title }))];
  if (r.analysis.text.length) tabs.push({ key: "__text", title: "주관식 원문" });
  tabs.push({ key: "__quality", title: "자료 품질·상관" });
  const cur = tabs.find(t => t.key === sub) || tabs[0];
  let body;
  if (cur.key === "__text") body = textTab(r);
  else if (cur.key === "__quality") body = qualityTab(r);
  else body = `<div class="paper view">${blocksToHtml(chapters.find(c => c.key === cur.key)?.blocks || [], { theme: resolvedTheme() })}</div>`;
  return `
  <div class="page-head">
    <div><h2>분석 결과</h2><p class="small muted">${esc(state.dataset.fileName)} · 계산 ${r.ms}ms · 그래프에 마우스를 올리면 값이 보입니다</p></div>
    <div class="row gap wrap"><button class="btn" data-act="goto" data-to="present" data-sub="1">${icon("play", 16)}발표 모드</button><button class="btn primary" data-act="goto" data-to="report">보고서 편집·내보내기${icon("right", 16)}</button></div>
  </div>
  ${isFeatureOn("statsTrustBadge") ? `<p class="small muted row gap" style="margin-top:-6px;align-items:center">${icon("shield", 13)} 통계 방법: R 기준값 대비 검증 · 다중비교 Holm/BH 보정 · 효과크기(95% 신뢰구간) 병기 <button class="btn sm ghost" data-act="goto" data-to="dash" data-sub="${esc("[부록] 세부 분석표")}">산식·전체 검정 결과 보기</button></p>` : ""}
  ${cards(r)}
  <section class="card">
    <nav class="tabs" aria-label="분석 장">${tabs.map(t => `<button class="tab${t.key === cur.key ? " on" : ""}" ${t.key === cur.key ? 'aria-current="page"' : ""} data-act="goto" data-to="dash" data-sub="${esc(t.key)}">${esc(t.title)}</button>`).join("")}</nav>
    <div class="tabbody">${body}</div>
  </section>`;
}

export const actions = {
  "tx-col": el => { textFilter.col = el.value; refresh(); },
  "tx-type-set": el => { textFilter.type = el.dataset.type; refresh(); },
  "tx-q": el => { textFilter.q = el.value.trim(); refresh(); },
  exclude: () => { state.excludeStraight = true; invalidate(); refresh(); },
};
export { go, maskPII };
