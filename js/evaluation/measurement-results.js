import { measurementQuality } from "./measurement-quality.js";

/** 화면·보고서·발표자료가 공유하는 측정 결과. 미측정 영역을 0으로 만들지 않는다. */
export function measurementResults(analysis, codebook) {
  return {
    calculationVersion: "2",
    scoring: "동일 척도, 개인별 양 시점 공통 문항 절반 이상 응답 시 평균",
    limitation: "대조군 없는 참여 전후의 관찰된 변화이며 사업의 인과적 효과로 단정할 수 없습니다.",
    domains: (analysis.prepost?.domains || []).filter(d => d.id !== "ALL").map(d => ({
      id: d.id, name: d.name, n: d.n, nItems: d.nItems, pre: d.mPre, post: d.mPost, diff: d.diff, effect: d.dz,
    })),
    issues: measurementQuality(codebook, analysis),
    improvements: (codebook.improvements || []).map(task => ({
      id: task.id, evidence: String(task.evidence || ""), action: String(task.action || ""),
      owner: String(task.owner || ""), reviewDate: String(task.reviewDate || ""),
    })),
  };
}
