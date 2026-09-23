// 청소년활동 표준 측정도구를 참고한 설문 측정 품질 점검
export function measurementQuality(codebook, analysis = null) {
  if (!codebook) return [];
  const out = [];
  const cols = codebook.columns || [];
  const pairs = cols.filter(c => c.time === "pre").map(pre => ({ pre, post: cols.find(c => c.time === "post" && c.pairKey === pre.pairKey) })).filter(x => x.post);
  if (codebook.design !== "single" && !pairs.length) out.push({ level: "error", code: "prepost-missing", msg: "사전·사후 문항 짝을 찾지 못했습니다. 문항명·시점 표기 또는 대상 문항을 확인하세요." });
  const incomplete = cols.filter(c => c.time === "pre" && !cols.some(p => p.time === "post" && p.pairKey === c.pairKey));
  if (incomplete.length) out.push({ level: "warn", code: "prepost-unpaired", msg: `사후 문항이 없는 사전 문항 ${incomplete.length}개가 있어 변화 분석에서 제외될 수 있습니다.` });
  const scales = cols.filter(c => c.role === "likert");
  const badScale = scales.filter(c => !c.scale || !Number.isFinite(c.scale.min) || !Number.isFinite(c.scale.max) || c.scale.max <= c.scale.min);
  if (badScale.length) out.push({ level: "error", code: "scale-invalid", msg: `척도 범위가 확인되지 않은 문항 ${badScale.length}개가 있습니다.` });
  const domains = new Map();
  scales.forEach(c => domains.set(c.domain || "NONE", (domains.get(c.domain || "NONE") || 0) + 1));
  if (scales.length && [...domains.values()].some(n => n < 2)) out.push({ level: "info", code: "domain-small", msg: "일부 영역의 문항 수가 1개입니다. 영역 점수와 신뢰도 해석에 주의하세요." });
  if (analysis?.prepost?.matchedN !== undefined && analysis.prepost.matchedN < 10) out.push({ level: "warn", code: "small-prepost", msg: `사전·사후 매칭 응답자가 ${analysis.prepost.matchedN}명입니다. 변화 결과는 참고용으로 해석하세요.` });
  return out;
}

export const measurementQualityLabel = { error: "확인 필요", warn: "주의", info: "참고" };
