import { prefs, savePrefs, cache, requestPersist, fmtBytes } from "../history/manager.js";
import { themePref, setTheme, THEME_LABEL } from "../theme.js";
import { state, persistSettings, invalidate } from "../store.js";
import { SCORE_BASES, cleanScoreBasis } from "../../narrative/vocab.js";
import { esc, toast, option } from "../util.js";
import { refresh, prevView, viewLabel } from "../router.js";
import { icon } from "../icons.js";

export function render() {
  const st = cache.storage;
  const usage = st ? `${fmtBytes(st.usage)} / ${fmtBytes(st.quota)}` : "확인 불가";
  const backTo = viewLabel(prevView());
  return `<div class="page-head"><div><span class="eyebrow">이 브라우저에만 적용</span><h1>로컬 설정</h1><p class="muted">여기서 바꾼 값은 서버로 전송되지 않으며 현재 브라우저에만 저장됩니다.</p></div><button class="btn" data-act="back">${icon("left", 16)}저장 확인·${esc(backTo)} 화면으로</button></div>
  <div class="settings-grid">
    <section class="card"><h2>보고서 기본 정보</h2>
      <p class="small muted">새 보고서와 발표 자료의 표지에 자동으로 들어갑니다.</p>
      <label class="field">기관·부서명<input class="in" value="${esc(state.settings.orgName)}" placeholder="예: 부천여성청소년재단 청소년팀" data-change="local-org"></label>
      <label class="field">담당자명<input class="in" value="${esc(state.settings.author)}" placeholder="예: 홍길동" data-change="local-author"></label>
    </section>
    <section class="card"><h2>보고서 수치 표기</h2>
      <label class="field">100점 환산 기준<select class="in" data-change="local-basis">${SCORE_BASES.map(b => option(b.id, b.label, state.settings.scoreBasis === b.id)).join("")}</select></label>
      <p class="small muted">보고서 표·요약 문장·차트와 발표 자료에 표시되는 환산 점수에만 적용됩니다. 수준 판정, 성과지표 달성 판정, 문항 순위, 사전·사후 변화량은 어느 쪽이든 반올림 전 값으로 계산합니다.</p>
    </section>
    <section class="card"><h2>화면</h2>
      <label class="field">화면 테마<select class="in" data-change="local-theme">${Object.entries(THEME_LABEL).map(([v, label]) => option(v, label, themePref() === v)).join("")}</select></label>
      <p class="small muted">시스템 설정은 Windows 또는 브라우저의 밝은·어두운 화면 설정을 따릅니다.</p>
      <button class="btn sm" data-act="tutorial">3분 화면 가이드 다시 보기</button>
    </section>
    <section class="card"><h2>단축키</h2>
      <p class="small muted">입력창에 글자를 쓰는 중에는 동작하지 않습니다.</p>
      <dl class="rt-keys">
        <dt><kbd>Shift</kbd>+<kbd>D</kbd></dt><dd>화면 테마 전환(밝게·어둡게·시스템)</dd>
        <dt><kbd>Shift</kbd>+<kbd>H</kbd></dt><dd>작업 내역 화면으로 이동</dd>
        <dt><kbd>Shift</kbd>+<kbd>P</kbd></dt><dd>발표 모드로 이동(설문 자료를 불러온 뒤)</dd>
        <dt><kbd>Ctrl</kbd>+<kbd>Z</kbd></dt><dd>되돌리기</dd>
        <dt><kbd>Ctrl</kbd>+<kbd>Y</kbd> / <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>Z</kbd></dt><dd>다시 실행</dd>
        <dt><kbd>Ctrl</kbd>+<kbd>B</kbd></dt><dd>보고서 문장 편집 중 선택한 글자를 굵게</dd>
        <dt><kbd>Enter</kbd></dt><dd>보고서 문장 편집 확정</dd>
        <dt><kbd>Ctrl</kbd>+<kbd>F5</kbd></dt><dd>앱 캐시 비우고 새로고침(아래 '앱 파일 새로고침' 참고)</dd>
      </dl>
    </section>
    <section class="card"><h2>자동 저장과 보관</h2>
      <label class="check"><input type="checkbox" ${prefs.autosave ? "checked" : ""} data-change="local-autosave"> 변경 사항 자동 저장</label>
      <div class="grid-2in"><label class="field">자동 버전 수<select class="in" data-change="local-max">${[10, 30, 100].map(v => option(v, `${v}개`, prefs.maxAuto === v)).join("")}</select></label>
      <label class="field">보관 기간<select class="in" data-change="local-age">${[30, 90, 365].map(v => option(v, `${v}일`, prefs.maxAgeDays === v)).join("")}</select></label></div>
      <p class="small muted">현재 작업 ${cache.projects.length}개 · 저장 공간 ${esc(usage)} · ${cache.persisted ? "영구 보관 허용됨" : "브라우저 정리 시 삭제될 수 있음"}</p>
      ${cache.persisted ? "" : `<button class="btn sm" data-act="local-persist">영구 보관 요청</button>`}
    </section>
    <section class="card refresh-card"><h2>앱 파일 새로고침</h2>
      <p>화면이 이전 버전으로 보이거나 업데이트가 적용되지 않을 때 사용하세요.</p>
      <button class="btn danger" data-act="hard-refresh">캐시 비우고 새로고침 <kbd>Ctrl</kbd>+<kbd>F5</kbd></button>
      <p class="small muted">앱 캐시와 서비스워커만 정리합니다. 설문 작업 내역, 로컬 설정, 원자료 보관본은 삭제하지 않습니다.</p>
    </section>
  </div>`;
}

export const actions = {
  "local-org": el => { state.settings.orgName = el.value.trim(); persistSettings(); invalidate(); toast("기관·부서명을 저장했습니다", "ok"); refresh(); },
  "local-author": el => { state.settings.author = el.value.trim(); persistSettings(); invalidate(); toast("담당자명을 저장했습니다", "ok"); refresh(); },
  "local-basis": el => { state.settings.scoreBasis = cleanScoreBasis(el.value); persistSettings(); invalidate(); toast("100점 환산 기준을 변경했습니다", "ok"); refresh(); },
  "local-theme": el => { setTheme(el.value); toast(`화면 테마: ${THEME_LABEL[el.value]}`); refresh(); },
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
