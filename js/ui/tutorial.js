// 처음 사용자를 위한 자막형 화면 가이드. 진행 상태는 현재 브라우저에만 저장합니다.
import { go } from "./router.js";
import { icon } from "./icons.js";

const DONE_KEY = "survey-v5-tutorial-complete";
const SAMPLE = "2026_문화의집_만족도_구글폼.csv";
const STEPS = [
  { view: "load", target: "[data-act='tutorial']", title: "처음 사용자를 위한 화면 가이드", text: "실제 화면을 따라가며 샘플 설문을 분석하고 한글 보고서까지 만드는 과정을 보여 드립니다.\n샘플만 사용하므로 내 파일과 작업 내역은 바뀌지 않습니다." },
  { view: "load", target: "[data-drop='data']", title: "① 설문 파일 불러오기", text: "엑셀·CSV 파일을 이 자리에 끌어다 놓거나 눌러서 고르면 됩니다.\n구글폼·네이버폼에서 내려받은 원본 파일도 그대로 쓸 수 있습니다." },
  { view: "load", target: `[data-act='sample'][data-file='${SAMPLE}']`, title: "샘플 설문으로 따라 하기", text: "가장 단순한 만족도 조사 샘플을 자동으로 불러오겠습니다.", run: el => el.click(), wait: true },
  { view: "setup", target: ".facts", title: "② 자동 인식 결과 확인", text: "응답자 수와 조사 설계를 먼저 확인하세요.\n대부분은 자동으로 판별되며, 경고가 표시된 항목만 고치면 됩니다." },
  { view: "setup", target: ".tblwrap", title: "문항 설정 확인", text: "문항 역할과 척도 범위, 역문항을 확인합니다.\n문자로 된 보기는 보기별 점수를 정해 주면 숫자로 분석됩니다." },
  { view: "setup", target: "[data-act='goto'][data-to='business']", title: "다음 단계로 이동", text: "문항 설정을 마쳤으니 다음 단계로 넘어가겠습니다.", run: el => el.click(), wait: true },
  { view: "business", target: ".quick-kpis", title: "③ 성과지표는 선택 사항", text: "목표 달성 여부를 보고서에 넣고 싶을 때만 빠른 추가를 사용하세요.\n단순 만족도 분석이라면 입력하지 않아도 됩니다." },
  { view: "business", target: "[data-change='load-plan-doc']", title: "사업계획서로 초안 채우기", text: "HWPX 사업 운영계획서를 올리면 사업정보·논리모형·성과지표 초안을 자동으로 채워 줍니다.\n자동 인식 결과이니 목표값과 내용은 꼭 확인하세요." },
  { view: "business", target: "[data-act='goto'][data-to='dash']", title: "분석 결과 보기", text: "샘플 분석 결과로 이동합니다.", run: el => el.click(), wait: true },
  { view: "dash", target: ".page-head", title: "④ 핵심 결과부터 확인", text: "응답자 수와 종합 점수를 먼저 확인합니다. 통계 계산은 모두 이 브라우저 안에서만 이뤄집니다." },
  { view: "dash", target: ".tabs", title: "장별로 나눠 보기", text: "분석 결과는 보고서의 장 구성 그대로 탭으로 나뉩니다.\n마지막 품질 탭에서 무응답과 불성실 응답을 확인할 수 있습니다." },
  { view: "dash", target: "[data-act='goto'][data-to='report']", title: "보고서 만들기", text: "분석 결과를 자동 문장과 그래프로 정리한 보고서 미리보기로 이동합니다.", run: el => el.click(), wait: true },
  { view: "report", target: ".report-layout .side", title: "⑤ 보고서 기본 정보", text: "기관·부서명, 담당자명, 보고서 제목과 작성일을 확인하세요.\n기관·부서명과 담당자명은 이 브라우저에 저장되어 다음 보고서에도 그대로 쓰입니다." },
  { view: "report", target: ".rt-fmt-trigger", title: "한글 문서 서식 고르기", text: "위쪽 도구모음에서 눌러 펼치면 글꼴·글자 크기·줄 간격을 바로 미리보며 고를 수 있습니다. 기본값은 휴먼명조입니다." },
  { view: "report", target: "#reportPaper", title: "문장 직접 고치기", text: "자동으로 작성된 문장을 눌러 그 자리에서 고칠 수 있습니다.\nEnter로 확정, ✕로 문장 빼기, ↺로 자동 문장 복원입니다." },
  { view: "report", target: "[data-act='export-hwpx']", title: "한글 파일로 내려받기", text: "표와 그래프까지 들어간 한글(HWPX) 문서로 저장합니다.\n바로 아래에 인쇄·PDF 저장과 워드 붙여넣기용 복사도 있습니다." },
  { view: "report", target: "#presentBtn", title: "발표 자료도 자동으로", text: "같은 분석 결과로 발표용 슬라이드가 함께 만들어집니다.\n발표 화면에서 자료를 PDF나 HTML 파일로 내려받을 수도 있습니다." },
  { view: "report", target: "#historyBtn", title: "되돌리기와 작업 내역", text: "잘못 고쳤다면 Ctrl+Z로 되돌릴 수 있고, 작업 내역에서는 이전 버전으로 되돌아가거나 예전 작업을 다시 열 수 있습니다." },
  { view: "report", target: "#settingsBtn", title: "가이드를 마칩니다", text: "상단 설정에서 기관·담당자 정보를 저장하거나 이 가이드를 다시 볼 수 있습니다.\n이제 내 설문 파일로 시작해 보세요.", done: true },
];

