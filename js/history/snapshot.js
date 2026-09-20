// 작업 내역(버전) 스냅샷 — 순수 모듈 (DOM·IndexedDB 비의존)
// 원자료(응답 데이터)는 포함하지 않는다. 편집 가능한 설정만 담아 되돌리기·버전 비교·복원에 사용.
import { ROLES } from "../model/detect.js";

export const SETTINGS_KEYS = ["orgName", "author", "reportTitle", "date", "thresholds", "scoreBasis", "fontPreset", "fontBody", "fontHeading", "baseSize", "lineSpacing"];

/** 상태 → 편집 가능한 값만 복제 */
export function captureEditable(state) {
  const s = state.settings || {};
  return JSON.parse(JSON.stringify({
    codebook: state.codebook || null,
    logicModel: state.logicModel || null,
    kpis: state.kpis || [],
    overrides: state.overrides || {},
    overrideBase: state.overrideBase || {},
    hidden: state.hidden || [],
    hiddenChapters: state.hiddenChapters || [],
    deckHidden: state.deckHidden || [],
    deckOverrides: state.deckOverrides || { bySlide: {} },
    excludeStraight: !!state.excludeStraight,
    settings: Object.fromEntries(SETTINGS_KEYS.filter(k => s[k] !== undefined).map(k => [k, s[k]])),
  }));
}

