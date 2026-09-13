// 한글에서 저장한 빈 HWPX(templates/hwpx/blank.hwpx)에서 템플릿 조각을 추출해
// js/report/hwpx/template-parts.js 를 생성한다.  사용: node tools/hwpx-extract-template.mjs [hwpx경로]
import { readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const JSZip = require("../vendor/jszip-3.10.1.min.js");

const src = process.argv[2] || "templates/hwpx/blank.hwpx";
const zip = await JSZip.loadAsync(await readFile(src));
const read = p => zip.file(p).async("string");

const header = await read("Contents/header.xml");
const section = await read("Contents/section0.xml");
const secOpen = section.match(/^[\s\S]*?<hs:sec[^>]*>/)[0];
const secPr = section.match(/<hp:secPr[\s\S]*?<\/hp:secPr>/)[0];
const colPr = section.match(/<hp:ctrl><hp:colPr[^>]*\/><\/hp:ctrl>/)[0];

// 한글 글꼴 인덱스 (fontface lang="HANGUL")
const hangulFaces = header.match(/<hh:fontface lang="HANGUL"[\s\S]*?<\/hh:fontface>/)[0];
const faces = [...hangulFaces.matchAll(/<hh:font id="(\d+)" face="([^"]+)"/g)].map(m => ({ id: +m[1], face: m[2] }));
const findFont = re => (faces.find(f => re.test(f.face)) || faces[0]).id;

const parts = {
  SOURCE: src.replace(/\\/g, "/"),
  HEADER_XML: header,
  SECTION_OPEN: secOpen,
  SEC_PR: secPr,
  COL_PR: colPr,
  VERSION_XML: await read("version.xml"),
  SETTINGS_XML: await read("settings.xml"),
  CONTAINER_XML: await read("META-INF/container.xml"),
  CONTAINER_RDF: await read("META-INF/container.rdf"),
  MANIFEST_XML: await read("META-INF/manifest.xml"),
  CONTENT_HPF: await read("Contents/content.hpf"),
  FONTS: { dotum: findFont(/돋움/), batang: findFont(/바탕/), faces },
};

const out = `// 자동 생성 파일 — 직접 수정하지 말 것. 생성: node tools/hwpx-extract-template.mjs
// 원본: ${parts.SOURCE} (한글에서 저장한 빈 문서)
export const TEMPLATE_PARTS = ${JSON.stringify(parts, null, 1)};
`;
await writeFile("js/report/hwpx/template-parts.js", out, "utf8");
console.log("template-parts.js 생성 완료. 글꼴:", faces.map(f => `${f.id}:${f.face}`).join(", "), "→", parts.FONTS.dotum, parts.FONTS.batang);
