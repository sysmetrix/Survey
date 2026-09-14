// Check whether a document font is installed on this computer.
// Local font names vary between Windows, Hancom, and individual font releases.

const norm = s => String(s || "").toLowerCase().replace(/[\s_\-()]+/g, "");
const familyNorm = s => norm(s).replace(/(variable|regular|medium|semibold|bold|light|thin|extrabold|black)$/g, "");

const KNOWN_ALIASES = {
  "함초롬바탕": ["HCR Batang", "HCRBatang"],
  "함초롬돋움": ["HCR Dotum", "HCRDotum"],
  "휴먼명조": ["Human Myeongjo", "HumanMyeongjo"],
  "HY헤드라인M": ["HYHeadLine-M", "HY HeadLine M"],
  "맑은 고딕": ["Malgun Gothic"],
  "나눔고딕": ["NanumGothic", "Nanum Gothic"],
  "KoPub돋움체 Medium": ["KoPub돋움체", "KoPub Dotum Medium", "KoPubWorldDotum Medium", "KoPubWorld Dotum"],
  "KoPub돋움체 Bold": ["KoPub Dotum Bold", "KoPubWorldDotum Bold"],
  "Pretendard GOV Variable": ["Pretendard GOV", "PretendardGOV Variable", "PretendardGOVVariable"],
  "Pretendard GOV": ["Pretendard GOV Variable", "PretendardGOV"],
};

export function fontNameCandidates(name) {
  return [...new Set([name, ...(KNOWN_ALIASES[name] || [])].map(x => String(x || "").trim()).filter(Boolean))];
}

function localFontMatches(font, candidates) {
  const values = [font?.family, font?.fullName, font?.postscriptName].filter(Boolean);
  return candidates.some(candidate => values.some(value =>
    norm(value) === norm(candidate) ||
    (familyNorm(value).length >= 5 && familyNorm(value) === familyNorm(candidate))
  ));
}

/** @returns {Promise<boolean|null>} true: installed, false: missing, null: unavailable */
export async function isFontInstalled(name, { allowPermissionPrompt = false } = {}) {
  if (!name || typeof FontFace === "undefined") return null;
  const candidates = fontNameCandidates(name);

  if (allowPermissionPrompt && typeof window !== "undefined" && "queryLocalFonts" in window) {
    try {
      const list = await window.queryLocalFonts();
      return list.some(font => localFontMatches(font, candidates));
    } catch { /* Permission denied or unsupported: fall back to local(). */ }
  }

  for (const candidate of candidates) {
    try {
      await new FontFace("__survey_font_probe__", `local("${candidate.replace(/["\\]/g, "")}")`).load();
      return true;
    } catch { /* Try the next known local name. */ }
  }
  return false;
}
