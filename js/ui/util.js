// UI 공용 도우미 (브라우저)
import { esc } from "../core/util.js";
import { icon } from "./icons.js";
export { esc };

const TOAST_ICON = { ok: "check", bad: "alert", info: "info" };

export function toast(msg, kind = "info", ms = 3200) {
  if (typeof document === "undefined") return;
  const el = document.getElementById("toast");
  if (!el) return;
  el.innerHTML = `${icon(TOAST_ICON[kind] || "info", 17)}<span>${esc(msg)}</span>`;
  el.className = `toast show ${kind}`;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => { el.className = "toast"; }, ms);
}

/** 버튼이 있는 알림 (업데이트 안내 등). 문구는 textContent 로만 삽입 */
export function notify(msg, { action = "", onAction = null, sticky = false, ms = 6000 } = {}) {
  if (typeof document === "undefined") return;
  const el = document.getElementById("snack");
  if (!el) return;
  const text = document.createElement("span");
  text.textContent = msg;
  const parts = [text];
  if (action && onAction) {
    const b = document.createElement("button");
    b.className = "btn sm primary";
    b.textContent = action;
    b.addEventListener("click", () => { el.hidden = true; onAction(); });
    parts.push(b);
  }
  const close = document.createElement("button");
  close.className = "icon-btn sm";
  close.setAttribute("aria-label", "닫기");
  close.textContent = "✕";
  close.addEventListener("click", () => { el.hidden = true; });
  parts.push(close);
  el.replaceChildren(...parts);
  el.hidden = false;
  clearTimeout(notify._t);
  if (!sticky) notify._t = setTimeout(() => { el.hidden = true; }, ms);
}

export function busy(on, msg = "처리 중…") {
  if (typeof document === "undefined") return;
  const el = document.getElementById("busy");
  if (!el) return;
  clearTimeout(busyDone._t);
  el.classList.remove("done");
  el.hidden = !on;
  el.querySelector(".busy-msg").textContent = msg;
  el.querySelector(".spinner").innerHTML = "";
}

/** 화면 가운데에 완료 안내를 잠시 보여준다 (클릭하면 바로 닫힘). msg 의 줄바꿈(
)은 그대로 표시 */
export function busyDone(msg, ms = 2400) {
  if (typeof document === "undefined") return;
  const el = document.getElementById("busy");
  if (!el) return;
  el.querySelector(".busy-msg").textContent = msg;
  el.querySelector(".spinner").innerHTML = icon("check", 15);
  el.classList.add("done");
  el.hidden = false;
  clearTimeout(busyDone._t);
  const close = () => { clearTimeout(busyDone._t); el.hidden = true; el.classList.remove("done"); el.removeEventListener("click", close); };
  el.addEventListener("click", close);
  busyDone._t = setTimeout(close, ms);
}

export function download(data, fileName, mime = "application/octet-stream") {
  const blob = data instanceof Blob ? data : new Blob([data], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = fileName;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export const safeFileName = s => String(s || "보고서").replace(/[\\/:*?"<>|]+/g, "_").replace(/\s+/g, " ").trim().slice(0, 80);

export function readFileBytes(file) {
  return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(new Uint8Array(r.result)); r.onerror = () => rej(r.error); r.readAsArrayBuffer(file); });
}
export function readFileText(file) {
  return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(r.error); r.readAsText(file, "utf-8"); });
}

export const option = (value, label, selected) => `<option value="${esc(value)}"${selected ? " selected" : ""}>${esc(label)}</option>`;

export function levelBadge(level) {
  const map = { error: ["오류", "bad"], warn: ["주의", "warn"], info: ["참고", "info"] };
  const [t, c] = map[level] || ["참고", "info"];
  return `<span class="badge ${c}">${t}</span>`;
}

/** 다음 프레임까지 양보 (긴 작업 전 화면 갱신) */
export const nextFrame = () => new Promise(r => requestAnimationFrame(() => setTimeout(r, 0)));
