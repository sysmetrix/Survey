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
  // 크롬/엣지는 글꼴을 DirectWrite로 찾는데, KoPub 배포판은 굵기별(Medium/Bold/Light)로 다른 이름을 등록한
  // GDI 방식 이름("KoPub돋움체 Medium" 등)이 아니라 하나의 패밀리 "KoPubDotum"(굵기는 font-weight로 구분)만
  // 노출한다. 그래서 화면 미리보기(CSS font-family)는 이 이름이 없으면 조용히 다음 후보로 넘어가 끝까지
  // 실패하고 함초롬으로 대체되어 보인다(설치 확인은 local() 전체이름 매칭이라 별개로 성공해서 더 헷갈림).
  "KoPub돋움체 Medium": ["KoPub돋움체", "KoPub Dotum Medium", "KoPubWorldDotum Medium", "KoPubWorld Dotum", "KoPubDotum"],
  "KoPub돋움체 Bold": ["KoPub Dotum Bold", "KoPubWorldDotum Bold", "KoPubDotum"],
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