/** 키 순서와 무관한 JSON 문자열 (내용 비교·해시용) */
export function stableStringify(v) {
  if (v === null || typeof v !== "object") return JSON.stringify(v ?? null);
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(",")}]`;
  return `{${Object.keys(v).filter(k => v[k] !== undefined).sort().map(k => `${JSON.stringify(k)}:${stableStringify(v[k])}`).join(",")}}`;
}

/** 빠른 내용 해시 (중복 저장 방지용, 보안 목적 아님) — FNV-1a 32bit × 2 */
export function contentHash(str) {
  let h1 = 0x811c9dc5, h2 = 0x01000193 ^ 0x9e3779b9;
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ c, 0x5bd1e995) >>> 0;
  }
  return h1.toString(16).padStart(8, "0") + h2.toString(16).padStart(8, "0");
}

/** 같은 설문(열 구성)끼리 한 프로젝트로 묶음 */
export const projectIdOf = codebook => (codebook?.headersHash ? `p-${codebook.headersHash}` : null);

/** 목록에 보여줄 요약 */
export function summarize(state, results = null) {
  const A = results?.analysis, E = results?.evaluation;
  const sat = A ? (A.overallItem?.score100 ?? A.total?.score100) : null;
  return {
    fileName: state.dataset?.fileName || state.codebook?.fileName || "",
    programName: state.logicModel?.programName || "",
    reportTitle: state.settings?.reportTitle || "",
    design: state.codebook?.design || null,
    n: A?.meta?.n ?? null,
    kpi: E?.summary ? `${E.summary.achieved}/${E.summary.measured}` : null,
    grade: E?.summary?.grade || null,
    sat: Number.isFinite(sat) ? Math.round(sat * 10) / 10 : null,
    edits: Object.keys(state.overrides || {}).length,
  };
}

const ROLE = r => ROLES[r] || r || "-";
const q = s => `‘${s}’`;
const short = (s, n = 24) => (String(s ?? "").length > n ? String(s).slice(0, n - 1) + "…" : String(s ?? ""));
const same = (a, b) => stableStringify(a) === stableStringify(b);

/**
 * 두 스냅샷의 차이 (older → newer)
 * @returns {{area:string, items:string[]}[]}
 */
export function diffEditable(older, newer) {
  const out = [];
  const add = (area, text) => {
    let g = out.find(x => x.area === area);
    if (!g) out.push((g = { area, items: [] }));
    g.items.push(text);
  };
  const a = older || {}, b = newer || {};

  const ca = a.codebook, cbk = b.codebook;
  if (ca && cbk) {
    if (ca.design !== cbk.design) add("데이터 설정", `조사 설계 변경`);
    const old = new Map((ca.columns || []).map(c => [`${c.sheet}|${c.header}`, c]));
    const domName = (cb, id) => cb.domains?.find(d => d.id === id)?.name || "없음";
    for (const c of cbk.columns || []) {
      const o = old.get(`${c.sheet}|${c.header}`);
      if (!o) continue;
      const name = q(short(c.label));
      if (o.label !== c.label) add("데이터 설정", `표시 이름 ${q(short(o.label))} → ${name}`);
      if (o.role !== c.role) add("데이터 설정", `${name} 역할: ${ROLE(o.role)} → ${ROLE(c.role)}`);
      if (!same(o.scale, c.scale) && c.scale) add("데이터 설정", `${name} 척도 ${o.scale?.min ?? "?"}~${o.scale?.max ?? "?"} → ${c.scale.min}~${c.scale.max}`);
      if (!!o.reverse !== !!c.reverse) add("데이터 설정", `${name} 역문항 ${c.reverse ? "지정" : "해제"}`);
      if (domName(ca, o.domain) !== domName(cbk, c.domain)) add("데이터 설정", `${name} 영역: ${domName(ca, o.domain)} → ${domName(cbk, c.domain)}`);
      if ((o.time || null) !== (c.time || null)) add("데이터 설정", `${name} 시점 변경`);
      if (!!o.isOverall !== !!c.isOverall) add("데이터 설정", `${name} 전반 만족 문항 ${c.isOverall ? "지정" : "해제"}`);
      if (!same(o.labelMap, c.labelMap)) add("데이터 설정", `${name} 보기 점수 변경`);
    }
    if (!same(ca.pairing?.confirmed, cbk.pairing?.confirmed)) add("데이터 설정", "사전·사후 매칭 확정 변경");
  }
  if (!!a.excludeStraight !== !!b.excludeStraight) add("데이터 설정", `불성실 응답 ${b.excludeStraight ? "제외" : "포함"}`);

  const ka = new Map((a.kpis || []).map(k => [k.id, k])), kb = new Map((b.kpis || []).map(k => [k.id, k]));
  for (const [id, k] of kb) {
    const o = ka.get(id);
    if (!o) add("성과지표", `추가: ${q(short(k.name || id))}`);
    else if (!same(o, k)) {
      const f = ["name", "target", "actual", "metric", "targetRef", "direction", "unit", "stage", "goalId"].filter(x => !same(o[x], k[x]));
      add("성과지표", `${q(short(k.name || id))}: ${f.map(x => ({ name: "이름", target: `목표 ${o.target ?? "-"}→${k.target ?? "-"}`, actual: `실적 ${o.actual ?? "-"}→${k.actual ?? "-"}`, metric: "측정 방법", targetRef: "대상", direction: "방향", unit: "단위", stage: "단계", goalId: "연계 목표" }[x])).join(", ")}`);
    }
  }
  for (const [id, k] of ka) if (!kb.has(id)) add("성과지표", `삭제: ${q(short(k.name || id))}`);

  const la = a.logicModel || {}, lb = b.logicModel || {};
  const LM_LABEL = { programName: "사업명", period: "사업기간", target: "참여대상", budget: "사업예산", department: "추진부서", background: "추진배경", purpose: "사업목적", goals: "추진목표", inputs: "투입", activities: "활동", outputs: "산출", outcomesShort: "단기성과", outcomesMid: "중기성과", impact: "영향" };
  const lmChanged = [...new Set([...Object.keys(la), ...Object.keys(lb)])].filter(k => !same(la[k], lb[k]));
  if (lmChanged.length) add("사업정보", `${lmChanged.map(k => LM_LABEL[k] || k).join(", ")} 변경`);

  const oa = a.overrides || {}, ob = b.overrides || {};
  const addedO = Object.keys(ob).filter(k => !(k in oa)), removedO = Object.keys(oa).filter(k => !(k in ob)), changedO = Object.keys(ob).filter(k => k in oa && oa[k] !== ob[k]);
  if (addedO.length) add("보고서 문장", `직접 수정 ${addedO.length}건`);
  if (changedO.length) add("보고서 문장", `수정 문장 다시 고침 ${changedO.length}건`);
  if (removedO.length) add("보고서 문장", `자동 문장으로 되돌림 ${removedO.length}건`);
  const diffSet = (x, y, label) => {
    const sx = new Set(x || []), sy = new Set(y || []);
    const plus = [...sy].filter(v => !sx.has(v)).length, minus = [...sx].filter(v => !sy.has(v)).length;
    if (plus) add("보고서 구성", `${label} ${plus}개 숨김`);
    if (minus) add("보고서 구성", `${label} ${minus}개 다시 표시`);
  };
  diffSet(a.hidden, b.hidden, "문장");
  diffSet(a.hiddenChapters, b.hiddenChapters, "장");
  diffSet(a.deckHidden, b.deckHidden, "발표 슬라이드");
  const da = a.deckOverrides?.bySlide || {}, db = b.deckOverrides?.bySlide || {};
  const editedSlides = [...new Set([...Object.keys(da), ...Object.keys(db)])].filter(id => !same(da[id], db[id])).length;
  if (editedSlides) add("발표 슬라이드", `문구 편집 ${editedSlides}개`);

  const sa = a.settings || {}, sb = b.settings || {};
  const SET_LABEL = { orgName: "기관·부서명", author: "담당자명", reportTitle: "보고서 제목", date: "작성일", thresholds: "판정 기준", scoreBasis: "100점 환산 기준", fontPreset: "글꼴", fontBody: "본문 글꼴", fontHeading: "제목 글꼴", baseSize: "글자 크기", lineSpacing: "줄 간격" };
  const setChanged = SETTINGS_KEYS.filter(k => !same(sa[k], sb[k]));
  if (setChanged.length) add("보고서 설정", `${setChanged.map(k => SET_LABEL[k]).join(", ")} 변경`);
  return out;
}

export const diffCount = groups => groups.reduce((s, g) => s + g.items.length, 0);

/**
 * 보관 규칙: 고정(pin)·직접 저장한 버전은 유지, 자동 저장은 최근 maxAuto 개와 maxAgeDays 이내만 유지, 가장 최근 버전은 항상 유지
 * @param {{id:string, kind:string, createdAt:number, pinned?:boolean}[]} snaps  한 프로젝트의 스냅샷
 * @returns {string[]} 삭제할 id
 */
export function planRetention(snaps, { maxAuto = 30, maxAgeDays = 90, now = Date.now() } = {}) {
  const remove = new Set();
  const autos = snaps.filter(s => s.kind === "auto" && !s.pinned).sort((x, y) => y.createdAt - x.createdAt);
  autos.slice(maxAuto).forEach(s => remove.add(s.id));
  const cutoff = now - maxAgeDays * 86400000;
  snaps.filter(s => !s.pinned && s.kind !== "manual" && s.createdAt < cutoff).forEach(s => remove.add(s.id));
  const newest = [...snaps].sort((x, y) => y.createdAt - x.createdAt)[0];
  if (newest) remove.delete(newest.id);
  return [...remove];
}

export const KIND_LABEL = { auto: "자동 저장", manual: "직접 저장", load: "파일 불러옴", export: "한글 파일 내보냄", restore: "복원 직전", v4: "이전 버전(v4) 기록" };
