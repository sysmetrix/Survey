// 샘플 데이터 생성 (시드 고정) → samples/
//  1) 사전·사후 시트 분리 + 사업정보·성과지표 (XLSX)
//  2) 구글폼 원본 형식 만족도 (CSV, 텍스트 라벨·복수응답·NPS)
//  3) 회고식 사전·사후 소표본 (XLSX)
import { mkdir, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { seededRandom } from "../js/core/util.js";
const require = createRequire(import.meta.url);
const XLSX = require("../vendor/xlsx-0.20.3.full.min.js");

await mkdir("samples", { recursive: true });
const rnd = seededRandom(2026);
const pick = a => a[Math.floor(rnd() * a.length)];
const norm = () => { const u = rnd() || 1e-9, v = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
const lik = (mu, sd = 0.8, min = 1, max = 5) => Math.max(min, Math.min(max, Math.round(mu + norm() * sd)));

const GOOD = ["진로 체험 활동이 재미있고 실제 직업을 알게 되어 도움이 되었어요", "강사 선생님이 친절하게 설명해 주셔서 이해가 잘 됐어요", "친구들과 팀 활동을 하면서 협력하는 방법을 배웠습니다", "내가 좋아하는 것이 무엇인지 생각해 보는 계기가 되었어요", "다양한 직업을 체험할 수 있어서 좋았습니다", "멘토님과 대화하면서 진로에 대한 자신감이 생겼어요", "간식도 맛있고 분위기가 편안했어요", "없음"];
const WISH = ["활동 시간이 짧아서 아쉬웠고 더 길게 했으면 좋겠어요", "강의실이 좁고 에어컨이 약해서 더웠어요", "체험할 수 있는 직업 종류가 더 다양했으면 좋겠습니다", "신청 안내 문자를 좀 더 일찍 보내 주세요", "주말에도 프로그램이 있었으면 좋겠어요", "간식이 조금 더 많았으면 좋겠어요", "없습니다", "시설 화장실 청결 관리가 필요합니다"];

// ───── 1) 사전·사후 시트 분리 ─────
{
  const OUT = [["진로 관심", ["나는 앞으로 하고 싶은 일이 있다", "나는 관심 있는 직업에 대해 알아본다", "나는 진로에 대해 자주 생각한다"]], ["자기 이해", ["나는 나의 강점을 알고 있다", "나는 내가 좋아하는 것을 설명할 수 있다", "나는 나 자신을 긍정적으로 생각한다"]], ["진로 준비", ["나는 진로 목표를 위해 계획을 세운다", "나는 진로 정보를 스스로 찾을 수 있다"]]];
  const outcomeHeaders = OUT.flatMap(([d, qs]) => qs.map(q => `${d} [${q}]`));
  const people = Array.from({ length: 96 }, (_, i) => ({ id: `YC${String(i + 1).padStart(3, "0")}`, sex: rnd() < 0.52 ? "여" : "남", school: pick(["중학생", "중학생", "고등학생"]), base: 2.6 + rnd() * 1.2 }));
  const preRows = people.slice(0, 92).map(p => [p.id, p.sex, p.school, ...OUT.flatMap(([, qs], di) => qs.map(() => lik(p.base - 0.1 * di)))]);
  const postPeople = people.filter((_, i) => i !== 3 && i !== 17 && i !== 40).concat([{ id: "YC201", sex: "여", school: "고등학생", base: 3.2 }]);
  const postRows = postPeople.map((p, idx) => {
    const gain = [0.8, 0.6, 0.25];
    const out = OUT.flatMap(([, qs], di) => qs.map(() => lik(p.base + gain[di] - 0.1 * di)));
    const pe = (p.base - 3.2) * 0.9 + norm() * 0.35; // 개인 성향(문항 간 상관)
    const sat = [lik(4.1 + pe + (p.school === "중학생" ? 0.2 : -0.2), 0.6), lik(4.4 + pe, 0.55), lik(3.3 + pe, 0.7), lik(3.6 + pe - (p.school === "고등학생" ? 0.4 : 0), 0.7)];
    const overall = lik((sat[0] + sat[1] + sat[2] + sat[3]) / 4 + 0.2, 0.45);
    const nps = Math.max(0, Math.min(10, Math.round(overall * 2.1 - 0.2 + norm() * 1.1)));
    const idOut = idx === 5 ? "yc 007" : p.id; // 표기 차이(공백·소문자) 매칭 확인
    return [idOut, p.sex, p.school, ...out, ...sat, overall, nps, rnd() < 0.8 ? pick(GOOD) : null, rnd() < 0.6 ? pick(WISH) : null];
  });
  const satHeaders = ["프로그램 내용이 유익했다", "강사(멘토)가 전문적이었다", "활동 시간이 적절했다", "시설 환경이 쾌적했다", "전반적 만족도", "친구에게 추천할 의향(0~10)", "좋았던 점", "바라는 점"];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["작성 안내"], ["사전·사후 시트의 ID는 동일하게 입력합니다."], ["척도: 1 전혀 그렇지 않다 ~ 5 매우 그렇다"]]), "안내");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["ID", "성별", "학교급", ...outcomeHeaders], ...preRows]), "사전");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["ID", "성별", "학교급", ...outcomeHeaders, ...satHeaders], ...postRows]), "사후");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
    ["구분", "항목", "내용", "비고"],
    ["사업개요", "사업명", "2026 청소년 진로탐색 프로그램 「꿈길 찾기」", ""],
    ["사업개요", "사업기간", "2026. 3. ~ 2026. 8. (총 12회기)", ""],
    ["사업개요", "참여대상", "부천시 중·고등학생 100명", ""],
    ["사업개요", "사업예산", "12,000천원", ""],
    ["사업개요", "추진부서", "청소년진로지원센터", ""],
    ["사업개요", "추진배경", "진로 미결정 청소년 증가에 따른 체험 중심 진로교육 수요 확대", ""],
    ["사업개요", "사업목적", "직업 체험과 멘토링을 통해 청소년의 진로 관심과 자기 이해를 높이고 주도적 진로 준비를 지원", ""],
    ["목표", "추진목표", "청소년의 진로 관심 및 자기 이해 향상", ""],
    ["목표", "추진목표", "참여자 만족도 제고 및 지속 참여 기반 마련", ""],
    ["논리모형", "투입", "예산 12,000천원\n진로 멘토 8명\n지역 협력기관 5개소", ""],
    ["논리모형", "활동", "직업 체험 캠프 4회\n진로 멘토링 6회\n진로 포트폴리오 작성 2회", ""],
    ["논리모형", "산출", "프로그램 12회 운영\n참여 청소년 연인원 1,000명", ""],
    ["논리모형", "단기성과", "진로 관심 향상\n자기 이해 증진\n프로그램 만족", ""],
    ["논리모형", "중기성과", "진로 목표 수립 및 진로 준비 행동 증가", ""],
    ["논리모형", "영향", "주도적으로 진로를 설계하는 청소년 성장", ""],
  ]), "사업정보");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
    ["지표ID", "지표명", "성과단계", "연계목표", "측정방법", "대상문항", "목표값", "실적값", "방향", "단위"],
    ["K1", "프로그램 운영 횟수", "산출", "참여자 만족도 제고", "직접입력", "", 12, 12, "상향", "회"],
    ["K2", "참여 청소년 수(실인원)", "산출", "참여자 만족도 제고", "직접입력", "", 100, 96, "상향", "명"],
    ["K3", "진로 관심 향상도", "단기성과", "진로 관심 및 자기 이해 향상", "사전사후 변화량", "진로 관심", 0.5, "", "상향", "점"],
    ["K4", "자기 이해 향상도", "단기성과", "진로 관심 및 자기 이해 향상", "사전사후 변화량", "자기 이해", 0.5, "", "상향", "점"],
    ["K5", "진로 준비 향상자 비율", "중기성과", "진로 관심 및 자기 이해 향상", "향상자 비율", "진로 준비", 60, "", "상향", "%"],
    ["K6", "전반적 만족도(100점 환산)", "단기성과", "참여자 만족도 제고", "100점 환산", "전반적 만족도", 80, "", "상향", "점"],
  ]), "성과지표");
  await writeFile("samples/2026_진로탐색_사전사후.xlsx", XLSX.write(wb, { type: "buffer", bookType: "xlsx" }));
}

