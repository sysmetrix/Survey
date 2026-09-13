// 이 PC에 글꼴이 설치돼 있는지 확인 (브라우저)
// 1) FontFace local() 로드 — 권한 요청 없음  2) 사용자가 허용하면 queryLocalFonts() 로 정확한 등록명 대조
// HWPX 에는 글꼴 이름만 기록되므로, 받는 사람 PC에도 같은 글꼴이 있어야 같은 모양으로 보인다.

const norm = s => String(s || "").toLowerCase().replace(/[\s_\-()]+/g, "");

/** @returns {Promise<boolean|null>} true 설치됨, false 없음, null 판별 불가 */
export async function isFontInstalled(name, { allowPermissionPrompt = false } = {}) {
  if (!name || typeof FontFace === "undefined") return null;
  if (allowPermissionPrompt && "queryLocalFonts" in window) {
    try {
      const list = await window.queryLocalFonts();
      const target = norm(name);
      return list.some(f => [f.family, f.fullName, f.postscriptName].some(v => norm(v) === target));
    } catch { /* 권한 거부 — local() 로 확인 */ }
  }
  try {
    await new FontFace("__survey_font_probe__", `local("${String(name).replace(/["\\]/g, "")}")`).load();
    return true;
  } catch {
    return false;
  }
}
