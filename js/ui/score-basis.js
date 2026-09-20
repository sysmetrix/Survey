// 100점 환산 기준 선택 카드 — 데이터 설정(분석 전)과 로컬 설정에서 같은 화면을 쓴다
import { state, persistSettings, invalidate, compute } from "./store.js";
import { SCORE_BASES, cleanScoreBasis, scoreBasisExample, levelWord, f2, signed, DEFAULT_THRESHOLDS } from "../narrative/vocab.js";
import { esc, busy, busyDone, nextFrame, toast } from "./util.js";
import { round } from "../core/util.js";
import { refresh } from "./router.js";

const f4 = x => x.toFixed(4);
const shortLabel = s => (s.length > 26 ? `${s.slice(0, 25)}…` : s);

/** 이 파일에서 두 기준이 실제로 얼마나 달라지는지 + 올림·내림 예시 문항 */
function impactOf(items) {
  const t = { ...DEFAULT_THRESHOLDS, ...(state.settings.thresholds || {}) };
  const rows = items.filter(it => Number.isFinite(it.mean) && it.max > it.min).map(it => ({ it, ex: scoreBasisExample(it.mean, it.min, it.max) }));
  const changed = rows.filter(r => f2(r.ex.exact) !== f2(r.ex.rounded));
  const levelChanged = rows.filter(r => levelWord(r.ex.exact, t) !== levelWord(r.ex.rounded, t));
  // 예시는 평균을 4자리로 보여줘도 반올림 결과(둘째 자리)가 그대로 읽히는 문항 중에서, 방향별로 차이가 가장 큰 것을 고른다
  const readable = changed.filter(r => round(Number(r.ex.mean.toFixed(4)), 2) === r.ex.shown);
  const pick = sign => readable.filter(r => Math.sign(r.ex.rounded - r.ex.exact) === sign).sort((a, b) => Math.abs(b.ex.rounded - b.ex.exact) - Math.abs(a.ex.rounded - a.ex.exact))[0] || null;
  return { total: rows.length, changed: changed.length, levelChanged: levelChanged.length, up: pick(1), down: pick(-1) };
}

/**
 * @param items 분석된 척도 문항(itemStats 결과, 원자료 평균 mean 포함). 없으면 일반 예시로 설명
 */
