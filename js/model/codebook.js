// 코드북: 열 역할·척도·영역·사전사후 짝·성과지표 연결 — 모든 분석의 기준
import { detectColumn, harmonizeScales, parseTime, shortLabel, gridParent, isOverallHeader, normKey } from "./detect.js";
import { LABEL_SETS, matchLabelSet, mapWithSet } from "./label-sets.js";
import { DEFAULT_YEAR_SCHEME } from "./year-bucket.js";
import { isBlank, hash } from "../core/util.js";

/**
 * 같은 계열 라벨(예: 동의형)을 쓰는 문항들을 모든 응답을 합쳐 한 척도로 통일
 * (한 문항에 '보통' 응답이 없어 5점/4점이 갈리는 문제 방지)
 */
function harmonizeLabelScales(columns, dataset) {
  const labeled = columns.filter(c => c.role === "likert" && c.labelSetId);
  const famOf = c => LABEL_SETS.find(s => s.id === c.labelSetId)?.family;
  const families = [...new Set(labeled.map(famOf).filter(Boolean))];
  for (const fam of families) {
    const group = labeled.filter(c => famOf(c) === fam);
    const valuesOf = c => dataset.sheets[c.sheet].rows.map(r => r[c.index]).filter(v => !isBlank(v));
    const union = matchLabelSet(group.flatMap(valuesOf), 0.8, LABEL_SETS.filter(s => s.family === fam));
    if (!union) continue;
    group.forEach(c => {
      if (c.labelSetId !== union.set.id) {
        const m = mapWithSet(valuesOf(c), union.set);
        if (m.size >= Object.keys(c.labelMap || {}).length) {
          c.labelSetId = union.set.id;
          c.labelMap = Object.fromEntries(m);
          c.scale = { min: union.set.min, max: union.set.max };
          c.detected.reason = `라벨(${union.set.name}) — 같은 보기를 쓰는 ${group.length}개 문항 기준`;
        }
      }
      c.labelAmbiguous = union.ambiguous;
    });
  }
}

export const CODEBOOK_VERSION = 1;

/** 시트 이름으로 역할 추정 */
export function sheetRole(name) {
  const s = String(name);
  if (/문항\s*정보|코드\s*북|codebook|변수\s*정보/i.test(s)) return "codebook";
  if (/사업\s*정보|사업\s*개요|논리\s*모형/.test(s)) return "business";
  if (/성과\s*지표|kpi|평가\s*지표/i.test(s)) return "kpi";
  if (/안내|설명|readme|작성\s*방법|도움말/i.test(s)) return "guide";
  if (/^\s*(사전|pre|사전\s*검사|사전\s*조사)/i.test(s)) return "pre";
  if (/^\s*(사후|post|사후\s*검사|사후\s*조사)/i.test(s)) return "post";
  return "data";
}

/**
 * 데이터셋에서 코드북 초안 생성
 * @param {{fileName:string, sheets:{name:string, headers:string[], rows:any[][]}[]}} dataset
 */
