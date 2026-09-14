// 처음 사용자를 위한 자막형 화면 가이드. 진행 상태는 현재 브라우저에만 저장합니다.
import { go } from "./router.js";

const DONE_KEY = "survey-v5-tutorial-complete";
const SAMPLE = "2026_문화의집_만족도_구글폼.csv";
const STEPS = [
  { view: "load", target: "[data-act='tutorial']", title: "처음 사용자를 위한 3분 가이드", text: "실제 화면을 따라가며 샘플 설문을 분석하고 보고서 미리보기까지 확인합니다. 샘플만 사용하므로 내 파일과 작업 내역은 바뀌지 않습니다." },
  { view: "load", target: `[data-act='sample'][data-file='${SAMPLE}']`, title: "샘플 설문 불러오기", text: "가장 단순한 만족도 조사 샘플을 자동으로 불러오겠습니다. 실제 파일을 사용할 때도 같은 자리에 끌어다 놓으면 됩니다.", run: el => el.click(), wait: true },
  { view: "setup", target: ".facts", title: "자동 인식 결과 확인", text: "응답자 수와 조사 설계를 먼저 확인하세요. 대부분은 자동으로 판별되며, 경고가 표시된 항목만 고치면 됩니다." },
  { view: "setup", target: ".tblwrap", title: "문항 설정 확인", text: "문항 역할과 척도 범위, 역문항을 확인합니다. 샘플에서는 자동 인식된 값을 그대로 사용해도 됩니다." },
  { view: "setup", target: "[data-act='goto'][data-to='business']", title: "다음 단계로 이동", text: "성과지표는 선택 사항입니다. 지금은 화면의 구성을 확인한 뒤 건너뛰겠습니다.", run: el => el.click(), wait: true },
  { view: "business", target: ".quick-kpis", title: "성과지표는 선택 사항", text: "목표 달성 여부가 필요할 때만 빠른 추가를 사용하세요. 단순 만족도 분석이라면 입력하지 않아도 됩니다." },
  { view: "business", target: "[data-act='goto'][data-to='dash']", title: "분석 결과 보기", text: "샘플 분석 결과로 이동합니다.", run: el => el.click(), wait: true },
  { view: "dash", target: ".page-head", title: "핵심 결과부터 확인", text: "먼저 응답자 수와 종합 결과를 확인하고, 아래 탭에서 문항별·집단별 결과를 살펴보세요." },
  { view: "dash", target: "[data-act='goto'][data-to='report']", title: "보고서 만들기", text: "분석 결과를 자동 문장과 그래프로 정리한 보고서 미리보기로 이동합니다.", run: el => el.click(), wait: true },
  { view: "report", target: ".report-layout .side", title: "보고서 서식과 내보내기", text: "글꼴·글자 크기·줄 간격을 바꾸면 미리보기에 즉시 반영됩니다. 확인 후 한글(HWPX)이나 PDF로 저장하세요." },
  { view: "report", target: "#reportPaper", title: "첫 분석을 완료했습니다", text: "자동 작성된 문장을 눌러 직접 수정할 수도 있습니다. 가이드는 상단 설정에서 언제든 다시 볼 수 있습니다.", done: true },
];

let active = false, index = 0, paused = false, timer = 0, lastFocus = null;

const ensureUi = () => {
  if (document.getElementById("tutorialBar")) return;
  document.body.insertAdjacentHTML("beforeend", `<section id="tutorialBar" class="tutorial-bar no-print" role="dialog" aria-modal="false" aria-labelledby="tutorialTitle" hidden>
    <div class="tutorial-progress" aria-hidden="true"><i></i></div>
    <div class="tutorial-copy"><span class="tutorial-kicker">화면 가이드 <b id="tutorialCount"></b></span><h2 id="tutorialTitle"></h2><p id="tutorialText"></p></div>
    <div class="tutorial-controls"><button class="btn sm ghost" data-tutorial="stop">끝내기</button><button class="icon-btn" data-tutorial="pause" aria-label="자동 재생 일시정지">Ⅱ</button><button class="btn sm primary" data-tutorial="next">다음</button></div>
  </section>`);
  document.addEventListener("click", e => {
    const button = e.target.closest("[data-tutorial]");
    if (!button) return;
    if (button.dataset.tutorial === "stop") stopGuide(false);
    if (button.dataset.tutorial === "pause") togglePause(button);
    if (button.dataset.tutorial === "next") advance();
  });
};

const clearHighlight = () => document.querySelectorAll(".tutorial-focus").forEach(el => el.classList.remove("tutorial-focus"));
const schedule = () => {
  clearTimeout(timer);
  if (!paused && active) timer = setTimeout(advance, STEPS[index]?.run ? 2600 : 5200);
};

function showStep() {
  if (!active) return;
  ensureUi(); clearHighlight();
  const step = STEPS[index];
  if (!step) return stopGuide(true);
  const current = location.hash.replace(/^#\/?/, "").split("/")[0] || "load";
  if (current !== step.view) { go(step.view); return; }
  const target = document.querySelector(step.target);
  if (!target) { timer = setTimeout(showStep, 180); return; }
  target.classList.add("tutorial-focus");
  target.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "center" });
  const bar = document.getElementById("tutorialBar");
  bar.hidden = false;
  document.getElementById("tutorialTitle").textContent = step.title;
  document.getElementById("tutorialText").textContent = step.text;
  document.getElementById("tutorialCount").textContent = `${index + 1}/${STEPS.length}`;
  bar.querySelector(".tutorial-progress i").style.width = `${(index + 1) / STEPS.length * 100}%`;
  const next = bar.querySelector("[data-tutorial='next']");
  next.textContent = step.done ? "완료" : step.run ? "지금 실행" : "다음";
  schedule();
}

function advance() {
  clearTimeout(timer);
  const step = STEPS[index];
  if (!step) return stopGuide(true);
  if (step.done) return stopGuide(true);
  if (step.run) {
    const target = document.querySelector(step.target);
    index += 1;
    step.run(target);
    if (!step.wait) showStep();
    return;
  }
  index += 1; showStep();
}

function togglePause(button) {
  paused = !paused;
  button.textContent = paused ? "▶" : "Ⅱ";
  button.setAttribute("aria-label", paused ? "자동 재생 계속" : "자동 재생 일시정지");
  if (paused) clearTimeout(timer); else schedule();
}

export function startGuide() {
  lastFocus = document.activeElement; active = true; index = 0; paused = false;
  if (!location.hash.includes("/load")) go("load"); else showStep();
}

export function stopGuide(completed = false) {
  clearTimeout(timer); active = false; clearHighlight();
  const bar = document.getElementById("tutorialBar"); if (bar) bar.hidden = true;
  // 완료뿐 아니라 사용자가 끝내기를 선택한 경우도 다음 방문에 강제로 다시 띄우지 않습니다.
  localStorage.setItem(DONE_KEY, completed ? "complete" : "dismissed");
  lastFocus?.focus?.();
}

export function syncGuide() { if (active) requestAnimationFrame(showStep); }

export function offerFirstRun() {
  ensureUi();
  if (localStorage.getItem(DONE_KEY) || sessionStorage.getItem(`${DONE_KEY}-offered`)) return;
  sessionStorage.setItem(`${DONE_KEY}-offered`, "1");
  setTimeout(startGuide, 550);
}
