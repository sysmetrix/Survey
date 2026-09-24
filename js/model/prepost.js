// 사전·사후 시트 응답자 매칭 (ID 정확 매칭 + 퍼지 후보 제시 — 자동 확정하지 않음)
import { isBlank, editDistance } from "../core/util.js";

/** 매칭 키 정규화: 공백·하이픈 제거, 전각→반각, 소문자 */
export function normId(v) {
  if (isBlank(v)) return "";
  return String(v).normalize("NFKC").replace(/[\s\-_.()]/g, "").toLowerCase();
}
export const phoneLast4 = v => { const d = String(v ?? "").replace(/\D/g, ""); return d.length >= 4 ? d.slice(-4) : ""; };

/**
 * @param {object} dataset
 * @param {object} codebook  design === "prepost-sheets"
 * @returns {{pairs:{pre:number, post:number, how:string}[], preOnly:number[], postOnly:number[], dupPre:number, dupPost:number, candidates:{pre:number, post:number, reason:string}[], keyDesc:string}}
 */
export function matchPrePost(dataset, codebook) {
  const [preSi, postSi] = codebook.responseSheets;
  const preRows = dataset.sheets[preSi]?.rows, postRows = dataset.sheets[postSi]?.rows;
  // 잘못 저장된 이전 코드북이나 화면 조작이 있어도 'undefined.rows' 예외로 화면 전체가 멈추지 않게 한다.
  if (!Array.isArray(preRows) || !Array.isArray(postRows)) {
    return { pairs: [], preOnly: [], postOnly: [], dupPre: 0, dupPost: 0, candidates: [], keyDesc: "사전·사후 응답 시트 2개 필요" };
  }
  const colOf = key => codebook.columns.find(c => c.key === key);
  const { idKeys = [], compositeKeys = [], confirmed = {} } = codebook.pairing || {};

  let keyFns, keyDesc;
  if (idKeys[0] && idKeys[1]) {
    const a = colOf(idKeys[0]), b = colOf(idKeys[1]);
    keyFns = [r => normId(r[a.index]), r => normId(r[b.index])];
    keyDesc = `'${a.label}' 열 일치`;
  } else if (compositeKeys.length) {
    const parts = compositeKeys.map(k => ({ a: colOf(k.pre), b: colOf(k.post), kind: k.kind }));
    const f = (row, side) => parts.map(p => { const v = row[(side === 0 ? p.a : p.b).index]; return p.kind === "phone4" ? phoneLast4(v) : normId(v); }).join("|");
    keyFns = [r => f(r, 0), r => f(r, 1)];
    keyDesc = parts.map(p => (p.kind === "phone4" ? `${p.a.label}(뒤4자리)` : p.a.label)).join("+");
  } else {
    return { pairs: [], preOnly: preRows.map((_, i) => i), postOnly: postRows.map((_, i) => i), dupPre: 0, dupPost: 0, candidates: [], keyDesc: "매칭 키 없음" };
  }

  // 중복 키는 마지막 응답 유지
  const index = (rows, fn) => {
    const m = new Map(); let dup = 0;
    rows.forEach((r, i) => { const k = fn(r); if (!k || /^\|*$/.test(k)) return; if (m.has(k)) dup++; m.set(k, i); });
    return { m, dup };
  };
  const P = index(preRows, keyFns[0]), Q = index(postRows, keyFns[1]);
  const pairs = [];
  const usedPre = new Set(), usedPost = new Set();
  for (const [k, qi] of Q.m) {
    if (P.m.has(k)) { pairs.push({ pre: P.m.get(k), post: qi, how: "exact" }); usedPre.add(P.m.get(k)); usedPost.add(qi); }
  }
  // 직원이 확정한 퍼지 매칭
  Object.entries(confirmed).forEach(([pi, qi]) => {
    pi = +pi; qi = +qi;
    if (!usedPre.has(pi) && !usedPost.has(qi) && preRows[pi] && postRows[qi]) { pairs.push({ pre: pi, post: qi, how: "confirmed" }); usedPre.add(pi); usedPost.add(qi); }
  });

  // 퍼지 후보: 키 편집거리 1 (길이 3 이상)
  const candidates = [];
  const preLeft = [...P.m.entries()].filter(([, i]) => !usedPre.has(i));
  const postLeft = [...Q.m.entries()].filter(([, i]) => !usedPost.has(i));
  if (preLeft.length * postLeft.length <= 250000) {
    for (const [kq, qi] of postLeft) {
      for (const [kp, pi] of preLeft) {
        if (kq.length >= 3 && Math.abs(kq.length - kp.length) <= 1 && editDistance(kq, kp) === 1) {
          candidates.push({ pre: pi, post: qi, reason: `키 한 글자 차이 (${kp} ↔ ${kq})` });
        }
      }
    }
  }
  const preOnly = preRows.map((_, i) => i).filter(i => !usedPre.has(i));
  const postOnly = postRows.map((_, i) => i).filter(i => !usedPost.has(i));
  pairs.sort((a, b) => a.post - b.post);
  return { pairs, preOnly, postOnly, dupPre: P.dup, dupPost: Q.dup, candidates, keyDesc };
}
