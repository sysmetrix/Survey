// 첫 화면 그리기 전에 실행되는 동기 스크립트 (CSP 때문에 인라인 대신 파일)
// 1) 저장된 화면 테마를 먼저 적용해 깜빡임 방지  2) file:// 로 열었을 때 안내
(function () {
  try {
    var t = localStorage.getItem("survey-v5-theme");
    if (t === "light" || t === "dark") document.documentElement.setAttribute("data-theme", t);
  } catch (e) { /* 저장소 사용 불가 */ }
  if (location.protocol !== "file:") return;
  document.addEventListener("DOMContentLoaded", function () {
    var d = document.createElement("div");
    d.className = "filewarn";
    d.innerHTML = "<b>웹 주소로 접속해 주세요.</b> 이 도구는 브라우저 보안 정책상 파일을 직접 열면 동작하지 않습니다.<br>" +
      "https://sysmetrix.github.io/Survey/ 로 접속하거나, 폴더에서 <code>python -m http.server 8000</code> 실행 후 http://localhost:8000/ 을 여세요.";
    document.body.insertBefore(d, document.body.firstChild);
  });
})();
