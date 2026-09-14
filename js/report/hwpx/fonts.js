// HWPX 글꼴 설정 (순수 모듈)
// HWPX 에는 글꼴 파일이 들어가지 않고 이름만 기록되므로, 받는 PC에 없는 글꼴은 대체 글꼴(substFont)로 표시되게 한다.
// 참고: sysmetrix/To-Hwpx — 실제 설치 패밀리명 기록, Pretendard GOV/Variable 교차 대체, KoPub 굵게는 별도 Bold 글꼴

export const FONT_PRESETS = [
  { id: "hancom", name: "함초롬 (한글 기본)", body: "함초롬바탕", heading: "함초롬돋움", note: "한글(한컴오피스)에 기본 포함 — 어느 PC에서나 같은 모양" },
  { id: "gov", name: "공문서형 (휴먼명조 · HY헤드라인M)", body: "휴먼명조", heading: "HY헤드라인M", note: "행정기관 보고서에서 많이 쓰는 조합, 한컴오피스 설치 시 포함" },
  { id: "malgun", name: "맑은 고딕", body: "맑은 고딕", heading: "맑은 고딕", note: "Windows 기본 글꼴" },
  { id: "nanum", name: "나눔고딕", body: "나눔고딕", heading: "나눔고딕", note: "무료 글꼴 — 받는 PC에도 설치 필요", url: "https://hangeul.naver.com/font" },
  { id: "kopub", name: "KoPub돋움체", body: "KoPub돋움체 Medium", heading: "KoPub돋움체 Medium", boldFace: "KoPub돋움체 Bold", note: "무료 공공 글꼴 — 굵은 글자는 KoPub돋움체 Bold 사용", url: "https://www.kopus.org/biz-electronic-font2/" },
  { id: "noto", name: "Noto Sans KR", body: "Noto Sans KR", heading: "Noto Sans KR", note: "무료 글꼴 — 받는 PC에도 설치 필요", url: "https://fonts.google.com/noto/specimen/Noto+Sans+KR" },
  { id: "pretendard", name: "Pretendard GOV", body: "Pretendard GOV Variable", heading: "Pretendard GOV Variable", note: "무료 공공 글꼴 — 설치 이름(GOV/GOV Variable)을 서로 대체 지정", url: "https://github.com/orioncactus/pretendard/releases/tag/v1.3.9" },
  { id: "custom", name: "직접 입력", body: "", heading: "", note: "PC에 설치된 글꼴 이름을 정확히 입력(한글 글꼴 목록에 보이는 이름)" },
];

export const FONT_SIZES = [10, 10.5, 11, 12, 13, 14, 15];
export const LINE_SPACINGS = [150, 160, 170, 180];

const HANCOM = { body: "함초롬바탕", heading: "함초롬돋움" };

/** 글꼴 이름 정리 (XML·CSS 안전): 한글·영문·숫자·공백·일부 기호, 최대 40자 */
export const cleanFontName = s => String(s ?? "").replace(/[^\p{L}\p{N} ._\-()]/gu, "").replace(/\s+/g, " ").trim().slice(0, 40);

/**
 * 설정 → 실제 글꼴 지정
 * @param {{fontPreset?:string, fontBody?:string, fontHeading?:string}} settings
 * @returns {{id:string, body:string, heading:string, boldFace:string|null, substBody:string|null, substHeading:string|null}}
 */
export function resolveFonts(settings = {}) {
  const p = FONT_PRESETS.find(x => x.id === settings.fontPreset) || FONT_PRESETS[0];
  let body = p.body, heading = p.heading;
  if (p.id === "custom") {
    body = cleanFontName(settings.fontBody) || HANCOM.body;
    heading = cleanFontName(settings.fontHeading) || body;
  }
  const isHancom = n => /^함초롬/.test(n);
  const pretendardAlt = n => (n === "Pretendard GOV Variable" ? "Pretendard GOV" : n === "Pretendard GOV" ? "Pretendard GOV Variable" : null);
  return {
    id: p.id, body, heading, boldFace: p.boldFace || null,
    // 받는 PC에 글꼴이 없을 때: Pretendard 는 다른 설치 이름, 그 밖에는 함초롬으로 표시
    substBody: pretendardAlt(body) || (isHancom(body) ? null : HANCOM.body),
    substHeading: pretendardAlt(heading) || (isHancom(heading) ? null : HANCOM.heading),
  };
}

function fontMeta(name) {
  const myeongjo = /명조|바탕|궁서|batang|myeongjo|serif/i.test(name);
  return { familyType: myeongjo ? "FCAT_MYEONGJO" : "FCAT_GOTHIC", weight: myeongjo ? 5 : 6, type: /^(바탕|돋움|굴림|궁서)체?$/.test(name) ? "HFT" : "TTF" };
}
const attr = s => String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
const fontXml = (id, face, subst) => {
  const m = fontMeta(face);
  return `<hh:font id="${id}" face="${attr(face)}" type="${m.type}" isEmbedded="0">` +
    (subst ? `<hh:substFont face="${attr(subst)}" type="TTF" isEmbedded="0"/>` : "") +
    `<hh:typeInfo familyType="${m.familyType}" weight="${m.weight}" proportion="4" contrast="0" strokeVariation="1" armStyle="1" letterform="1" midline="1" xHeight="1"/></hh:font>`;
};

/**
 * header.xml 의 모든 언어 글꼴 목록을 지정 글꼴로 교체
 * 글꼴 id 약속: 0 = 제목(돋움 계열), 1 = 본문(바탕 계열), 2 = 굵은 글꼴(별도 Bold 글꼴이 있을 때)
 */
export function applyFontsToHeader(headerXml, fonts) {
  return headerXml.replace(/<hh:fontface lang="([A-Z]+)" fontCnt="\d+">([\s\S]*?)<\/hh:fontface>/g, (m, lang, inner) => {
    const existing = [...inner.matchAll(/<hh:font id="(\d+)" face="([^"]*)"[\s\S]*?<\/hh:font>/g)];
    const rest = existing.filter(f => +f[1] > 2).map(f => f[0]);
    const f2 = fonts.boldFace || existing.find(f => f[1] === "2")?.[2] || fonts.heading;
    const list = [fontXml(0, fonts.heading, fonts.substHeading), fontXml(1, fonts.body, fonts.substBody), fontXml(2, f2, fonts.boldFace ? fonts.substHeading : null), ...rest];
    return `<hh:fontface lang="${lang}" fontCnt="${list.length}">${list.join("")}</hh:fontface>`;
  });
}
