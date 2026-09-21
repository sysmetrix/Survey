// 관리자 — 공지 관리 탭: js/admin/releases.js 의 하드코딩 배열을 대신할 announcements 테이블 CRUD
import { restRequest } from "../../../auth/api.js";
import { getSession } from "../../../auth/session.js";
import { esc, toast } from "../../util.js";
import { refresh } from "../../router.js";
import { icon } from "../../icons.js";

let loading = false, error = "", items = null, loaded = false;
let editing = null; // null=목록만 · {}=새로 작성 · {...row}=수정 중

async function load() {
  const s = getSession();
  if (!s) return;
  loading = true; error = ""; refresh();
  try { items = await restRequest("/announcements?order=release_date.desc,id.desc", { token: s.access_token }); }
  catch (e) { error = e.message || "불러오지 못했습니다"; }
  finally { loading = false; refresh(); }
}

export function mount() { if (!loaded) { loaded = true; load(); } }

const groupsToText = g => Object.values(g || {})[0]?.join("\n") || "";
const textToGroups = t => ({ "변경 사항": t.split("\n").map(s => s.trim()).filter(Boolean) });

function formHtml(row) {
  const r = { version: "", release_date: new Date().toISOString().slice(0, 10), title: "", groups: {}, published: true, ...row };
  return `<div class="card" style="margin-top:12px">
    <h3>${row?.id ? "공지 수정" : "새 공지"}</h3>
    <label class="field">버전(선택)<input class="in" id="ancVersion" value="${esc(r.version || "")}"></label>
    <label class="field">날짜<input class="in" type="date" id="ancDate" value="${esc(r.release_date)}"></label>
    <label class="field">제목<input class="in" id="ancTitle" value="${esc(r.title)}"></label>
    <label class="field">내용(한 줄에 하나씩)<textarea class="in" id="ancBody" rows="5">${esc(groupsToText(r.groups))}</textarea></label>
    <label class="check"><input type="checkbox" id="ancPublished" ${r.published ? "checked" : ""}> 공개(직원 화면에 표시)</label>
    <div class="row gap">
      <button class="btn sm primary" data-act="admin-content-save" data-id="${r.id || ""}">저장</button>
      <button class="btn sm" data-act="admin-content-cancel">취소</button>
    </div>
  </div>`;
}

export function render() {
  if (error) return `<p class="hint bad" role="alert">${esc(error)}</p>`;
  if (!items) return `<p class="muted">${loading ? "불러오는 중…" : ""}</p>`;
  return `
    <div class="row gap wrap" style="justify-content:space-between;align-items:center">
      <p class="small muted">${items.length}개</p>
      <button class="btn sm primary" data-act="admin-content-new">${icon("plus", 14)}새 공지</button>
    </div>
    <div class="tblwrap"><table class="tbl">
      <tr><th>날짜</th><th>제목</th><th>공개</th><th></th></tr>
      ${items.length ? items.map(r => `<tr><td>${esc(r.release_date)}</td><td>${esc(r.title)}</td><td>${r.published ? "공개" : "비공개"}</td>
        <td class="row gap"><button class="btn sm" data-act="admin-content-edit" data-id="${r.id}">수정</button><button class="btn sm danger" data-act="admin-content-del" data-id="${r.id}">삭제</button></td></tr>`).join("") : `<tr><td colspan="4" class="muted">공지 없음</td></tr>`}
    </table></div>
    ${editing ? formHtml(editing) : ""}`;
}

export const actions = {
  "admin-content-new": () => { editing = {}; refresh(); },
  "admin-content-cancel": () => { editing = null; refresh(); },
  "admin-content-edit": el => { editing = items.find(r => String(r.id) === el.dataset.id) || {}; refresh(); },
  "admin-content-del": async el => {
    const s = getSession();
    if (!s) return;
    if (!confirm("이 공지를 삭제할까요?")) return;
    try {
      await restRequest(`/announcements?id=eq.${el.dataset.id}`, { method: "DELETE", token: s.access_token });
      toast("삭제했습니다", "ok"); editing = null; loaded = false; await load();
    } catch (e) { toast(e.message || "삭제하지 못했습니다", "bad"); }
  },
  "admin-content-save": async el => {
    const s = getSession();
    if (!s) return;
    const id = el.dataset.id;
    const body = {
      version: document.getElementById("ancVersion").value.trim() || null,
      release_date: document.getElementById("ancDate").value,
      title: document.getElementById("ancTitle").value.trim(),
      groups: textToGroups(document.getElementById("ancBody").value),
      published: document.getElementById("ancPublished").checked,
    };
    if (!body.title || !body.release_date) { toast("제목과 날짜를 입력하세요", "bad"); return; }
    try {
      const opts = { token: s.access_token, body, extraHeaders: { Prefer: "return=minimal" } };
      if (id) await restRequest(`/announcements?id=eq.${id}`, { method: "PATCH", ...opts });
      else await restRequest("/announcements", { method: "POST", ...opts });
      toast("저장했습니다", "ok"); editing = null; loaded = false; await load();
    } catch (e) { toast(e.message || "저장하지 못했습니다", "bad"); }
  },
};
