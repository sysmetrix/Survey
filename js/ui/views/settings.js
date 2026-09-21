import { prefs, savePrefs, cache, requestPersist, fmtBytes } from "../history/manager.js";
import { themePref, setTheme, THEME_LABEL } from "../theme.js";
import { state, persistSettings, invalidate } from "../store.js";
import { scoreBasisPanel, scoreBasisActions } from "../score-basis.js";
import { esc, toast, option } from "../util.js";
import { refresh, prevView, viewLabel, go } from "../router.js";
import { icon } from "../icons.js";
import { ORG_EXAMPLE, AUTHOR_EXAMPLE } from "../examples.js";
import { currentUser, logout as signOut } from "../../auth/session.js";

const THEME_ICON = { system: "monitor", light: "sun", dark: "moon" };

export function render() {
  const st = cache.storage;
  const usage = st ? `${fmtBytes(st.usage)} / ${fmtBytes(st.quota)}` : "확인 불가";
  const backTo = viewLabel(prevView());
  return `<div class="page-head"><div><span class="eyebrow">이 브라우저에만 적용</span><h1>로컬 설정</h1><p class="muted">여기서 바꾼 값은 서버로 전송되지 않으며 현재 브라우저에만 저장됩니다.</p></div><button class="btn" data-act="back">${icon("left", 16)}저장 확인·${esc(backTo)} 화면으로</button></div>
  <div class="settings-cols">
    <div class="settings-col">
    ${currentUser() ? `<section class="card"><h2>관리자 계정</h2>
      <p class="small muted">로그인: ${esc(currentUser().email)}</p>
      <div class="row gap"><button class="btn sm" data-act="goto" data-to="admin">관리자 화면으로</button><button class="btn sm" data-act="logout">로그아웃</button></div>
    </section>` : ""}
    <section class="card"><h2>보고서 기본 정보</h2>
      <p class="small muted">보고서 표지와 발표 자료 표지에 자동으로 들어갑니다. 회색 글씨는 입력 예시입니다.</p>
      <div class="grid-2in">
        <label class="field">기관·부서명<input class="in" value="${esc(state.settings.orgName)}" placeholder="${ORG_EXAMPLE}" data-change="local-org"></label>
        <label class="field">담당자명<input class="in" value="${esc(state.settings.author)}" placeholder="${AUTHOR_EXAMPLE}" data-change="local-author"></label>
      </div>
    </section>
    <section class="card"><h2>자동 저장과 보관</h2>
      <label class="check"><input type="checkbox" ${prefs.autosave ? "checked" : ""} data-change="local-autosave"> 변경 사항 자동 저장</label>
      <div class="grid-2in"><label class="field">자동 버전 수<select class="in" data-change="local-max">${[10, 30, 100].map(v => option(v, `${v}개`, prefs.maxAuto === v)).join("")}</select></label>
      <label class="field">보관 기간<select class="in" data-change="local-age">${[30, 90, 365].map(v => option(v, `${v}일`, prefs.maxAgeDays === v)).join("")}</select></label></div>
      <p class="small muted">현재 작업 ${cache.projects.length}개 · 저장 공간 ${esc(usage)} · ${cache.persisted ? "영구 보관 허용됨" : "브라우저 정리 시 삭제될 수 있음"}</p>
      ${cache.persisted ? "" : `<button class="btn sm" data-act="local-persist">영구 보관 요청</button>`}
    </section>
    <section class="card"><h2>화면</h2>
      <label class="field">화면 테마
        <div class="fontpick" role="radiogroup" aria-label="화면 테마">${Object.entries(THEME_LABEL).map(([v, label]) => `<button type="button" class="chip-btn fontpick-chip${themePref() === v ? " on" : ""}" data-act="local-theme" data-value="${v}" role="radio" aria-checked="${themePref() === v}">${icon(THEME_ICON[v], 14)}${esc(label)}</button>`).join("")}</div>
      </label>
      <p class="small muted">시스템 설정은 Windows 또는 브라우저의 밝은·어두운 화면 설정을 따릅니다.</p>
      <button class="btn sm primary" data-act="tutorial">${icon("play", 15)}화면 가이드 다시 보기</button>
    </section>
    <section class="card"><h2>단축키</h2>
      <p class="small muted">입력창에 글자를 쓰는 중에는 동작하지 않습니다.</p>
      <dl class="rt-keys">
        <dt><kbd>Shift</kbd>+<kbd>D</kbd></dt><dd>화면 테마 전환(밝게·어둡게·시스템)</dd>
        <dt><kbd>Shift</kbd>+<kbd>H</kbd></dt><dd>작업 내역 화면으로 이동</dd>
        <dt><kbd>Shift</kbd>+<kbd>P</kbd></dt><dd>발표 모드로 이동(설문 자료를 불러온 뒤)</dd>
        <dt><kbd>Ctrl</kbd>+<kbd>Z</kbd></dt><dd>되돌리기</dd>
        <dt><kbd>Ctrl</kbd>+<kbd>Y</kbd> / <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>Z</kbd></dt><dd>다시 실행</dd>
        <dt><kbd>Ctrl</kbd>+<kbd>F5</kbd></dt><dd>앱 캐시 비우고 새로고침('앱 파일 새로고침' 카드 참고)</dd>
      </dl>
    </section>
    </div>
    <div class="settings-col">
    ${scoreBasisPanel(state.results?.analysis?.items || [], { compact: false })}
    <section class="card refresh-card"><h2>앱 파일 새로고침</h2>
      <p>화면이 이전 버전으로 보이거나 업데이트가 적용되지 않을 때 사용하세요.</p>
      <button class="btn danger" data-act="hard-refresh">캐시 비우고 새로고침 <kbd>Ctrl</kbd>+<kbd>F5</kbd></button>
      <p class="small muted">앱 캐시와 서비스워커만 정리합니다. 설문 작업 내역, 로컬 설정, 원자료 보관본은 삭제하지 않습니다.</p>
    </section>
    </div>
  </div>`;
}

