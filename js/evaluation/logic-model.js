// 사업 논리모형 (투입 → 활동 → 산출 → 성과(단기·중기) → 영향)

export const LOGIC_STAGES = [
  { key: "inputs", label: "투입", hint: "예산, 인력, 시설, 협력기관" },
  { key: "activities", label: "활동", hint: "프로그램 운영 내용 (회차·인원)" },
  { key: "outputs", label: "산출", hint: "활동의 직접 결과: 운영 횟수, 참여 인원, 수료자 수" },
  { key: "outcomesShort", label: "단기성과", hint: "참여 직후 변화: 지식·태도·역량, 만족" },
  { key: "outcomesMid", label: "중기성과", hint: "행동 변화: 진로 계획 수립, 활동 지속" },
  { key: "impact", label: "영향", hint: "장기·지역사회 변화" },
];

export const KPI_STAGES = ["산출", "단기성과", "중기성과", "영향"];

export function emptyLogicModel() {
  return {
    programName: "", period: "", budget: "", target: "", department: "",
    purpose: "", background: "",
    goals: [],             // [{id:'G1', text}]
    inputs: [], activities: [], outputs: [], outcomesShort: [], outcomesMid: [], impact: [], // 문자열 배열
  };
}

const arr = v => (Array.isArray(v) ? v : v ? [v] : []).map(x => String(x).trim()).filter(Boolean);

/** 누락 필드 보정·ID 부여 */
export function normalizeLogicModel(lm = {}) {
  const base = emptyLogicModel();
  const out = { ...base, ...lm };
  LOGIC_STAGES.forEach(s => { out[s.key] = arr(lm[s.key]); });
  out.goals = (lm.goals || []).map((g, i) => (typeof g === "string" ? { id: `G${i + 1}`, text: g } : { id: g.id || `G${i + 1}`, text: String(g.text || "").trim() })).filter(g => g.text);
  ["programName", "period", "budget", "target", "department", "purpose", "background"].forEach(k => { out[k] = String(out[k] ?? "").trim(); });
  return out;
}

export const hasLogicModel = lm => !!lm && (LOGIC_STAGES.some(s => lm[s.key]?.length) || lm.goals?.length > 0);
export const hasProgramInfo = lm => !!lm && !!(lm.programName || lm.purpose || lm.period || lm.target);