export function scoreBasisPanel(items = []) {
  const cur = cleanScoreBasis(state.settings.scoreBasis);
  const imp = impactOf(items);
  // 올림 예시 · 내림 예시 (이 파일에 그 방향 사례가 없으면 일반 예시로 채움)
  const examples = [
    { dir: "올림", label: imp.up ? imp.up.it.label : null, ex: imp.up ? imp.up.ex : scoreBasisExample(4.366, 1, 5) },
    { dir: "내림", label: imp.down ? imp.down.it.label : null, ex: imp.down ? imp.down.ex : scoreBasisExample(4.164, 1, 5) },
  ];
  const who = e => (e.label ? `「${esc(shortLabel(e.label))}」` : "평균이 다른 문항");
  // 산식을 그대로 눈으로 따라갈 수 있도록 두 계산 경로(반올림 전/후)를 나란히 보여주는 그림
  const diagram = (e, i) => {
    const range = e.ex.max - e.ex.min;
    const diff = e.ex.rounded - e.ex.exact;
    return `<div class="basis-diagram">
      <div class="basis-diagram-title">예 ${i + 1}. ${who(e)} 원자료 평균 <b class="mono">${f4(e.ex.mean)}</b></div>
      <div class="basis-branches">
        <div class="basis-branch">
          <span class="basis-branch-tag">반올림 전</span>
          <div class="basis-formula">(${f4(e.ex.mean)} − ${e.ex.min}) ÷ ${range} × 100 = <b>${f2(e.ex.exact)}점</b></div>
        </div>
        <div class="basis-branch alt">
          <span class="basis-branch-tag alt">반올림 후(조정)</span>
          <div class="basis-round-step"><span class="mono">${f4(e.ex.mean)}</span> 반올림 → <b class="mono">${f2(e.ex.shown)}</b></div>
          <div class="basis-formula">(${f2(e.ex.shown)} − ${e.ex.min}) ÷ ${range} × 100 = <b>${f2(e.ex.rounded)}점</b></div>
        </div>
      </div>
      <div class="basis-diff">차이 <b>${signed(diff)}점</b> · ${e.dir}</div>
    </div>`;
  };
  const diagrams = `<div class="basis-diagrams">${examples.map(diagram).join("")}</div>`;
  const fileImpact = imp.total
    ? `<p class="basis-impact">이 파일에서는 척도 문항 ${imp.total}개 중 <b>${imp.changed}개</b>의 환산 점수가 두 기준에서 다르게 표시되고, <b>${imp.levelChanged}개</b>는 수준 판정(예: ‘높은 수준’)이 달라집니다.</p>`
    : "";
  const opt = (b, body) => `<label class="basis-opt${cur === b.id ? " on" : ""}">
      <input type="radio" name="score-basis" value="${b.id}" ${cur === b.id ? "checked" : ""} data-change="score-basis">
      <div><b>${esc(b.label)}</b> <span class="badge info">${esc(b.tag)}</span>
        <p>${body}</p></div></label>`;
  return `<section class="card basis-card" id="basis-card">
    <h2>100점 환산 기준</h2>
    <p class="muted">환산 점수는 평균에서 계산합니다. 이때 평균을 <b>반올림하기 전 값</b>으로 할지, 보고서 표에 적히는 <b>반올림한 값(소수 둘째 자리)</b>으로 할지 고르세요. 이미 표의 평균으로 환산해 보고서를 써 오셨다면 ‘반올림 후’가 그 값과 일치합니다.</p>
    <p class="basis-example">표에는 평균이 소수 둘째 자리로 반올림되어 적히므로, ‘반올림 후’ 기준의 환산 점수는 반올림 전보다 <b>높아질 수도(올림), 낮아질 수도(내림)</b> 있습니다. 아래 그림처럼 같은 평균이라도 계산 경로에 따라 결과가 갈립니다.</p>
    ${diagrams}
    ${fileImpact}
    <div class="basis-opts" role="radiogroup" aria-label="100점 환산 기준">
      ${opt(SCORE_BASES[0], "원자료의 평균 그대로 환산합니다. 가장 정확한 값입니다. 다만 표에 적힌 평균(소수 둘째 자리)으로 직접 계산하면 5점 척도 기준 최대 ±0.125점 차이가 날 수 있습니다.")}
      ${opt(SCORE_BASES[1], "표에 적힌 평균으로 환산합니다. 표의 숫자로 직접 검산하면 그대로 맞고 기존 방식과 같습니다. 대신 반올림 오차(최대 ±0.125점)가 결과에 그대로 들어가, 판정 기준선(예: 목표 80점) 근처에서는 반올림 전 기준과 판정이 달라질 수 있고 평균이 같은 문항은 같은 점수로 정렬됩니다.")}
    </div>
    <p class="small muted">선택한 기준은 문항 순위 정렬, 수준 판정, 성과지표 달성 판정, 차트, 발표 자료에 모두 그대로 적용됩니다. 사전·사후 변화량, 효과크기, 검정 결과 같은 통계는 어느 쪽이든 원자료로 계산합니다. 상단 톱니바퀴의 <b>로컬 설정</b>에서 언제든 바꿀 수 있으며 이 브라우저에 기억됩니다.</p>
  </section>`;
}

export const scoreBasisActions = {
  "score-basis": async el => {
    const prev = cleanScoreBasis(state.settings.scoreBasis), next = cleanScoreBasis(el.value);
    if (next === prev) return;
    const b = SCORE_BASES.find(x => x.id === next);
    const before = state.results?.analysis?.items?.map(it => f2(it.score100)) ?? null;
    // 화면 가운데 안내를 먼저 그린 뒤 다시 계산 (계산 중에는 화면이 멈추므로)
    busy(true, `환산 기준을 ‘${b.short}’으로 바꾸고\n점수를 다시 계산하는 중…`);
    await nextFrame();
    state.settings.scoreBasis = next;
    invalidate();
    let r;
    try { r = compute(); }
    catch (e) {
      console.error(e);
      state.settings.scoreBasis = prev; invalidate();
      busy(false); refresh();
      toast(`환산 기준을 바꾸지 못했습니다: ${e.message}`, "bad", 6000);
      return;
    }
    persistSettings();
    const after = r?.analysis?.items?.map(it => f2(it.score100)) ?? null;
    const changed = before && after ? after.filter((v, i) => v !== before[i]).length : null;
    busy(false);
    refresh();
    busyDone(`환산 기준이 ‘${b.short}’으로 전환되었습니다.\n` + (changed === null ? (r ? "환산 점수가 새 기준으로 모두 다시 계산되었습니다." : "이후 분석하는 파일부터 이 기준이 적용됩니다.") : changed ? `문항 ${changed}개의 환산 점수가 다시 계산되었습니다.` : "이 파일은 환산 점수가 달라지는 문항이 없습니다."));
  },
};