/** 자막을 읽을 시간 (자동 실행 단계는 짧게) */
const stepMsOf = s => (s.run ? 3500 : 7000);
const TOTAL_MS = STEPS.reduce((t, s) => t + stepMsOf(s), 0);
const BEFORE_MS = STEPS.map((_, i) => STEPS.slice(0, i).reduce((t, s) => t + stepMsOf(s), 0));

const TICK_MS = 100;   // 0.1초마다 진행 막대·타이머 갱신 (CSS 전환으로 부드럽게 이어짐)

let active = false, index = 0, paused = false, lastFocus = null;
let shown = -1, navFor = -1, stepMs = 0, lastTs = 0, timer = 0;
// 앞 단계가 앱 동작(샘플 불러오기 등)을 실행했으면 앱이 스스로 화면을 옮길 때까지 기다린다
let awaitApp = false;
// 가이드가 스스로 누른 클릭인지 (사용자 조작과 구분)
let selfClick = false;

const mmss = ms => `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, "0")}`;

const ensureUi = () => {
  if (document.getElementById("tutorialBar")) return;
  document.body.insertAdjacentHTML("beforeend", `<section id="tutorialBar" class="tutorial-bar no-print" role="dialog" aria-modal="false" aria-labelledby="tutorialTitle" hidden>
    <div class="tutorial-progress" aria-hidden="true"><i></i></div>
    <div class="tutorial-copy"><div class="tutorial-meta"><span class="tutorial-kicker">화면 가이드 <b id="tutorialCount"></b></span><span class="tutorial-left" id="tutorialLeft"></span><span class="tutorial-timer" id="tutorialTimer" aria-hidden="true"></span></div><h2 id="tutorialTitle"></h2><p id="tutorialText"></p></div>
    <div class="tutorial-controls"><button class="btn sm ghost" data-tutorial="stop">끝내기</button><button class="btn sm sub" id="tutorialPause" data-tutorial="pause"></button><button class="btn sm primary" data-tutorial="next">다음</button></div>
  </section>`);
  document.addEventListener("click", e => {
    const button = e.target.closest("[data-tutorial]");
    if (!button) return;
    if (button.dataset.tutorial === "stop") stopGuide(false);
    if (button.dataset.tutorial === "pause") togglePause();
    if (button.dataset.tutorial === "next") advance();
  });
  // 사용자가 직접 화면을 조작하면 가이드를 접는다 (가이드가 화면을 자기 단계로 되돌리지 않도록)
  document.addEventListener("click", e => {
    if (!active || selfClick || e.target.closest("[data-tutorial], [data-act='tutorial']")) return;
    if (e.target.closest("[data-act], [data-change], [data-drop], a[href]")) stopGuide(false);
  }, true);
};

const clearHighlight = () => document.querySelectorAll(".tutorial-focus").forEach(el => el.classList.remove("tutorial-focus"));

/** 일시정지 버튼: 아이콘 + 지금 누르면 무슨 일이 생기는지 글로 표시 */
function paintPause() {
  const el = document.getElementById("tutorialPause");
  if (!el) return;
  const label = paused ? "이어보기" : "일시정지";
  el.innerHTML = `${icon(paused ? "play" : "pause", 14)}<span>${label}</span>`;
  el.setAttribute("aria-label", paused ? "자동 재생 이어보기" : "자동 재생 일시정지");
  el.title = paused ? "멈춘 가이드를 이어서 봅니다" : "가이드를 잠시 멈춥니다";
}

