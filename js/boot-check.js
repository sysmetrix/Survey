// 파일을 직접 더블클릭(file://)해 열면 ES 모듈이 차단되므로 안내 표시
(function () {
  if (location.protocol !== "file:") return;
  document.addEventListener("DOMContentLoaded", function () {
    var d = document.createElement("div");
    d.className = "filewarn";
    d.innerHTML = "<b>웹 주소로 접속해 주세요.</b> 이 도구는 브라우저 보안 정책상 파일을 직접 열면 동작하지 않습니다.<br>" +
      "https://sysmetrix.github.io/Survey/ 로 접속하거나, 폴더에서 <code>python -m http.server 8000</code> 실행 후 http://localhost:8000/ 을 여세요.";
    document.body.insertBefore(d, document.body.firstChild);
  });
})();
