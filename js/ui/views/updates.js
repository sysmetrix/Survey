import { RELEASES } from "../../admin/releases.js";
import { revokeReleaseAccess } from "../../admin/access.js";
import { restRequest } from "../../auth/api.js";
import { esc } from "../util.js";
import { go, refresh } from "../router.js";

// 관리자가 공지를 올리면 Supabase 에서 최신 내용을 받아 보여주고, 실패·오프라인이면 앱에 번들된 배열로 조용히 대체한다.
let remote = null; // null=아직 시도 전 · []=가져왔지만 없음 · [...]=가져온 공지
let tried = false;

async function loadRemote() {
  tried = true;
  try {
    const rows = await Promise.race([
      restRequest("/announcements?published=eq.true&select=version,release_date,title,groups&order=release_date.desc&limit=30"),
      new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), 2500)),
    ]);
    remote = (rows || []).map(r => ({ version: r.version || "", date: r.release_date, title: r.title, groups: r.groups || {} }));
    refresh();
  } catch { /* 오프라인이거나 백엔드 문제 — 번들 배열(RELEASES)을 계속 보여주면 됨 */ }
}

export function mount() { if (!tried) loadRemote(); }

const releaseHtml = (r, i) => `<article class="release${i === 0 ? " latest" : ""}"><div class="release-head"><div>${r.version ? `<span class="badge ${i === 0 ? "ok" : "muted"}">v${esc(r.version)}</span> ` : ""}<b>${esc(r.title)}</b></div><time datetime="${esc(r.date)}">${esc(r.date)}</time></div>${Object.entries(r.groups).map(([name, items]) => `<section><h3>${esc(name)}</h3><ul>${items.map(x => `<li>${esc(x)}</li>`).join("")}</ul></section>`).join("")}</article>`;

export function render() {
  const list = remote && remote.length ? remote : RELEASES;
  return `<div class="page-head"><div><span class="eyebrow">이스터에그 · 현재 탭 전용</span><h1>업데이트 내역</h1><p class="muted">기능 영역별 변경 사항을 최신순으로 기록합니다.</p></div><button class="btn" data-act="updates-close">닫기</button></div><section class="card"><div class="release-list">${list.map(releaseHtml).join("")}</div></section>`;
}

export const actions = { "updates-close": () => { revokeReleaseAccess(); go("load"); } };
