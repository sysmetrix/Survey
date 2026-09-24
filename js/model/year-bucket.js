// 연도 값 → 특성 비교용 구간 라벨 (출생연도→연령대, 활동시작연도→년차)
// ※ 아래 구간 기준(법정 구간 제외)은 통계적·법적 표준이 아니라 이 앱이 정한 편집 기본값입니다.

export const REF_YEAR = new Date().getFullYear();

export const DEFAULT_YEAR_SCHEME = { birth: "age10", tenure: "tenure3" };

function ageBand10(age) {
  if (age < 10) return "10세 미만";
  if (age < 20) return "10대";
  if (age < 30) return "20대";
  if (age < 40) return "30대";
  return "40대 이상";
}
// 청소년기본법 제3조(9~24세)·청년기본법 제3조(19~34세)는 19~24세가 겹침.
// 이 앱은 겹치지 않도록 24세 이하=청소년, 25~34세=청년, 35세 이상=기타로 재구성.
function ageBandLaw(age) {
  if (age <= 24) return "청소년(24세 이하)";
  if (age <= 34) return "청년(25~34세)";
  return "기타(35세 이상)";
}
// 발달 단계 비교용 기본 구간. 법정 정의가 아니며, 기준연도-출생연도의 근사 만 나이를 사용한다.
function ageBandStage(age) {
  if (age < 9) return "기타(9세 미만)";
  if (age <= 14) return "초기 청소년(9~14세)";
  if (age <= 18) return "중기 청소년(15~18세)";
  if (age <= 24) return "후기 청소년·초기 청년(19~24세)";
  if (age <= 29) return "중기 청년(25~29세)";
  if (age <= 34) return "후기 청년(30~34세)";
  return "기타(35세 이상)";
}
// 학교 연계형 사업의 비교용 구간. 실제 재학 여부가 아니라 기준연도-출생연도의 근사 만 나이를 사용한다.
function ageBandSchool(age) {
  if (age < 7) return "기타(7세 미만)";
  if (age <= 12) return "초등(7~12세)";
  if (age <= 15) return "중등(13~15세)";
  if (age <= 18) return "고등(16~18세)";
  if (age <= 34) return "청년(대학생 포함, 19~34세)";
  return "기타(35세 이상)";
}
function tenureBand3(yrs) { return yrs <= 1 ? "1년차" : yrs <= 3 ? "2~3년차" : "4년차 이상"; }
function tenureBand2(yrs) { return yrs <= 1 ? "신규(1년 이하)" : "기존(2년 이상)"; }

export const YEAR_SCHEMES = {
  birth: [
    { id: "age10", name: "10년 단위 연령대(10대/20대/30대…)", law: false, bucket: ageBand10 },
    { id: "ageLaw", name: "법정 기준(청소년 24세 이하·청년 25~34세·기타)", law: true, bucket: ageBandLaw },
    { id: "ageStage", name: "발달 단계(청소년·청년)", law: false, bucket: ageBandStage, description: "근사 만 나이 기준: 초기 청소년 9~14세, 중기 청소년 15~18세, 후기 청소년·초기 청년 19~24세, 중기 청년 25~29세, 후기 청년 30~34세" },
    { id: "ageSchool", name: "학교 연계형(초등·중등·고등·청년)", law: false, bucket: ageBandSchool, description: "근사 만 나이 기준: 초등 7~12세, 중등 13~15세, 고등 16~18세, 청년(대학생 포함) 19~34세. 실제 재학 여부·학년·유급·조기입학은 출생연도만으로 알 수 없습니다" },
    { id: "raw", name: "구간 나누지 않음(연도 값 그대로)", law: false, bucket: null },
  ],
  tenure: [
    { id: "tenure3", name: "1년차 / 2~3년차 / 4년차 이상(기본)", law: false, bucket: tenureBand3 },
    { id: "tenure2", name: "신규(1년 이하) / 기존(2년 이상)", law: false, bucket: tenureBand2 },
    { id: "raw", name: "구간 나누지 않음(연도 값 그대로)", law: false, bucket: null },
  ],
};

export function schemeOf(kind, schemeId) {
  return (YEAR_SCHEMES[kind] || []).find(s => s.id === schemeId) || null;
}

/**
 * 원자료 연도값 → 구간 라벨 문자열 (null = 처리 불가/미래연도 등 이상값)
 * birth: n = refYear - year (근사 만 나이) / tenure: n = refYear - year + 1 (시작연도=1년차)
 */
export function yearToBucket(rawYear, kind, schemeId, refYear = REF_YEAR) {
  const y = Number(rawYear);
  if (!Number.isFinite(y)) return null;
  const scheme = schemeOf(kind, schemeId ?? DEFAULT_YEAR_SCHEME[kind]);
  if (!scheme || !scheme.bucket) return String(Math.round(y)); // "raw" 또는 알 수 없는 scheme
  const n = kind === "birth" ? refYear - y : refYear - y + 1;
  if (n < 0) return null;
  return scheme.bucket(n);
}
