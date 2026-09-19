// 엑셀 '사업정보'·'성과지표' 시트 → 논리모형·KPI
import { isBlank } from "../core/util.js";
import { normalizeLogicModel, KPI_STAGES } from "./logic-model.js";
import { metricFromText } from "./kpi.js";

export const ITEM_MAP = [
  [/^사업\s*명|프로그램\s*명/, "programName"], [/사업\s*기간|운영\s*기간|기간/, "period"], [/예산|사업비/, "budget"],
  [/대상|참여\s*대상/, "target"], [/담당|부서/, "department"], [/목적/, "purpose"], [/배경|필요성/, "background"],
  [/추진\s*목표|목표/, "goals"], [/투입/, "inputs"], [/활동/, "activities"], [/산출/, "outputs"],
  [/단기\s*성과/, "outcomesShort"], [/중기\s*성과/, "outcomesMid"], [/영향|장기\s*성과|임팩트/, "impact"],
];
export const LIST_KEYS = new Set(["goals", "inputs", "activities", "outputs", "outcomesShort", "outcomesMid", "impact"]);

/** 항목 라벨(칸 값·문단 제목줄 공통) → 논리모형 키 */
export function matchItemKey(text) {
  const hit = ITEM_MAP.find(([re]) => re.test(text));
  return hit ? hit[1] : null;
}

/** 사업정보 시트: [구분, 항목, 내용, 비고] 또는 [항목, 내용] */
export function parseBusinessSheet(sheet) {
  const hs = sheet.headers.map(h => String(h));
  let iItem = hs.findIndex(h => /항목|구분명|요소/.test(h));
  let iVal = hs.findIndex(h => /내용|값|설명/.test(h));
  if (iItem < 0 || iVal < 0) { iItem = hs.length >= 3 ? 1 : 0; iVal = iItem + 1; }
  const lm = {};
  // 헤더 자체가 데이터인 경우(헤더 없음) 대비: 헤더 행도 검사
  const rows = [hs, ...sheet.rows];
  rows.forEach(r => {
    const item = String(r[iItem] ?? "").trim(), val = r[iVal];
    if (!item || isBlank(val)) return;
    const key = matchItemKey(item);
    if (!key) return;
    const text = String(val).trim();
    if (LIST_KEYS.has(key)) {
      lm[key] = lm[key] || [];
      text.split(/\n+/).map(s => s.replace(/^\s*[-•·□○\d.)]+\s*/, "").trim()).filter(Boolean).forEach(s => lm[key].push(s));
    } else if (!lm[key]) lm[key] = text;
  });
  if (lm.goals) lm.goals = lm.goals.map((g, i) => ({ id: `G${i + 1}`, text: g }));
  return normalizeLogicModel(lm);
}

/** 성과지표 시트 (열 이름 유연 인식) */
export function parseKpiSheet(sheet, logicModel) {
  const hs = sheet.headers.map(h => String(h).replace(/\s/g, ""));
  const col = re => hs.findIndex(h => re.test(h));
  const c = {
    id: col(/지표id|지표번호|^id$|번호/i), name: col(/지표명|성과지표$|지표$/), stage: col(/단계/), goal: col(/연계목표|목표명|추진목표/),
    method: col(/측정방법|측정방식|산출방식|설문지표/), target: col(/목표값|목표치|^목표$/), actual: col(/실적값|실적/),
    ref: col(/대상문항|문항|영역/), dir: col(/방향/), unit: col(/단위/), note: col(/산식|비고|측정도구/),
  };
  const goals = logicModel?.goals || [];
  return sheet.rows.map((r, i) => {
    const get = k => (c[k] >= 0 ? r[c[k]] : null);
    const name = String(get("name") ?? "").trim();
    if (!name) return null;
    const goalText = String(get("goal") ?? "").trim();
    const goal = goals.find(g => g.id === goalText || (goalText && (g.text.includes(goalText) || goalText.includes(g.text))));
    const stageRaw = String(get("stage") ?? "");
    const stage = KPI_STAGES.find(s => stageRaw.replace(/\s/g, "").includes(s)) || (/산출/.test(stageRaw) ? "산출" : "단기성과");
    const num = v => (isBlank(v) ? null : Number(String(v).replace(/[,%점명회]/g, "")));
    return {
      id: String(get("id") ?? `K${i + 1}`).trim() || `K${i + 1}`, name, stage, goalId: goal ? goal.id : "",
      metric: metricFromText(get("method")), targetRef: String(get("ref") ?? "").trim(),
      target: num(get("target")), actual: num(get("actual")),
      direction: /하향|감소|낮을/.test(String(get("dir") ?? "")) ? "down" : "up",
      unit: String(get("unit") ?? "").trim(), note: String(get("note") ?? "").trim(),
    };
  }).filter(Boolean);
}

/** 데이터셋에서 사업정보/성과지표 시트 자동 인식 */
export function readBusinessFromDataset(dataset, codebook) {
  const find = role => dataset.sheets.find((s, i) => codebook.sheets[i]?.role === role);
  const bs = find("business"), ks = find("kpi");
  const logicModel = bs ? parseBusinessSheet(bs) : null;
  const kpis = ks ? parseKpiSheet(ks, logicModel) : null;
  return { logicModel, kpis, found: { business: !!bs, kpi: !!ks } };
}
