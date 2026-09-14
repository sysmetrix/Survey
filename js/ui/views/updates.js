import { RELEASES } from "../../admin/releases.js";
import { revokeReleaseAccess } from "../../admin/access.js";
import { esc } from "../util.js";
import { go } from "../router.js";

const releaseHtml = (r, i) => `<article class="release${i === 0 ? " latest" : ""}"><div class="release-head"><div><span class="badge ${i === 0 ? "ok" : "muted"}">v${esc(r.version)}</span> <b>${esc(r.title)}</b></div><time datetime="${esc(r.date)}">${esc(r.date)}</time></div>${Object.entries(r.groups).map(([name, items]) => `<section><h3>${esc(name)}</h3><ul>${items.map(x => `<li>${esc(x)}</li>`).join("")}</ul></section>`).join("")}</article>`;

export function render() {
  return `<div class="page-head"><div><span class="eyebrow">이스터에그 · 현재 탭 전용</span><h1>업데이트 내역</h1><p class="muted">기능 영역별 변경 사항을 최신순으로 기록합니다.</p></div><button class="btn" data-act="updates-close">닫기</button></div><section class="card"><div class="release-list">${RELEASES.map(releaseHtml).join("")}</div></section>`;
}

export const actions = { "updates-close": () => { revokeReleaseAccess(); go("load"); } };
