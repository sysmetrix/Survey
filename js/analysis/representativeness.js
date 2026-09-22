// 응답자 대표성 체크 — 담당자가 모집단 비율(예: 전체 대상자 성비)을 선택 입력하면
// 실제 응답자 분포와 비교해 편차를 보여준다. 입력이 없으면 계산하지 않는다(강제 아님).
import { naturalOrder } from "./items.js";

/**
 * @param survey  js/model/survey.js 인스턴스(values(key) 제공)
 * @param columns 코드북 열 배열 — role:'demographic'이고 popPct(카테고리→목표 비율%)가 있는 열만 사용
 * @returns [{key, label, n, rows:[{category, n, observedPct, popPct, diffPts}], maxDiff}]
 */
export function representativenessCheck(survey, columns) {
  const targets = (columns || []).filter(c => c.role === "demographic" && c.popPct && Object.keys(c.popPct).length);
  return targets.map(c => {
    const vals = survey.values(c.key).filter(v => v !== null);
    const n = vals.length;
    const names = [...new Set([...vals.map(String), ...Object.keys(c.popPct)])].sort(naturalOrder);
    const rows = names.map(name => {
      const obs = vals.filter(v => String(v) === name).length;
      const observedPct = n ? (obs / n) * 100 : NaN;
      const popPct = Number(c.popPct[name]);
      const hasTarget = Number.isFinite(popPct);
      return { category: name, n: obs, observedPct, popPct: hasTarget ? popPct : null, diffPts: hasTarget && Number.isFinite(observedPct) ? observedPct - popPct : null };
    });
    const maxDiff = Math.max(0, ...rows.map(r => Math.abs(r.diffPts ?? 0)));
    return { key: c.key, label: c.label, n, rows, maxDiff };
  }).filter(r => r.n);
}

/** 참고용 임계값: 이 %p를 넘으면 "표본이 모집단과 차이가 있어 해석 시 참고가 필요"로 안내 */
export const REP_DIFF_CAUTION = 10;
