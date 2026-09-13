// HWPX(ZIP) 패키징 — mimetype 을 첫 항목·무압축으로 저장
/**
 * @param {{path:string, data:Uint8Array, store?:boolean}[]} entries  writer.finish() 결과
 * @param {any} JSZip  JSZip 생성자 (브라우저 전역 또는 Node require)
 * @param {'uint8array'|'blob'} type
 */
export async function packHwpx(entries, JSZip, type = "uint8array") {
  if (entries[0]?.path !== "mimetype") throw new Error("mimetype 항목이 첫 번째여야 합니다");
  const zip = new JSZip();
  for (const e of entries) {
    zip.file(e.path, e.data, { binary: true, compression: e.store ? "STORE" : "DEFLATE" });
  }
  return zip.generateAsync({ type, mimeType: "application/hwp+zip", compressionOptions: { level: 6 } });
}
