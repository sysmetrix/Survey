// 청소년활동 표준 측정도구를 참고한 설문 측정 품질 점검
import { pairQuality } from "./pair-quality.js";
export function measurementQuality(codebook, analysis = null) {
  if (!codebook) return [];
  const out = pairQuality(codebook.columns || []);
  const cols = codebook.columns || [];
  if (analysis?.prepost?.qualityIssues) for (const issue of analysis.prepost.qualityIssues) if (!out.some(x=>x.code===issue.code && JSON.stringify(x.keys)===JSON.stringify(issue.keys))) out.push(issue);
  if (codebook.instrument && (!codebook.instrument.version || !codebook.instrument.source || !codebook.instrument.ageGroup)) out.push({level:"info",code:"instrument-unconfirmed",msg:"측정도구 버전·출처·적용 대상 중 미확인 정보가 있습니다. 경고 유무는 타당성 검증을 의미하지 않습니다."});
  const pairs = cols.filter(c => c.time === "pre").map(pre => ({ pre, post: cols.find(c => c.time === "post" && c.pairKey === pre.pairKey) })).filter(x => x.post);
  if (codebook.design !== "single" && !pairs.length) out.push({ level: "error", code: "prepost-missing", msg: "사전·사후 문항 짝을 찾지 못했습니다. 문항명·시점 표기 또는 대상 문항을 확인하세요." });
  const incomplete = cols.filter(c => c.time === "pre" && !cols.some(p => p.time === "post" && p.pairKey === c.pairKey));
  if (incomplete.length) out.push({ level: "warn", code: "prepost-unpaired", msg: `사후 문항이 없는 사전 문항 ${incomplete.length}개가 있어 변화 분석에서 제외될 수 있습니다.` });
  const scales = cols.filter(c => c.role === "likert");
  const badScale = scales.filter(c => !c.scale || !Number.isFinite(c.scale.min) || !Number.isFinite(c.scale.max) || c.scale.max <= c.scale.min);
  if (badScale.length) out.push({ level: "error", code: "scale-invalid", msg: `척도 범위가 확인되지 않은 문항 ${badScale.length}개가 있습니다.` });
  const domains = new Map();
  scales.filter(c => c.domain).forEach(c => {
    if (!domains.has(c.domain)) domains.set(c.domain, new Set());
    domains.get(c.domain).add(c.pairKey || c.key);
  });
  if ([...domains.values()].some(items => items.size < 2)) out.push({ level: "info", code: "domain-small", msg: "일부 영역은 한 문항으로 구성되어 내적 일관성 신뢰도를 산출할 수 없습니다." });
  if (analysis?.prepost?.matchedN !== undefined && analysis.prepost.matchedN < 10) out.push({ level: "warn", code: "small-prepost", msg: `사전·사후 매칭 응답자가 ${analysis.prepost.matchedN}명입니다. 변화 결과는 참고용으로 해석하세요.` });
  return out;
}

export const measurementQualityLabel = { error: "계산 불가", warn: "해석 주의", info: "정보 미확인" };
