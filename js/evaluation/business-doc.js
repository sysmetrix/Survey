// HWPX 사업 운영계획서(본문 문단·표) → 사업정보·논리모형·성과지표 초안
// 표는 엑셀 사업정보/성과지표 시트와 같은 모양이면 그대로 재사용하고, 표가 없거나 부족한 부분은
// 제목줄(Ⅰ./□/1. 등) 기반 문단 스캐너로 보강한다. 결과는 항상 '초안'이며 사용자 확인이 필요하다.
import { LIST_KEYS, matchItemKey, parseBusinessSheet, parseKpiSheet } from "./business-sheet.js";
import { LOGIC_STAGES, emptyLogicModel, normalizeLogicModel, hasLogicModel, hasProgramInfo } from "./logic-model.js";

export const SCALAR_KEYS = ["programName", "period", "budget", "target", "department", "purpose", "background"];
const KPI_HEADER_HINTS = [/지표명|성과지표$|지표$/, /단계/, /목표값|목표치|^목표$/, /실적값|실적/];
const FIELD_LABELS = { programName: "사업명", period: "사업기간", budget: "사업예산", target: "참여대상", department: "추진부서", purpose: "사업목적", background: "추진배경", goals: "추진목표" };

/** 필드에 값이 채워져 있는지(배열은 길이, 그 외는 참값) */
export const fieldFilled = (lm, k) => (Array.isArray(lm[k]) ? lm[k].length > 0 : !!lm[k]);
const previewValue = (lm, k) => (k === "goals" ? lm.goals.map(g => g.text).join(", ") : Array.isArray(lm[k]) ? lm[k].join(", ") : String(lm[k]));

/** 표가 항목/내용류(사업정보)인지, KPI형(성과지표)인지 판별. 둘 다 아니면 null(일정표 등 무시) */
function classifyTable(t) {
  const hs = (t.headers || []).map(h => String(h ?? "").replace(/\s/g, ""));
  if (KPI_HEADER_HINTS.filter(re => hs.some(h => re.test(h))).length >= 2) return "kpi";
  const allRows = [t.headers || [], ...(t.rows || [])];
  const threshold = (t.headers?.length || 0) <= 2 ? 1 : 2; // 항목/내용 2열 표는 한 줄만 맞아도 인정(작은 표 여러 개로 나뉜 계획서 대비)
  let matches = 0;
  for (const r of allRows) {
    if (r.slice(0, 2).some(cell => cell && matchItemKey(String(cell).trim()))) matches++;
    if (matches >= threshold) return "business";
  }
  return null;
}

/** 로마숫자·"제N장/절" 등 명확한 장 제목 마커만 제거(번호·기호 목록은 내용으로도 흔히 쓰이므로 제외) */
function stripStrongHeadingMarker(line) {
  return line
    .replace(/^[ⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩ]+\s*[.\):]?\s*/, "")
    .replace(/^제\s*\d+\s*[장절]\s*[.\):]?\s*/, "")
    .trim();
}

/** 문단 제목줄 앞의 번호·기호(Ⅰ./제1장/1./□ 등) 모두 제거 */
function stripHeadingMarker(line) {
  return stripStrongHeadingMarker(line)
    .replace(/^\d{1,2}\s*[.\)]\s*/, "")
    .replace(/^[□■○●▪◦·\-]\s*/, "")
    .trim();
}

/**
 * 제목줄인지 판별. { key } = 논리모형 키로 인식됨, { reset:true } = 로마숫자·"제N장/절"처럼 명확한
 * 장 제목인데 어떤 키에도 안 맞음(예: "Ⅲ. 붙임") → 이후 줄을 이전 키에 잘못 붙이지 않도록 귀속 해제.
 * 숫자·□○ 등은 본문 목록에도 흔히 쓰이므로, 매치 안 되면 그냥 일반 문장으로 취급(귀속 해제 안 함).
 */
function headingKeyOrReset(line) {
  if (line.length > 40) return {};
  const stripped = stripHeadingMarker(line);
  const hadMarker = stripped !== line;
  // 마커(로마숫자·번호·기호) 없이 원문 그대로인 문장은 라벨처럼 아주 짧을 때만 제목으로 인정(긴 문장이 우연히
  // "배경"·"목표" 등을 포함해 오인식되는 것을 방지)
  const maxLen = hadMarker ? 20 : 10;
  if (stripped && stripped.length <= maxLen) {
    const key = matchItemKey(stripped);
    if (key) return { key };
  }
  return { reset: stripStrongHeadingMarker(line) !== line };
}

