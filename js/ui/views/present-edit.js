// ⑥b 슬라이드 편집: 발표 슬라이드 문구를 직접 고치는 화면
// (지금은 문구 편집만 — 요소 위치·크기·이미지 삽입 등 자유배치 편집기는 다음 단계에서 이 화면 위에 이어붙임)
import { state, deckSlides } from "../store.js";
import { slideHtml } from "./present.js";
import { esc } from "../util.js";
import { go, refresh } from "../router.js";
import { icon } from "../icons.js";
import { resolvedTheme } from "../theme.js";

let selectedId = null;

export function render() {
  const hidden = new Set(state.deckHidden);
  const visible = deckSlides().filter(s => !hidden.has(s.id));
  if (!visible.length) {
    return `<section class="card empty-state"><h2>편집할 슬라이드가 없습니다</h2><p class="muted">발표 모드에서 슬라이드 숨김을 해제하세요.</p><div class="row gap"><button class="btn" data-act="goto" data-to="present" data-sub="1">발표 모드로</button></div></section>`;
  }
  if (!selectedId || !visible.some(s => s.id === selectedId)) selectedId = visible[0].id;
  const idx = visible.findIndex(s => s.id === selectedId);
  const theme = resolvedTheme();
  return `<div class="page-head"><div><h2>슬라이드 편집</h2><p class="muted small">텍스트를 눌러 바로 고치세요. 자동으로 계산된 값도 원하는 문구로 바꿀 수 있습니다(굵게·색은 문장을 고른 뒤 뜨는 서식 도구모음 또는 Ctrl+B 사용).</p></div>
    <button class="btn primary" data-act="goto" data-to="present" data-sub="${idx + 1}">${icon("play", 16)}발표로 미리 보기</button>
  </div>
  <div class="pe-layout">
    <aside class="pe-list">${visible.map((s, i) => `<button class="pe-thumb${s.id === selectedId ? " on" : ""}" data-act="pe-select" data-id="${esc(s.id)}"><span class="pe-thumb-n">${i + 1}</span><span class="pe-thumb-title">${esc(s.title)}</span></button>`).join("")}</aside>
    <div class="pe-stage-wrap"><div class="pe-stage">${slideHtml(visible[idx], idx, visible.length, theme, { editable: true })}</div></div>
  </div>`;
}

export const actions = {
  "pe-select": el => { selectedId = el.dataset.id; refresh(); },
};