/** 진행 막대·타이머는 매 프레임 갱신 (단계가 바뀌어도 끊기지 않게 경과 시간 기준) */
function paint() {
  const bar = document.getElementById("tutorialBar");
  if (!bar || bar.hidden) return;
  const step = STEPS[index];
  const done = Math.min(TOTAL_MS, (BEFORE_MS[index] ?? TOTAL_MS) + (step ? Math.min(stepMs, stepMsOf(step)) : 0));
  bar.querySelector(".tutorial-progress i").style.width = `${(done / TOTAL_MS * 100).toFixed(2)}%`;
  document.getElementById("tutorialTimer").textContent = `전체 ${mmss(done)} / ${mmss(TOTAL_MS)}`;
  // 이 단계에 남은 시간을 눈에 띄게 (다음 화면으로 언제 넘어가는지 알 수 있도록)
  const left = step ? Math.max(0, Math.ceil((stepMsOf(step) - stepMs) / 1000)) : 0;
  const leftEl = document.getElementById("tutorialLeft");
  leftEl.textContent = paused ? "일시정지" : `${left}초 뒤 ${step?.done ? "마침" : "다음"}`;
  leftEl.classList.toggle("paused", paused);
}

function tick() {
  if (!active) return;
  const step = STEPS[index];
  if (!step) return stopGuide(true);
  const now = Date.now();
  // 화면이 가려져 간격이 길어져도 한 번에 크게 건너뛰지 않도록 제한
  const dt = lastTs ? Math.min(250, now - lastTs) : 0;
  lastTs = now;
  if (!paused) stepMs += dt;
  if (shown !== index) showStep();
  paint();
  const limit = stepMsOf(step);
  // 대상이 끝내 나타나지 않아도 멈추지 않도록 여유 시간 뒤에는 다음 단계로
  if (!paused && stepMs >= (shown === index ? limit : limit + 4000)) advance();
}

/** 현재 단계를 화면에 표시 (화면 이동·대상 등장까지는 다음 프레임에 다시 시도) */
function showStep() {
  const step = STEPS[index];
  if (!step) return stopGuide(true);
  const current = location.hash.replace(/^#\/?/, "").split("/")[0] || "load";
  if (current !== step.view) {
    if (!awaitApp && navFor !== index) { navFor = index; go(step.view); }
    return;
  }
  awaitApp = false;
  const target = document.querySelector(step.target);
  if (!target) return;
  clearHighlight();
  target.classList.add("tutorial-focus");
  target.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "center" });
  const bar = document.getElementById("tutorialBar");
  bar.hidden = false;
  document.getElementById("tutorialTitle").textContent = step.title;
  document.getElementById("tutorialText").textContent = step.text;
  document.getElementById("tutorialCount").textContent = `${index + 1}/${STEPS.length}`;
  const next = bar.querySelector("[data-tutorial='next']");
  next.textContent = step.done ? "완료" : step.run ? "지금 실행" : "다음";
  shown = index;
}

function advance() {
  const step = STEPS[index];
  if (!step || step.done) return stopGuide(true);
  const target = step.run ? document.querySelector(step.target) : null;
  index += 1; stepMs = 0; shown = -1; navFor = -1; awaitApp = !!step.wait;
  if (step.run && target) {
    selfClick = true;
    try { step.run(target); } finally { selfClick = false; }
  }
  paint();
}

function togglePause() {
  paused = !paused;
  paintPause();
  paint();
}

export function startGuide() {
  ensureUi();
  lastFocus = document.activeElement;
  active = true; index = 0; paused = false; shown = -1; navFor = -1; stepMs = 0; lastTs = 0; awaitApp = false;
  paintPause();
  if (!timer) timer = setInterval(tick, TICK_MS);
  tick();
}

export function stopGuide(completed = false) {
  active = false;
  if (timer) { clearInterval(timer); timer = 0; }
  clearHighlight();
  const bar = document.getElementById("tutorialBar"); if (bar) bar.hidden = true;
  // 완료뿐 아니라 사용자가 끝내기를 선택한 경우도 다음 방문에 강제로 다시 띄우지 않습니다.
  localStorage.setItem(DONE_KEY, completed ? "complete" : "dismissed");
  lastFocus?.focus?.();
}

/** 화면이 다시 그려지면 강조 표시가 지워지므로 곧바로 다시 표시 */
export function syncGuide() { if (active) { shown = -1; showStep(); } }

export function offerFirstRun() {
  ensureUi();
  if (localStorage.getItem(DONE_KEY) || sessionStorage.getItem(`${DONE_KEY}-offered`)) return;
  sessionStorage.setItem(`${DONE_KEY}-offered`, "1");
  setTimeout(startGuide, 550);
}
