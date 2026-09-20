// 100점 환산 기준 선택 카드 — 데이터 설정(분석 전)과 로컬 설정에서 같은 화면을 쓴다
import { state, persistSettings, invalidate } from "./store.js";
import { SCORE_BASES, cleanScoreBasis, scoreBasisExample, levelWord, f2, DEFAULT_THRESHOLDS } from "../narrative/vocab.js";
import { esc, toast } from "./util.js";
import { round } from "../core/util.js";
import { refresh } from "./router.js";

const f4 = x => x.toFixed(4);

/** 이 파일에서 두 기준이 실제로 얼마나 달라지는지 (문항별 환산값·수준 판정) */
function impactOf(items) {
  const t = { ...DEFAULT_THRESHOLDS, ...(state.settings.thresholds || {}) };
  const rows = items.filter(it => Number.isFinite(it.mean) && it.max > it.min).map(it => ({ it, ex: scoreBasisExample(it.mean, it.min, it.max) }));
  const changed = rows.filter(r => f2(r.ex.exact) !== f2(r.ex.rounded));
  const levelChanged = rows.filter(r => levelWord(r.ex.exact, t) !== levelWord(r.ex.rounded, t));
  // 예시는 평균을 4자리로 보여줘도 반올림 결과(둘째 자리)가 그대로 읽히는 문항 중 두 기준의 차이가 가장 큰 것으로 고른다
  const readable = rows.filter(r => round(Number(r.ex.mean.toFixed(4)), 2) === r.ex.shown);
  const best = [...(readable.length ? readable : rows)].sort((a, b) => Math.abs(b.ex.exact - b.ex.rounded) - Math.abs(a.ex.exact - a.ex.rounded))[0] || null;
  return { total: rows.length, changed: changed.length, levelChanged: levelChanged.length, best };
}

/**
 * @param items 분석된 척도 문항(itemStats 결과, 원자료 평균 mean 포함). 없으면 일반 예시로 설명
 */
export function scoreBasisPanel(items = []) {
  const cur = cleanScoreBasis(state.settings.scoreBasis);
  const imp = impactOf(items);
  const ex = imp.best ? imp.best.ex : scoreBasisExample(4.366, 1, 5);
  const range = ex.max - ex.min;
  const calc = (m, v) => `(${m} − ${ex.min}) ÷ ${range} × 100 = <b>${f2(v)}점</b>`;
  const exampleFor = imp.best ? `이 파일의 「${esc(imp.best.it.label)}」` : "예를 들어 평균이 4.366점인 문항";
  const fileImpact = imp.total
    ? `<p class="basis-impact">이 파일에서는 척도 문항 ${imp.total}개 중 <b>${imp.changed}개</b>의 환산 점수가 두 기준에서 다르게 표시되고, <b>${imp.levelChanged}개</b>는 수준 판정(예: ‘높은 수준’)이 달라집니다.</p>`
    : "";
  const opt = (id, title, body, example) => `<label class="basis-opt${cur === id ? " on" : ""}">
      <input type="radio" name="score-basis" value="${id}" ${cur === id ? "checked" : ""} data-change="score-basis">
      <div><b>${esc(title)}</b>${id === "exact" ? ' <span class="badge info">기본</span>' : ""}
        <p>${body}</p><p class="small muted">예: ${example}</p></div></label>`;
  return `<section class="card basis-card" id="basis-card">
    <h2>100점 환산 기준</h2>
    <p class="muted">환산 점수는 평균에서 계산합니다. 이때 평균을 <b>반올림하기 전 값</b>으로 할지, 보고서 표에 적히는 <b>반올림한 값(소수 둘째 자리)</b>으로 할지 고르세요. 이미 표의 평균으로 환산해 보고서를 써 오셨다면 ‘반올림 후’가 그 값과 일치합니다.</p>
    <p class="basis-example">${exampleFor}: 평균 <b>${f4(ex.mean)}</b>점은 표에 <b>${f2(ex.shown)}</b>점으로 적힙니다.</p>
    ${fileImpact}
    <div class="basis-opts" role="radiogroup" aria-label="100점 환산 기준">
      ${opt("exact", SCORE_BASES[0].label, "원자료의 평균 그대로 환산합니다. 가장 정확한 값입니다. 다만 표에 적힌 평균(소수 둘째 자리)으로 직접 계산하면 5점 척도 기준 최대 ±0.125점 차이가 날 수 있습니다.", calc(f4(ex.mean), ex.exact))}
      ${opt("rounded", SCORE_BASES[1].label, "표에 적힌 평균으로 환산합니다. 표의 숫자로 직접 검산하면 그대로 맞고 기존 방식과 같습니다. 대신 반올림 오차(최대 ±0.125점)가 결과에 그대로 들어가, 판정 기준선(예: 목표 80점) 근처에서는 반올림 전 기준과 판정이 달라질 수 있고 평균이 같은 문항은 같은 점수로 정렬됩니다.", calc(f2(ex.shown), ex.rounded))}
    </div>
    <p class="small muted">선택한 기준은 문항 순위 정렬, 수준 판정, 성과지표 달성 판정, 차트, 발표 자료에 모두 그대로 적용됩니다. 사전·사후 변화량, 효과크기, 검정 결과 같은 통계는 어느 쪽이든 원자료로 계산합니다. 상단 톱니바퀴의 <b>로컬 설정</b>에서 언제든 바꿀 수 있으며 이 브라우저에 기억됩니다.</p>
  </section>`;
}

export const scoreBasisActions = {
  "score-basis": el => {
    state.settings.scoreBasis = cleanScoreBasis(el.value);
    persistSettings(); invalidate();
    toast(`100점 환산 기준: ${SCORE_BASES.find(b => b.id === state.settings.scoreBasis).label.split(" (")[0]}`, "ok");
    refresh();
  },
};