export function buildCodebook(dataset) {
  const roles = dataset.sheets.map(s => ({ name: s.name, role: sheetRole(s.name) }));
  const preIdx = roles.findIndex(r => r.role === "pre");
  const postIdx = roles.findIndex(r => r.role === "post");
  let responseSheets;
  if (preIdx >= 0 && postIdx >= 0) responseSheets = [preIdx, postIdx];
  else {
    const dataIdx = roles.findIndex(r => r.role === "data" && dataset.sheets[roles.indexOf(r)]?.rows.length);
    responseSheets = [dataIdx >= 0 ? dataIdx : 0];
  }

  const columns = [];
  responseSheets.forEach(si => {
    const sheet = dataset.sheets[si];
    const sheetTime = roles[si].role === "pre" ? "pre" : roles[si].role === "post" ? "post" : null;
    sheet.headers.forEach((header, ci) => {
      const vals = sheet.rows.map(r => r[ci]);
      const det = detectColumn(header, vals);
      const t = sheetTime ? { time: sheetTime, retrospective: false, pairKey: normKey(header) } : parseTime(header);
      const nums = vals.map(Number).filter(Number.isFinite);
      columns.push({
        key: `s${si}c${ci}`, sheet: si, index: ci, header: String(header), label: shortLabel(header),
        role: det.role, scale: det.scale || null, labelMap: det.labelMap || null, labelSetId: det.labelSetId || null, labelAmbiguous: !!det.labelAmbiguous,
        options: det.options || null, delimiter: det.delimiter || null,
        // 헤더에 역문항 표시가 있으면 역채점 (예: "…지루했다(역문항)", "(R)")
        reverse: det.role === "likert" && /역\s*문항|역\s*채점|\(R\)|\[R\]/i.test(header), missingCodes: [], valueLabels: null,
        domain: gridParent(header), competency: null,
        time: ["likert", "nps", "numeric"].includes(det.role) && t ? t.time : null,
        pairKey: ["likert", "nps", "numeric"].includes(det.role) && t ? t.pairKey : null,
        retrospective: !!t?.retrospective,
        isOverall: det.role === "likert" && isOverallHeader(header),
        pii: !!det.pii, kpiIds: [],
        observedMax: nums.length ? Math.max(...nums) : undefined,
        detected: { role: det.role, confidence: det.confidence, reason: det.reason, yearKind: det.yearKind || null },
        yearScheme: det.yearKind ? DEFAULT_YEAR_SCHEME[det.yearKind] : null,
        yearRefYear: null, // null = REF_YEAR(현재 연도) 사용
      });
    });
  });
  harmonizeScales(columns);
  harmonizeLabelScales(columns, dataset);
  columns.forEach(c => delete c.observedMax);

  // 사전/사후 시트는 동일 문항명(pairKey)끼리 짝, 척도가 아닌 열도 sheet 기준으로 구분
  const design = inferDesign(columns, responseSheets.length);
  // 영역: 그리드 상위 질문이 없으면 null (직원이 지정)
  const domains = [...new Set(columns.map(c => c.domain).filter(Boolean))].map((name, i) => ({ id: `D${i + 1}`, name }));
  columns.forEach(c => { if (c.domain) c.domain = domains.find(d => d.name === c.domain).id; });

  // ID 열 (사전/사후 매칭용)
  const idCols = responseSheets.map(si => columns.find(c => c.sheet === si && c.role === "id")?.key || null);

  return {
    version: CODEBOOK_VERSION,
    fileName: dataset.fileName,
    headersHash: hash(dataset.sheets.map(s => s.headers.join("")).join("")),
    sheets: roles, responseSheets, design,
    columns, domains,
    pairing: { idKeys: idCols, compositeKeys: [], confirmed: {} },
  };
}

function inferDesign(columns, nSheets) {
  if (nSheets === 2) return "prepost-sheets";
  const pre = new Set(columns.filter(c => c.time === "pre").map(c => c.pairKey));
  const post = columns.filter(c => c.time === "post" && pre.has(c.pairKey));
  if (!post.length) {
    columns.forEach(c => { c.time = null; c.pairKey = null; c.retrospective = false; });
    return "single";
  }
  return columns.some(c => c.retrospective && c.time) ? "retrospective" : "prepost-wide";
}

export const DESIGN_LABELS = {
  single: "단일 시점 조사",
  "prepost-wide": "사전·사후 (한 시트, 동일 응답자)",
  "prepost-sheets": "사전·사후 (시트 분리, ID 매칭)",
  retrospective: "회고식 사전·사후 (사후 시점에 이전/현재 응답)",
};