// ───── 2) 구글폼 만족도 CSV ─────
{
  const L = ["전혀 그렇지 않다", "그렇지 않다", "보통이다", "그렇다", "매우 그렇다"];
  const items = ["프로그램 내용 [프로그램 내용이 흥미로웠다]", "프로그램 내용 [나에게 필요한 내용이었다]", "운영 [안내와 신청 절차가 편리했다]", "운영 [운영 시간이 적절했다]", "환경 [시설이 깨끗하고 안전했다]", "환경 [담당 선생님이 친절했다]"];
  const header = ["타임스탬프", "성별", "학년", "참여 프로그램", ...items, "전반적으로 프로그램에 만족하십니까?", "참여 동기(해당하는 것 모두 선택)", "이 프로그램을 친구에게 추천할 의향은? (0~10)", "좋았던 점을 자유롭게 적어주세요", "개선할 점이나 바라는 점을 적어주세요"];
  const rows = [header];
  const csv = v => (v === null || v === undefined ? "" : /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
  for (let i = 0; i < 142; i++) {
    const grade = pick(["중1", "중2", "중3", "고1", "고2", "고3"]), prog = pick(["댄스 동아리", "코딩 교실", "보드게임 카페", "영상 제작"]);
    const base = 3.5 + rnd() * 0.9 + (prog === "코딩 교실" ? 0.25 : 0) - (grade.startsWith("고") ? 0.25 : 0);
    const vals = items.map((_, k) => lik(base + [0.2, 0.1, -0.2, -0.4, -0.1, 0.4][k], 0.8));
    const overall = lik(vals.reduce((a, b) => a + b, 0) / vals.length + 0.1, 0.5);
    const d = new Date(2026, 4, 1 + (i % 25), 9 + (i % 9), i % 60);
    const motive = [...new Set(Array.from({ length: 1 + Math.floor(rnd() * 3) }, () => pick(["친구 권유", "흥미·관심", "진로 탐색", "부모님 권유", "학교 안내"])))].join(", ");
    rows.push([`${d.getFullYear()}. ${d.getMonth() + 1}. ${d.getDate()} 오후 ${d.getHours() % 12}:${String(d.getMinutes()).padStart(2, "0")}:00`, rnd() < 0.55 ? "여" : "남", grade, prog,
      ...vals.map((v, k) => (i === 7 && k === 3 ? "" : L[v - 1])), L[overall - 1], motive, Math.max(0, Math.min(10, Math.round(overall * 2 + norm()))),
      rnd() < 0.7 ? pick(GOOD) : "", rnd() < 0.55 ? pick(WISH) : ""]);
  }
  await writeFile("samples/2026_청소년센터_만족도_구글폼.csv", "﻿" + rows.map(r => r.map(csv).join(",")).join("\r\n"), "utf8");
}

// ───── 3) 회고식 소표본 ─────
{
  const Q = ["친구와 협력하는 능력", "내 생각을 표현하는 능력", "새로운 일에 도전하는 태도", "지역사회에 대한 관심"];
  const header = ["번호", "성별", ...Q.flatMap(q => [`이전_${q}`, `현재_${q}`]), "전반적 만족도", "소감"];
  const rows = Array.from({ length: 24 }, (_, i) => {
    const b = 2.5 + rnd();
    return [i + 1, rnd() < 0.5 ? "남" : "여", ...Q.flatMap((_, k) => { const pre = lik(b); return [pre, Math.max(1, Math.min(5, pre + (rnd() < 0.7 ? 1 : 0) + (k === 3 && rnd() < 0.5 ? -1 : 0)))]; }), lik(4.2, 0.6), rnd() < 0.8 ? pick(GOOD) : null];
  });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["2026 청소년 참여위원회 활동 평가 (회고식)"], [], header, ...rows]), "응답");
  await writeFile("samples/2026_참여위원회_회고식.xlsx", XLSX.write(wb, { type: "buffer", bookType: "xlsx" }));
}
// ───── 4) 네이버폼 원본 형식 (제목 행, 응답일시, 긴 문항, 문자 척도, 복수응답, 이모지 의견) ─────
{
  const L = ["매우 불만족", "불만족", "보통", "만족", "매우 만족"];
  const Q = [
    "1. 프로그램에서 제공한 체험 활동이 나의 진로를 탐색하고 결정하는 데 실질적인 도움이 되었다고 생각하십니까?",
    "2. 활동 장소(청소년수련관)의 시설과 안전 관리 상태에 대해 얼마나 만족하십니까?",
    "3. 담당 청소년지도사 선생님의 안내와 진행 방식에 대해 얼마나 만족하십니까?",
    "4. 프로그램 일정(요일·시간)과 전체 운영 기간이 참여하기에 적절했습니까?",
  ];
  const header = ["응답일시", "성별(필수)", "연령대", ...Q, "5. 프로그램에 전반적으로 만족하셨나요?", "6. 알게 된 경로를 모두 선택해 주세요", "7. 좋았던 점이나 바라는 점을 자유롭게 적어 주세요"];
  const OPIN = ["너무 재밌었어요😊👍", "선생님이 친절하셨어요 ❤️", "시간이 좀 짧았어요 😢", "✅ 다음에도 꼭 참여할게요!", "주차 공간이 부족해요 ⚠️", "좋았습니다", "", "", "간식이 맛있었어요🍪", "진로 고민이 많이 풀렸어요 🙏"];
  const csv = v => (v === null || v === undefined ? "" : /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
  const rows = [["2026 청소년 진로체험 만족도 조사 응답 결과"], [], header];
  for (let i = 0; i < 90; i++) {
    const base = 3.4 + rnd() * 1.1;
    const vals = Q.map((_, k) => lik(base + [0.3, -0.3, 0.4, -0.5][k], 0.8));
    const overall = lik(vals.reduce((a, b) => a + b, 0) / vals.length + 0.1, 0.5);
    const route = [...new Set(Array.from({ length: 1 + Math.floor(rnd() * 2) }, () => pick(["학교 안내문", "SNS", "친구 소개", "홈페이지"])))].join(", ");
    rows.push([`2026.06.${String(1 + (i % 28)).padStart(2, "0")} ${String(10 + (i % 8)).padStart(2, "0")}:${String(i % 60).padStart(2, "0")}`, rnd() < 0.5 ? "여성" : "남성", pick(["14~16세", "17~19세"]), ...vals.map(v => L[v - 1]), L[overall - 1], route, pick(OPIN)]);
  }
  await writeFile("samples/2026_진로체험_네이버폼.csv", "﻿" + rows.map(r => r.map(csv).join(",")).join("\r\n"), "utf8");
}

// ───── 5) 단일 시트 사전·사후 (사전_/사후_ 접두어, 동일 응답자) ─────
{
  const Q = ["자기효능감", "문제해결력", "의사소통 능력", "공동체 의식"];
  const header = ["ID", "학교급", ...Q.map(q => `사전_${q}`), ...Q.map(q => `사후_${q}`), "전반적 만족도"];
  const rows = Array.from({ length: 64 }, (_, i) => {
    const b = 2.7 + rnd() * 1.1, pre = Q.map(() => lik(b)), post = pre.map((v, k) => Math.max(1, Math.min(5, v + (rnd() < [0.6, 0.5, 0.45, 0.2][k] ? 1 : 0))));
    return [`S${String(i + 1).padStart(3, "0")}`, pick(["중학생", "고등학생"]), ...pre, ...post, lik(4.1, 0.6)];
  });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([header, ...rows]), "응답");
  await writeFile("samples/2026_리더십캠프_사전사후_한시트.xlsx", XLSX.write(wb, { type: "buffer", bookType: "xlsx" }));
}

