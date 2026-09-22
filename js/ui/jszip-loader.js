// JSZip 은 HWPX·PPTX 내보내기/읽기(zip) 때만 필요하므로, 전역 <script> 로 미리 받는 대신 그 순간에만 받아온다.
let promise = null;

/** window.JSZip 를 돌려준다 — 이미 받아왔으면 그대로, 아니면 지금 받아와서 캐시 */
export function loadJSZip() {
  if (window.JSZip) return Promise.resolve(window.JSZip);
  if (!promise) {
    promise = new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = "vendor/jszip-3.10.1.min.js";
      s.onload = () => (window.JSZip ? resolve(window.JSZip) : reject(new Error("JSZip 라이브러리를 불러오지 못했습니다")));
      s.onerror = () => reject(new Error("JSZip 라이브러리를 불러오지 못했습니다(네트워크 확인)"));
      document.head.appendChild(s);
    }).catch(e => { promise = null; throw e; }); // 실패하면 다음에 다시 시도할 수 있게 캐시를 비움
  }
  return promise;
}