/** 사전·사후 문항 짝 목록 */
export function pairsOf(codebook) {
  const cols = codebook.columns.filter(c => ["likert", "nps", "numeric"].includes(c.role) && c.time);
  const pre = cols.filter(c => c.time === "pre");
  return pre.map(p => {
    const q = cols.find(c => c.time === "post" && c.pairKey === p.pairKey);
    return q ? { pairKey: p.pairKey, label: q.label || p.label, pre: p.key, post: q.key, domain: q.domain || p.domain } : null;
  }).filter(Boolean);
}

/** 만족도 등 단일 시점 척도 문항 (사전·사후 짝 문항은 성과 변화 분석으로 분리) */
export function scaleColumns(codebook) {
  const paired = new Set(codebook.design === "single" ? [] : pairsOf(codebook).flatMap(p => [p.pre, p.post]));
  return codebook.columns.filter(c => c.role === "likert" && !paired.has(c.key) && c.time !== "pre");
}

/** 코드북 검사 — 직원에게 보여줄 경고 */
export function lintCodebook(codebook) {
  const warn = [];
  const cols = codebook.columns;
  if (!cols.some(c => c.role === "likert" || c.role === "nps")) warn.push({ level: "error", msg: "척도 문항이 없습니다. 열 역할을 확인하세요." });
  cols.filter(c => c.role === "likert" && (!c.scale || c.scale.max <= c.scale.min)).forEach(c => warn.push({ level: "error", msg: `'${c.label}' 척도 범위가 올바르지 않습니다.` }));
  cols.filter(c => c.detected && c.detected.confidence < 0.6 && c.role === c.detected.role).forEach(c => warn.push({ level: "info", msg: `'${c.label}' 역할 판별이 불확실합니다 (${c.detected.reason}).` }));
  if (codebook.design === "prepost-sheets" && codebook.pairing.idKeys.some(k => !k) && !codebook.pairing.compositeKeys.length) {
    warn.push({ level: "warn", msg: "사전·사후 시트를 연결할 ID 열이 없습니다. ID 또는 이름+연락처 뒷자리 열을 지정하세요." });
  }
  if (codebook.design !== "single" && !pairsOf(codebook).length) warn.push({ level: "warn", msg: "사전·사후로 짝지어진 문항이 없습니다." });
  const amb = cols.filter(c => c.role === "likert" && c.labelAmbiguous);
  if (amb.length) warn.push({ level: "warn", msg: `'보통' 응답이 없어 4점/5점 척도가 불분명한 문항 ${amb.length}개(${amb.slice(0, 3).map(c => c.label).join(", ")}${amb.length > 3 ? " 등" : ""}): 설문지의 보기 수를 확인하고 필요하면 척도 범위와 '보기 점수'를 고치세요.` });
  const pii = cols.filter(c => c.pii);
  if (pii.length) warn.push({ level: "info", msg: `개인정보 추정 열 ${pii.length}개(${pii.map(c => c.label).join(", ")})는 분석에서 제외되며 화면에 마스킹됩니다.` });
  return warn;
}

/** 원자료 열 값 */
export function rawColumn(dataset, col) {
  return dataset.sheets[col.sheet].rows.map(r => (r[col.index] === undefined ? null : r[col.index]));
}

/** 저장된 코드북을 새 데이터셋에 적용 (헤더 텍스트 기준 재연결) */
export function applySavedCodebook(saved, dataset) {
  const fresh = buildCodebook(dataset);
  const byHeader = new Map(saved.columns.map(c => [`${saved.sheets[c.sheet]?.role}|${c.header}`, c]));
  let matched = 0;
  fresh.columns = fresh.columns.map(c => {
    const s = byHeader.get(`${fresh.sheets[c.sheet]?.role}|${c.header}`);
    if (!s) return c;
    matched++;
    const { key, sheet, index, header, detected } = c;
    return { ...s, key, sheet, index, header, detected };
  });
  fresh.domains = saved.domains || fresh.domains;
  fresh.design = saved.design || fresh.design;
  return { codebook: fresh, matched, total: fresh.columns.length };
}

export const isBlankRow = row => row.every(isBlank);
