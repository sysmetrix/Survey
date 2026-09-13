// ② 데이터 설정 화면: 설계·열 역할·척도·역문항·영역·사전사후 짝·매칭·불성실응답
import { state, compute, invalidate } from "../store.js";
import { ROLES, normKey } from "../../model/detect.js";
import { DESIGN_LABELS } from "../../model/codebook.js";
import { maskPII } from "../../core/util.js";
import { esc, option, levelBadge, toast } from "../util.js";
import { refresh, go } from "../router.js";

const SHEET_ROLE = { data: "응답", pre: "사전 응답", post: "사후 응답", codebook: "문항정보", business: "사업정보", kpi: "성과지표", guide: "안내" };

function sampleValues(col) {
  const rows = state.dataset.sheets[col.sheet].rows;
  const seen = [];
  for (const r of rows) {
    const v = r[col.index];
    if (v === null || v === undefined || v === "") continue;
    const s = v instanceof Date ? v.toISOString().slice(0, 10) : String(v);
    if (!seen.includes(s)) seen.push(s);
    if (seen.length >= 4) break;
  }
  return seen.map(s => (col.pii ? maskPII(s).replace(/[가-힣]/g, "○") : s)).map(s => (s.length > 18 ? s.slice(0, 17) + "…" : s)).join(" · ");
}

export function render() {
  const cb = state.codebook, r = compute();
  const sv = r.survey;
  const domainName = id => cb.domains.find(d => d.id === id)?.name || "";
  const multiSheet = cb.responseSheets.length > 1;
  const idCandidates = si => cb.columns.filter(c => c.sheet === si && ["id", "ignore", "demographic", "numeric"].includes(c.role));
  const m = sv.matching;

  const colRows = cb.columns.map(c => {
    const numeric = ["likert", "nps", "numeric"].includes(c.role);
    const conf = c.detected?.confidence ?? 1;
    return `<tr class="${c.role === "ignore" ? "dim" : ""}">
      <td class="small muted">${multiSheet ? esc(cb.sheets[c.sheet].name) + "<br>" : ""}${c.index + 1}</td>
      <td class="hdr" title="${esc(c.header)}">${esc(c.header)}<div class="small muted">${esc(sampleValues(c))}</div></td>
      <td><input class="in" value="${esc(c.label)}" data-change="col" data-key="${esc(c.key)}" data-field="label"></td>
      <td><select class="in" data-change="col" data-key="${esc(c.key)}" data-field="role">${Object.entries(ROLES).map(([k, v]) => option(k, v, c.role === k)).join("")}</select>
        ${conf < 0.7 ? `<div class="small warn-text" title="${esc(c.detected.reason)}">판별 불확실</div>` : ""}${c.pii ? `<div class="small warn-text">개인정보 추정</div>` : ""}</td>
      <td class="nowrap">${numeric ? `<input class="in num" type="number" value="${c.scale?.min ?? ""}" data-change="col" data-key="${esc(c.key)}" data-field="min">~<input class="in num" type="number" value="${c.scale?.max ?? ""}" data-change="col" data-key="${esc(c.key)}" data-field="max">` : ""}</td>
      <td class="c">${c.role === "likert" ? `<input type="checkbox" ${c.reverse ? "checked" : ""} data-change="col" data-key="${esc(c.key)}" data-field="reverse">` : ""}</td>
      <td>${c.role === "likert" ? `<input class="in" list="domainList" value="${esc(domainName(c.domain))}" placeholder="(없음)" data-change="col" data-key="${esc(c.key)}" data-field="domain">` : ""}</td>
      <td>${numeric ? `<select class="in" data-change="col" data-key="${esc(c.key)}" data-field="time">${option("", "-", !c.time)}${option("pre", "사전", c.time === "pre")}${option("post", "사후", c.time === "post")}</select>` : ""}</td>
      <td class="c">${c.role === "likert" && c.time !== "pre" ? `<input type="checkbox" ${c.isOverall ? "checked" : ""} data-change="col" data-key="${esc(c.key)}" data-field="isOverall">` : ""}</td>
    </tr>`;
  }).join("");

  return `
  <section class="card">
    <div class="row between wrap">
      <div><h2>데이터 설정</h2><p class="muted">자동 판별 결과를 확인하고 필요한 부분만 고치세요. 변경 사항은 분석·보고서에 바로 반영됩니다.</p></div>
      <div class="row gap"><button class="btn" data-act="goto" data-to="business">다음: 사업정보·성과지표 →</button><button class="btn ghost" data-act="goto" data-to="dash">분석 결과 보기</button></div>
    </div>
    <div class="facts">
      <div><span>파일</span><b>${esc(state.dataset.fileName)}</b></div>
      <div><span>시트</span><b>${cb.sheets.map(s => `${esc(s.name)}(${SHEET_ROLE[s.role] || s.role})`).join(", ")}</b></div>
      <div><span>분석 응답자</span><b>${sv.n}명</b></div>
      <div><span>조사 설계</span><select class="in" data-change="design">${Object.entries(DESIGN_LABELS).map(([k, v]) => option(k, v, cb.design === k)).join("")}</select></div>
    </div>
    ${r.codebookWarnings.length ? `<ul class="warnings">${r.codebookWarnings.map(w => `<li>${levelBadge(w.level)} ${esc(w.msg)}</li>`).join("")}</ul>` : ""}
  </section>

  ${cb.design === "prepost-sheets" ? `
  <section class="card">
    <h2>사전·사후 응답자 연결</h2>
    <div class="row gap wrap">
      ${cb.responseSheets.map((si, i) => `<label class="field">${i === 0 ? "사전" : "사후"} 시트 ID 열
        <select class="in" data-change="idkey" data-i="${i}">${option("", "(선택)", !cb.pairing.idKeys[i])}${idCandidates(si).map(c => option(c.key, c.label, cb.pairing.idKeys[i] === c.key)).join("")}</select></label>`).join("")}
    </div>
    ${m ? `<div class="facts">
      <div><span>매칭</span><b class="ok-text">${m.pairs.length}명</b></div>
      <div><span>사전만 응답</span><b>${m.preOnly.length}명</b></div>
      <div><span>사후만 응답</span><b>${m.postOnly.length}명</b></div>
      <div><span>중복 ID</span><b>${m.dupPre + m.dupPost}건</b></div>
    </div>
    <p class="small muted">매칭 기준: ${esc(m.keyDesc)} (공백·하이픈·대소문자 차이는 자동 무시)</p>
    ${m.candidates.length ? `<h3>확인이 필요한 유사 ID (${m.candidates.length}건)</h3><table class="tbl"><tr><th>사전 행</th><th>사후 행</th><th>이유</th><th></th></tr>${m.candidates.slice(0, 30).map(cd => `<tr><td>${cd.pre + 1}</td><td>${cd.post + 1}</td><td>${esc(cd.reason)}</td><td><button class="btn sm" data-act="confirm-match" data-pre="${cd.pre}" data-post="${cd.post}">같은 사람</button></td></tr>`).join("")}</table>` : ""}` : ""}
  </section>` : ""}

  <section class="card">
    <h2>자료 점검</h2>
    <label class="check"><input type="checkbox" ${state.excludeStraight ? "checked" : ""} data-change="exclude-straight">
      모든 척도 문항에 같은 값으로 응답한 사례(불성실 응답 의심) <b>${r.straight}명</b> 분석에서 제외</label>
  </section>

  <section class="card">
    <div class="row between wrap"><h2>문항(열) 설정</h2>
      <span class="small muted">역할: 척도 문항=리커트, 응답자 특성=집단 비교 기준, 복수응답=쉼표 구분 선택형 · 영역: 같은 이름끼리 묶어 영역 점수 계산</span></div>
    <datalist id="domainList">${cb.domains.map(d => `<option value="${esc(d.name)}">`).join("")}</datalist>
    <div class="tblwrap"><table class="tbl setup">
      <thead><tr><th>#</th><th>원래 열 이름 · 응답 예</th><th>표시 이름</th><th>역할</th><th>척도 범위</th><th>역문항</th><th>영역</th><th>시점</th><th>전반 만족</th></tr></thead>
      <tbody>${colRows}</tbody>
    </table></div>
    <div class="row end gap"><button class="btn" data-act="goto" data-to="business">다음: 사업정보·성과지표 →</button></div>
  </section>`;
}

