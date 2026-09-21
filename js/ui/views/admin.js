// 관리자 화면 — #/admin/<stats|content|users>. role='admin' 인 로그인 사용자만 도달(게이팅은 main.js)
import { esc } from "../util.js";
import * as stats from "./admin/stats.js";
import * as content from "./admin/content.js";
import * as users from "./admin/users.js";

const TABS = [
  { key: "stats", title: "사용 통계", mod: stats },
  { key: "content", title: "공지 관리", mod: content },
  { key: "users", title: "이용자 관리", mod: users },
];
const findTab = key => TABS.find(t => t.key === key) || TABS[0];
let activeKey = TABS[0].key; // render 뒤 곧바로 불리는 mount 가 어느 탭인지 알기 위한 기록(main.js 가 mount() 를 인자 없이 호출)

export function render({ sub } = {}) {
  const tab = findTab(sub);
  activeKey = tab.key;
  return `<div class="page-head"><div><span class="eyebrow">관리자 전용</span><h1>관리자</h1><p class="muted">사용 통계·공지·이용자 계정을 관리합니다. 설문 데이터는 여기에 포함되지 않습니다.</p></div></div>
  <nav class="tabs" aria-label="관리자 메뉴">${TABS.map(t => `<button class="tab${t.key === tab.key ? " on" : ""}" ${t.key === tab.key ? 'aria-current="page"' : ""} data-act="goto" data-to="admin" data-sub="${t.key}">${esc(t.title)}</button>`).join("")}</nav>
  <section class="card">${tab.mod.render()}</section>`;
}

export function mount() { findTab(activeKey).mod.mount?.(); }

export const actions = { ...stats.actions, ...content.actions, ...users.actions };
