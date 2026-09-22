// SheetJS(XLSX)는 900KB 넘는 무거운 라이브러리라, 전역 <script> 로 미리 받는 대신
// .xlsx/.xls 파일을 실제로 다루는 순간에만 받아온다(CSV만 쓰면 한 번도 안 받음).
let promise = null;

/** window.XLSX 를 돌려준다 — 이미 받아왔으면 그대로, 아니면 지금 받아와서 캐시 */
export function loadXlsx() {
  if (window.XLSX) return Promise.resolve(window.XLSX);
  if (!promise) {
    promise = new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = "vendor/xlsx-0.20.3.full.min.js";
      s.onload = () => (window.XLSX ? resolve(window.XLSX) : reject(new Error("XLSX 라이브러리를 불러오지 못했습니다")));
      s.onerror = () => reject(new Error("XLSX 라이브러리를 불러오지 못했습니다(네트워크 확인)"));
      document.head.appendChild(s);
    }).catch(e => { promise = null; throw e; }); // 실패하면 다음에 다시 시도할 수 있게 캐시를 비움
  }
  return promise;
}
