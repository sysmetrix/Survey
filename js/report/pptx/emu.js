// PPTX 좌표 단위 변환 — 슬라이드는 항상 13.333in × 7.5in(16:9 와이드스크린, css/present.css 의
// @page deck 인쇄 크기와 동일) EMU(English Metric Units, 1인치 = 914400 EMU) 기준.
// state.deckOverrides 의 요소 좌표(x/y/w/h, 0~100 백분율)를 그대로 곱셈 한 번으로 EMU로 바꿀 수 있는 것이
// 핵심 — 화면(퍼센트)과 PPTX(EMU)가 같은 숫자를 소비하므로 "화면 그대로" 내보내기가 구조적으로 보장됨.
export const EMU_PER_INCH = 914400;
export const SLIDE_W_EMU = 12192000; // 13.333in
export const SLIDE_H_EMU = 6858000; // 7.5in
export const SLIDE_W_PT = 960; // 13.333in × 72pt/in
export const SLIDE_H_PT = 540; // 7.5in × 72pt/in

/** 0~100 퍼센트 → EMU(가로: axis="w", 세로: axis="h") */
export const pctToEmuX = pct => Math.round((pct / 100) * SLIDE_W_EMU);
export const pctToEmuY = pct => Math.round((pct / 100) * SLIDE_H_EMU);

/** 슬라이드 편집기의 cqw 상당 글자 크기(슬라이드 폭의 1%) → PPTX 포인트(100분의 1 단위, <a:rPr sz="">) */
export const cqwToHundredthPt = cqw => Math.max(100, Math.round((cqw / 100) * SLIDE_W_PT * 100));

/** 회전 각도(도, 시계방향 양수) → PPTX 60,000분의 1도 단위(<a:xfrm rot="">). 음수 각도도 그대로 지원 */
export const degToRot60000 = deg => Math.round(((Number(deg) || 0) % 360) * 60000);

/** 슬라이드 편집기 입력창용 — 저장 단위(cqw, 슬라이드 폭의 1%)와 사용자가 아는 pt(960pt 폭 기준) 사이 변환. 저장값은 계속 cqw */
export const cqwToPt = cqw => Math.round((Number(cqw) || 0) * (SLIDE_W_PT / 100) * 10) / 10;
export const ptToCqw = pt => Math.round(((Number(pt) || 0) / (SLIDE_W_PT / 100)) * 1000) / 1000;