export const actions = {
  design: el => { state.codebook.design = el.value; invalidate(); refresh(); },
  "exclude-straight": el => { state.excludeStraight = el.checked; invalidate(); refresh(); },
  idkey: el => { state.codebook.pairing.idKeys[+el.dataset.i] = el.value || null; invalidate(); refresh(); },
  "confirm-match": el => { state.codebook.pairing.confirmed[+el.dataset.pre] = +el.dataset.post; invalidate(); toast("매칭을 확정했습니다", "ok"); refresh(); },
  col: el => {
    const cb = state.codebook;
    const c = cb.columns.find(x => x.key === el.dataset.key);
    if (!c) return;
    const f = el.dataset.field;
    if (f === "label") c.label = el.value.trim() || c.header;
    else if (f === "role") {
      c.role = el.value;
      if (["likert", "nps"].includes(c.role) && !c.scale) c.scale = c.role === "nps" ? { min: 0, max: 10 } : { min: 1, max: 5 };
      if (c.role === "multi" && !c.options) c.options = [];
    } else if (f === "min" || f === "max") {
      const v = Number(el.value);
      c.scale = { ...(c.scale || { min: 1, max: 5 }), [f]: Number.isFinite(v) ? v : c.scale?.[f] };
    } else if (f === "reverse" || f === "isOverall") c[f] = el.checked;
    else if (f === "domain") {
      const name = el.value.trim();
      if (!name) c.domain = null;
      else {
        let d = cb.domains.find(x => x.name === name);
        if (!d) { d = { id: `D${cb.domains.reduce((mx, x) => Math.max(mx, +x.id.slice(1) || 0), 0) + 1}`, name }; cb.domains.push(d); }
        c.domain = d.id;
      }
      cb.domains = cb.domains.filter(d => cb.columns.some(x => x.domain === d.id));
    } else if (f === "time") {
      c.time = el.value || null;
      c.pairKey = c.time ? (cb.design === "prepost-sheets" ? normKey(c.header) : normKey(c.label)) : null;
      if (c.time && cb.design === "single") cb.design = "prepost-wide";
    }
    invalidate(); refresh();
  },
};

export { go };