export const actions = {
  ...scoreBasisActions,
  logout: async () => { await signOut(); toast("로그아웃했습니다", "info"); go("login"); },
  "local-org": el => { state.settings.orgName = el.value.trim(); persistSettings(); invalidate(); toast("기관·부서명을 저장했습니다", "ok"); refresh(); },
  "local-author": el => { state.settings.author = el.value.trim(); persistSettings(); invalidate(); toast("담당자명을 저장했습니다", "ok"); refresh(); },
  "local-theme": el => { const v = el.dataset.value ?? el.value; setTheme(v); toast(`화면 테마: ${THEME_LABEL[v]}`); refresh(); },
  "local-autosave": el => { savePrefs({ autosave: el.checked }); toast(el.checked ? "자동 저장을 켰습니다" : "자동 저장을 껐습니다"); refresh(); },
  "local-max": el => { savePrefs({ maxAuto: Number(el.value) }); toast("자동 버전 보관 수를 변경했습니다", "ok"); refresh(); },
  "local-age": el => { savePrefs({ maxAgeDays: Number(el.value) }); toast("보관 기간을 변경했습니다", "ok"); refresh(); },
  "local-persist": async () => { const ok = await requestPersist(); toast(ok ? "영구 보관을 허용했습니다" : "브라우저가 영구 보관 요청을 허용하지 않았습니다", ok ? "ok" : "bad", 5000); refresh(); },
  "hard-refresh": async () => {
    if (!confirm("앱 캐시를 비우고 최신 파일을 다시 불러올까요? 작업 내역과 로컬 설정은 유지됩니다.")) return;
    if (!navigator.onLine) { toast("오프라인에서는 최신 파일을 다시 받을 수 없습니다", "bad", 5000); return; }
    const keys = typeof caches !== "undefined" ? await caches.keys() : [];
    await Promise.all(keys.filter(k => k.startsWith("survey-shell-")).map(k => caches.delete(k)));
    const regs = await navigator.serviceWorker?.getRegistrations?.() || [];
    await Promise.all(regs.map(reg => reg.unregister()));
    const url = new URL(location.href); url.searchParams.set("refresh", Date.now());
    location.replace(url.href);
  },
};
