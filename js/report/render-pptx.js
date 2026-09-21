// 발표 슬라이드(state.deckOverrides 기준) → PPTX 바이트. 자동(비편집) 슬라이드는 자유배치 편집기와
// 같은 elementsFromAutoSlide() 로 도형 배치를 만들어, 화면 그리드 레이아웃과 PPTX 배치가 같은 소스를 씀.
import { buildPptx } from "./pptx/package.js";
import { elementsFromAutoSlide } from "../present/edit/detach.js";
import { resolveFonts } from "./hwpx/fonts.js";

/**
 * @param {object[]} slides assembledDeckSlides() 결과(숨김 제외, 순서 반영 완료)
 * @param {{bySlide:object}} deckOverrides state.deckOverrides
 * @param {{rasterizeChart:(el:object)=>Promise<{png:Uint8Array}|null>, JSZip:any, title?:string, creator?:string, settings?:object}} env
 */
export async function renderPptx(slides, deckOverrides, env) {
  const bySlide = deckOverrides?.bySlide || {};
  const fonts = resolveFonts(env.settings || {});
  const entries = slides.map(s => {
    const entry = bySlide[s.id];
    const mode = entry?.mode || (s.type === "custom" ? "custom" : "auto");
    return { elements: mode === "custom" ? (entry?.elements || []) : elementsFromAutoSlide(s) };
  });
  // 요소마다 "제목이냐 본문이냐" 구분이 없어 폰트 하나만 고름 — 대부분 값·라벨 같은 본문성 텍스트라 본문 글꼴을 씀
  return buildPptx({
    slides: entries, title: env.title, creator: env.creator,
    fontName: fonts.body,
    rasterizeChart: env.rasterizeChart, JSZip: env.JSZip,
  });
}
