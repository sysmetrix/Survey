// PPTX zip 패키징 — js/report/hwpx/package.js 와 같은 원칙(JSZip 하나로 조립)이지만, PPTX(OOXML)는
// HWPX/ODF와 달리 "mimetype 항목이 맨 앞·비압축"같은 규칙이 없어 훨씬 단순함.
import { CONTENT_TYPES_HEAD, CONTENT_TYPES_TAIL, PACKAGE_RELS, SLIDE_MASTER, SLIDE_MASTER_RELS, SLIDE_LAYOUT, SLIDE_LAYOUT_RELS, THEME } from "./template-parts.js";
import { presentationXml, presentationRelsXml, contentTypesXml, corePropsXml, appPropsXml, buildSlideXml, slideRelsXml } from "./writer.js";

/**
 * @param {{elements:object[]}[]} slides 슬라이드별 자유배치 요소 배열(자동 슬라이드도 이미 요소로 변환된 상태로 받음)
 * @param {(el:object) => Promise<{png:Uint8Array}|null>} rasterizeChart 차트 요소 → PNG(js/charts/rasterize.js 의 svgToPng 연결)
 */
export async function buildPptx({ slides, title = "발표 자료", creator = "", fontName, rasterizeChart, JSZip }) {
  const zip = new JSZip();
  const n = slides.length;
  if (!n) throw new Error("내보낼 슬라이드가 없습니다");
  const iso = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
  zip.file("[Content_Types].xml", contentTypesXml(n, CONTENT_TYPES_HEAD, CONTENT_TYPES_TAIL));
  zip.file("_rels/.rels", PACKAGE_RELS);
  zip.file("docProps/core.xml", corePropsXml({ title, creator, iso }));
  zip.file("docProps/app.xml", appPropsXml({ slideCount: n }));
  zip.file("ppt/presentation.xml", presentationXml(n));
  zip.file("ppt/_rels/presentation.xml.rels", presentationRelsXml(n));
  zip.file("ppt/slideMasters/slideMaster1.xml", SLIDE_MASTER);
  zip.file("ppt/slideMasters/_rels/slideMaster1.xml.rels", SLIDE_MASTER_RELS);
  zip.file("ppt/slideLayouts/slideLayout1.xml", SLIDE_LAYOUT);
  zip.file("ppt/slideLayouts/_rels/slideLayout1.xml.rels", SLIDE_LAYOUT_RELS);
  zip.file("ppt/theme/theme1.xml", THEME);
  let mediaSeq = 1;
  for (let i = 0; i < n; i++) {
    const { xml, images } = await buildSlideXml(slides[i], { fontName, rasterizeChart });
    for (const img of images) {
      img.mediaName = `image${mediaSeq}.${img.ext}`;
      mediaSeq++;
      zip.file(`ppt/media/${img.mediaName}`, img.bytes);
    }
    zip.file(`ppt/slides/slide${i + 1}.xml`, xml);
    zip.file(`ppt/slides/_rels/slide${i + 1}.xml.rels`, slideRelsXml(images));
  }
  return zip.generateAsync({ type: "uint8array", mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation", compressionOptions: { level: 6 } });
}