// ───── 6) 7점 척도 + 역문항 + NPS ─────
{
  const Q = ["활동 내용이 흥미로웠다", "새로운 것을 배울 수 있었다", "활동이 지루하다고 느꼈다(역문항)", "지도자가 나의 의견을 존중해 주었다", "다른 친구들과 협력할 기회가 충분했다"];
  const header = ["번호", "성별", "학년", ...Q, "이 활동을 친구에게 추천할 의향(0~10점)", "하고 싶은 말"];
  const rows = Array.from({ length: 80 }, (_, i) => {
    const b = 4.6 + rnd() * 1.6;
    const vals = Q.map((q, k) => (q.includes("역문항") ? Math.max(1, Math.min(7, Math.round(8 - b + norm() * 0.9))) : lik(b + [0.3, 0.2, 0, 0.1, -0.2][k], 1, 1, 7)));
    return [i + 1, rnd() < 0.5 ? "남" : "여", pick(["중1", "중2", "중3"]), ...vals, Math.max(0, Math.min(10, Math.round(b * 1.45 + 0.2 + norm()))), rnd() < 0.5 ? pick(GOOD) : null];
  });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([header, ...rows]), "응답");
  await writeFile("samples/2026_생태탐험_7점척도_NPS.xlsx", XLSX.write(wb, { type: "buffer", bookType: "xlsx" }));
}
console.log("samples/ 6종 생성 완료");
