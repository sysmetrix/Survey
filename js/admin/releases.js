// Single source of truth for user-visible release history.
// Add every release at the top and keep changes concrete and verifiable.
export const RELEASES = [
  {
    version: "5.3.2", date: "2026-09-14", title: "로컬 설정과 업데이트 관리",
    groups: {
      "설정": ["상단에서 누구나 여는 로컬 설정 화면", "테마·자동 저장·버전 보관 수·보관 기간 설정", "앱 캐시와 서비스워커를 정리하는 Ctrl+F5 새로고침"],
      "업데이트": ["구조화된 전체 변경 로그를 단일 원본으로 관리", "버전 표시 7회 클릭으로 현재 탭에서만 변경 로그 열기", "직접 주소 접근 차단"],
    },
  },
  {
    version: "5.3.1", date: "2026-09-14", title: "문서 서식과 글꼴 확인 개선",
    groups: {
      "문서": ["본문 글자 크기 범위를 15pt까지 확대", "HWPX·PDF 위아래 여백을 10mm로 통일", "미리보기·표·제목·주석·인쇄 크기를 선택값에 맞춰 일치"],
      "글꼴": ["한글명·영문명·가변 글꼴명·패밀리명 별칭 확인", "미설치와 브라우저 권한상 확인 불가 상태 구분", "글꼴 확인 진행 상태와 기본 서식 복원 추가"],
    },
  },
  {
    version: "5.3.0", date: "2026-09-13", title: "작업 내역과 한글 보고서 강화",
    groups: {
      "작업 내역": ["자동 저장·되돌리기·다시 실행", "버전 비교·복원·고정·보관 규칙", "원자료 선택 암호화와 전체 백업"],
      "HWPX": ["긴 표 여러 쪽 나눔과 제목 행 반복", "글꼴·크기·줄 간격 설정", "웹 이모지의 한글 호환 기호 변환"],
      "사용성": ["긴 문항명 잘림 해결", "성과지표 빠른 추가와 선택형 사업정보 입력"],
    },
  },
  {
    version: "5.2.0", date: "2026-09-12", title: "발표 모드와 PWA",
    groups: {
      "발표": ["분석 결과 발표용 슬라이드와 발표자 노트", "개요·숨김·PDF 인쇄 기능"],
      "앱": ["설치형 PWA와 오프라인 캐시", "화면 디자인과 반응형 사용성 개선"],
    },
  },
  {
    version: "5.1.0", date: "2026-09-11", title: "문자 척도 인식 강화",
    groups: {
      "데이터": ["4점·5점 문자 척도 자동 판별", "보기별 점수 지정 화면", "영문·Typeform·Tally 응답 형식 지원"],
    },
  },
  {
    version: "5.0.0", date: "2026-09-10", title: "성과평가·HWPX 도구 재구축",
    groups: {
      "분석": ["청소년 사업 설문 분석과 성과지표 판정", "통계 분석·그래프·서술 자동 생성"],
      "보고서": ["한글 HWPX 보고서 생성", "사업 논리모형과 종합 평가 연계"],
    },
  },
];

export const CURRENT_VERSION = RELEASES[0].version;
export const latestRelease = () => RELEASES[0];
export const releaseSummary = release => `v${release.version} ${release.title} — ${Object.values(release.groups).flat().join(", ")}`;
