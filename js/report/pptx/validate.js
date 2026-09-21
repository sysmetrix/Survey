// PPTX 구조 검증 (순수 모듈). DOMParser 구현을 주입받는다 (브라우저: window.DOMParser, Node: @xmldom/xmldom)
// js/report/hwpx/validate.js 와 같은 원칙 — 실제 zip을 만들지 않고도 XML 잘 만들어졌는지, 관계(rels)가
// 서로 어긋나지 않는지(파워포인트 "복구" 프롬프트의 주 원인) 확인.
/**
 * @param {{path:string, data:Uint8Array|string}[]} entries (zip 안 파일들, 순서 무관)
 * @param {new () => DOMParser} DOMParserImpl
 * @returns {string[]} 오류 목록(비어 있으면 통과)
 */
export function validatePptx(entries, DOMParserImpl) {
  const errors = [];
  const dec = new TextDecoder();
  const byPath = new Map(entries.map(e => [e.path.replace(/\\/g, "/"), e]));
  const text = p => { const e = byPath.get(p); return e ? (typeof e.data === "string" ? e.data : dec.decode(e.data)) : null; };
  const exists = p => byPath.has(p);

  for (const req of ["[Content_Types].xml", "_rels/.rels", "ppt/presentation.xml", "ppt/_rels/presentation.xml.rels", "ppt/slideMasters/slideMaster1.xml", "ppt/slideLayouts/slideLayout1.xml", "ppt/theme/theme1.xml", "docProps/core.xml", "docProps/app.xml"]) {
    if (!exists(req)) errors.push(`필수 항목 없음: ${req}`);
  }

  // XML 정합성(모든 .xml 파일이 well-formed 인지)
  const docs = {};
  for (const e of entries) {
    if (!e.path.endsWith(".xml")) continue;
    const src = text(e.path);
    let parseErr = null;
    const parser = new DOMParserImpl({ onError: (lvl, msg) => { if (lvl !== "warning") parseErr = msg; }, errorHandler: { error: m => { parseErr = m; }, fatalError: m => { parseErr = m; } } });
    try {
      const doc = parser.parseFromString(src, "application/xml");
      const pe = doc.getElementsByTagName?.("parsererror");
      if (pe && pe.length) parseErr = pe[0].textContent;
      docs[e.path] = doc;
    } catch (ex) { parseErr = ex.message; }
    if (parseErr) errors.push(`XML 파싱 오류 (${e.path}): ${String(parseErr).slice(0, 200)}`);
  }

  // [Content_Types].xml 이 실제 존재하는 파트 확장자를 모두 Default 로 덮는지
  const ct = text("[Content_Types].xml") || "";
  const defaults = new Set([...ct.matchAll(/<Default Extension="([^"]+)"/g)].map(m => m[1].toLowerCase()));
  const overrides = new Set([...ct.matchAll(/<Override PartName="([^"]+)"/g)].map(m => m[1]));
  for (const e of entries) {
    if (e.path === "[Content_Types].xml") continue;
    const ext = e.path.split(".").pop().toLowerCase();
    const partName = `/${e.path}`;
    if (!defaults.has(ext) && !overrides.has(partName)) errors.push(`[Content_Types].xml 에 없는 파트: ${e.path}`);
  }
  // 슬라이드는 Override 로 콘텐츠 타입을 명시해야 함(스키마 요구)
  const slideFiles = entries.filter(e => /^ppt\/slides\/slide\d+\.xml$/.test(e.path)).map(e => e.path);
  for (const p of slideFiles) if (!overrides.has(`/${p}`)) errors.push(`[Content_Types].xml 에 슬라이드 Override 없음: ${p}`);

  // presentation.xml 의 슬라이드 목록 수 == 실제 슬라이드 파일 수
  const presXml = text("ppt/presentation.xml") || "";
  const sldIds = [...presXml.matchAll(/<p:sldId [^>]*r:id="([^"]+)"/g)].map(m => m[1]);
  if (sldIds.length !== slideFiles.length) errors.push(`presentation.xml 슬라이드 수(${sldIds.length}) != 실제 슬라이드 파일 수(${slideFiles.length})`);

  // r:id/r:embed 참조가 해당 파트의 .rels 안에 실제 있는지, .rels 의 Target 이 실제 존재하는지
  const relsFor = p => {
    const dir = p.includes("/") ? p.slice(0, p.lastIndexOf("/")) : "";
    const base = p.includes("/") ? p.slice(p.lastIndexOf("/") + 1) : p;
    const relsPath = dir ? `${dir}/_rels/${base}.rels` : `_rels/${base}.rels`;
    return { relsPath, dir };
  };
  const checkRefs = p => {
    const src = text(p);
    if (!src) return;
    const { relsPath, dir } = relsFor(p);
    const relsSrc = text(relsPath);
    const relIds = new Set([...(relsSrc || "").matchAll(/<Relationship Id="([^"]+)"/g)].map(m => m[1]));
    const used = [...src.matchAll(/r:(?:id|embed)="([^"]+)"/g)].map(m => m[1]);
    for (const id of used) if (!relIds.has(id)) errors.push(`${p}: r:id/r:embed="${id}" 가 ${relsPath} 에 없음`);
    if (relsSrc) {
      for (const m of relsSrc.matchAll(/Target="([^"]+)"/g)) {
        if (/^https?:/.test(m[1])) continue;
        const target = new URL(m[1], `file:///${dir}/`).pathname.replace(/^\//, "");
        if (!exists(target)) errors.push(`${relsPath}: Target 없음 -> ${target}`);
      }
    }
  };
  checkRefs("ppt/presentation.xml");
  for (const p of slideFiles) {
    checkRefs(p);
    // 슬라이드 XML 안에 r:id 참조가 전혀 없어도(그림 없는 슬라이드) .rels 파일 자체는 항상 있어야 하고
    // 그 안에 레이아웃 관계(rId1)가 있어야 함 — 없으면 PowerPoint가 "복구"를 시도하는 대표 원인
    const { relsPath } = relsFor(p);
    const relsSrc = text(relsPath);
    if (!relsSrc) errors.push(`${p}: 관계 파일 없음(${relsPath}) — 레이아웃 연결 누락`);
    else if (!/Type="[^"]*\/relationships\/slideLayout"/.test(relsSrc)) errors.push(`${relsPath}: slideLayout 관계 없음`);
  }

  return errors;
}