/** 표가 없거나 부족할 때: 제목줄 기반으로 문단을 논리모형 키에 배분 (정규화 전 raw 객체 반환) */
export function logicModelFromParagraphs(paragraphs) {
  const lm = {};
  let currentKey = null, buffer = [];
  const flush = () => {
    if (currentKey && buffer.length) {
      if (LIST_KEYS.has(currentKey)) {
        lm[currentKey] = lm[currentKey] || [];
        buffer.forEach(line => {
          const cleaned = line.replace(/^\s*[-•·□○\d.)]+\s*/, "").trim();
          if (cleaned) lm[currentKey].push(cleaned);
        });
      } else if (!lm[currentKey]) {
        lm[currentKey] = buffer.join(" ").trim();
      }
    }
    buffer = [];
  };
  for (const raw of paragraphs) {
    const line = String(raw ?? "").trim();
    if (!line) continue;
    const { key, reset } = headingKeyOrReset(line);
    if (key) { flush(); currentKey = key; continue; }
    if (reset) { flush(); currentKey = null; continue; }
    if (currentKey && line.length > 6) buffer.push(line);
  }
  flush();
  if (lm.goals) lm.goals = lm.goals.map((g, i) => ({ id: `G${i + 1}`, text: g }));
  return lm;
}

/** current(정규화됨)의 빈 칸만 draft(정규화됨)의 값으로 채운 새 논리모형을 반환. 이미 채워진 값은 절대 덮지 않음 */
export function mergeIntoLogicModel(current, draft) {
  const out = { ...(current || emptyLogicModel()) };
  if (!draft) return out;
  SCALAR_KEYS.forEach(k => { if (!out[k] && draft[k]) out[k] = draft[k]; });
  LOGIC_STAGES.forEach(s => { if (!out[s.key]?.length && draft[s.key]?.length) out[s.key] = draft[s.key]; });
  if (!out.goals?.length && draft.goals?.length) out.goals = draft.goals;
  return out;
}

/** 성과지표 초안에 '자동 추출 — 확인 필요' 표시를 붙인 새 배열 반환(원본 불변) */
export function tagDraftKpis(kpis) {
  return (kpis || []).map(k => ({ ...k, note: `문서에서 자동 추출 — 확인 필요${k.note ? " · " + k.note : ""}` }));
}

/**
 * HWPX 본문(문단·표)에서 사업정보·논리모형·성과지표 초안을 추출한다.
 * @param {{paragraphs: string[], tables: {headers:string[], rows:string[][]}[]}} doc
 * @returns {{logicModel: object|null, kpis: object[]|null, found: {business:boolean, kpi:boolean}}}
 */
export function readBusinessFromHwpx({ paragraphs, tables }) {
  const bizTables = tables.filter(t => classifyTable(t) === "business");
  const kpiTables = tables.filter(t => classifyTable(t) === "kpi");

  const fromTables = bizTables.map(parseBusinessSheet).reduce((acc, lm) => mergeIntoLogicModel(acc, lm), emptyLogicModel());
  const fromParagraphs = normalizeLogicModel(logicModelFromParagraphs(paragraphs));
  const merged = normalizeLogicModel(mergeIntoLogicModel(fromTables, fromParagraphs));
  const logicModel = hasProgramInfo(merged) || hasLogicModel(merged) ? merged : null;

  const kpis = kpiTables.flatMap(t => parseKpiSheet(t, logicModel));
  return { logicModel, kpis: kpis.length ? kpis : null, found: { business: !!logicModel, kpi: kpis.length > 0 } };
}

const STAGE_LABELS = Object.fromEntries(LOGIC_STAGES.map(s => [s.key, s.label]));

/**
 * 병합 전에 실제로 무엇이 새로 채워지고 무엇이 추가될지 미리보기 — 상태를 바꾸지 않는 순수 함수.
 * @param {object} current 현재 state.logicModel(정규화됨)
 * @param {{logicModel: object|null, kpis: object[]|null}} draft readBusinessFromHwpx 결과
 * @returns {{fields: {key:string, label:string, value:string}[], kpis: {name:string, stage:string, target:number|null, unit:string}[], merged: object}}
 */
export function previewPlanDocDraft(current, draft) {
  const before = normalizeLogicModel(current || emptyLogicModel());
  const merged = draft?.logicModel ? mergeIntoLogicModel(before, draft.logicModel) : before;
  const keys = [...SCALAR_KEYS, "goals", ...LOGIC_STAGES.map(s => s.key)];
  const fields = keys
    .filter(k => !fieldFilled(before, k) && fieldFilled(merged, k))
    .map(k => ({ key: k, label: FIELD_LABELS[k] || STAGE_LABELS[k] || k, value: previewValue(merged, k) }));
  const kpis = (draft?.kpis || []).map(k => ({ name: k.name, stage: k.stage, target: k.target, unit: k.unit }));
  return { fields, kpis, merged };
}
