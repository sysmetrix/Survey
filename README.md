# 청소년 사업 설문 분석 · 결과평가 보고서 도구 (v5)

부천여성청소년재단 직원이 설문 엑셀을 올리면 **통계 분석 → 성과지표 달성 판정 → 개조식 분석글·그래프가 들어간 한글(HWPX) 붙임 보고서**까지 만드는 웹 도구입니다.
모든 처리는 브라우저 안에서만 이루어지며 설문 파일은 외부로 전송되지 않습니다.

- 접속: https://sysmetrix.github.io/Survey/
- 이전 버전(v4.3): https://sysmetrix.github.io/Survey/legacy/v4.html

## 직원용 사용 방법

1. **불러오기** — 엑셀(.xlsx/.xls) 또는 CSV를 끌어다 놓습니다. 처음이라면 *만족도 조사 템플릿* / *사전·사후 조사 템플릿*을 내려받아 입력하세요.
   - 구글폼·네이버폼·타입폼·탈리폼에서 내려받은 원본 파일도 그대로 됩니다. '전혀 아니다~매우 그렇다', '매우 불만족~매우 만족', 'Strongly disagree~Strongly agree' 같은 보기 문구를 **숫자로 바꾸지 않아도** 자동으로 점수화하며, 타임스탬프·응답 ID 같은 메타 열은 분석에서 뺍니다.
   - '보통'이 없는 4단계 보기는 4점 척도로 판정합니다. 응답이 적어 4점/5점이 불분명하면 경고합니다.
   - 사전에 없는 문구(예: '완전 좋아요')는 데이터 설정의 **보기 점수**에서 문구별 점수를 한 번 지정하고 *같은 보기를 쓰는 문항에 모두 적용*하면 됩니다.
   - 한 파일에 `사전`·`사후` 시트가 있으면 ID로 같은 응답자를 연결합니다. 한 시트에서 `사전_문항`·`사후_문항`(회고식은 `이전_`·`현재_`) 형식도 인식합니다.
   - `사업정보`·`성과지표` 시트를 채워 두면 논리모형과 성과지표가 자동으로 들어갑니다.
2. **데이터 설정** — 자동 판별된 문항 역할(척도·응답자 특성·주관식 등), 척도 범위, 역문항, 영역(하위척도), 사전·사후 짝, 불성실 응답 제외 여부를 확인합니다.
3. **사업정보·성과지표** — 사업 목적·추진목표·논리모형(투입→활동→산출→성과→영향)과 성과지표(측정 방법·대상 문항·목표값)를 입력하면 실적·달성률·판정이 즉시 계산됩니다.
4. **분석 결과** — 성과지표 달성, 사전·사후 변화(대응표본 t / Wilcoxon, 효과크기, 향상자 비율), 만족도(100점 환산·긍정응답률·NPS·IPA), 응답자 특성별 차이, 주관식 주제·대표 의견, 자료 품질을 확인합니다.
5. **보고서** — 자동 작성된 문장을 클릭해 고치고(✕ 빼기, ↺ 되돌리기), 필요한 장만 선택한 뒤 **한글(HWPX) 내려받기**. 인쇄/PDF, 워드·구글문서 붙여넣기용 복사도 됩니다.
   *프로젝트 파일 저장*을 하면 문항 설정·사업정보·지표·문장 수정이 저장되어 다음 차수 조사에 그대로 적용됩니다(원자료는 선택 시에만 포함).
6. **발표** — 상단 *발표* 버튼(또는 분석 결과·보고서 화면의 *발표 모드*)으로 핵심 결과를 16:9 슬라이드로 바로 보여 줍니다.
   - 슬라이드마다 결론을 말하는 제목 하나와 그에 맞는 그래프 하나: 표지 → 한눈에 보기 → 성과지표 달성 → 사전·사후 변화 → 만족도 순위 → 응답 분포 → 추천의향 → 개선 우선순위(IPA) → 집단 비교 → 참여자 목소리 → 종합 평가 → 마무리
   - 단축키: `→`/`Space` 다음, `←` 이전, 숫자+`Enter` 이동, `O` 개요(슬라이드 숨기기), `N` 발표자 노트(근거 수치·경과 시간), `F` 전체화면, `B` 화면 가리기, `T` 밝은/어두운 무대, `P` PDF 인쇄(슬라이드당 한 쪽), `Esc` 끝내기
   - 그래프에 마우스를 올리면 정확한 값이 보입니다.

### 화면 테마 · 앱 설치(PWA)
- 오른쪽 위 테마 버튼으로 *시스템 설정 → 밝은 화면 → 어두운 화면*을 바꿉니다. 보고서 미리보기와 HWPX는 인쇄 문서이므로 항상 흰 종이 기준입니다.
- 크롬·엣지 주소창의 설치 아이콘(또는 상단 *앱 설치*)으로 설치하면 바탕화면·시작 메뉴에서 창으로 열리고, 한 번 접속한 뒤에는 **인터넷 없이도** 동작합니다. 설치한 앱은 탐색기에서 .xlsx/.csv 파일의 *연결 프로그램*으로도 열 수 있습니다.
- 새 버전이 배포되면 오른쪽 아래에 *지금 업데이트* 알림이 뜹니다. 불러온 데이터는 새로고침하면 사라지므로 필요하면 프로젝트 파일을 먼저 저장하세요.

### 보고서 구성(해당 자료가 있는 장만 자동 포함)
요약 → Ⅰ 사업 개요·논리모형 → Ⅱ 조사 개요·응답자 특성 → Ⅲ 성과지표 달성 현황 → Ⅳ 사전·사후 성과 변화 → Ⅴ 만족도 분석 → Ⅵ 응답자 특성별 비교 → Ⅶ 주관식 응답 분석 → Ⅷ 종합 평가·개선 방안·차년도 목표(안)·유의사항 → 부록(응답 분포, 전체 검정 결과, 산식)

### 판정 기준(기본값)
- 달성률 = 실적 ÷ 목표 × 100(하향 지표는 {1 − (실적−목표) ÷ |목표|} × 100) · 100% 이상 달성, 90% 이상 대체로 달성, 그 미만 미달성
- 종합 등급 = (달성 + 대체로 달성×0.5) ÷ 측정 지표 수 · 80% 이상 우수, 60% 이상 보통
- 100점 환산 = (평균 − 최소점) ÷ (최대점 − 최소점) × 100 · 85 이상 매우 높음, 75 이상 높음, 60 이상 보통 이상

## 개발자용

빌드 없이 ES 모듈로 동작합니다(GitHub Pages 정적 배포). 파일을 더블클릭(file://)하면 동작하지 않으므로 로컬에서는 웹서버로 엽니다.

```bash
python -m http.server 8000          # http://127.0.0.1:8000/
npm install                          # 테스트용 @xmldom/xmldom
npm test                             # 통계(R 기준값)·모델·분석·평가·보고서·화면·규칙 테스트
node tools/make-samples.mjs          # samples/ 재생성(시드 고정)
node tools/build-sample-reports.mjs  # 샘플 → out/reports/*.hwpx (+구조 검증)
powershell -File tools/hwp-verify.ps1 -Dir out/reports   # 설치된 한글로 열기·PDF 저장 검증
node tools/browser-e2e.mjs           # Edge 헤드리스: 화면 캡처·브라우저 HWPX·어두운 화면·발표 모드·PDF·모바일·오프라인(웹서버 필요)
node tools/build-sw.mjs              # ★ 파일을 고친 뒤 배포 전 필수: 서비스워커 사전 캐시 목록·리비전 갱신 (npm test 가 최신 여부 검사)
node tools/make-icons.mjs            # icons/*.svg → PWA 아이콘 PNG
```

- 로컬 개발 서버(localhost·127.0.0.1)에서는 수정 사항이 캐시에 가려지지 않도록 서비스워커를 등록하지 않습니다. PWA를 시험할 때만 `http://127.0.0.1:8000/?sw=1` 로 엽니다.
- 버전을 올릴 때는 `js/main.js`의 `APP_VERSION`, `package.json`, `index.html`의 `?v=`를 함께 바꾸고 `node tools/build-sw.mjs`를 실행합니다(테스트가 일치 여부를 검사).
- 차트 색은 `js/charts/theme.js`의 검증된 팔레트(색각 이상 구분·대비 확인)만 사용합니다. 발표 슬라이드 구성 규칙은 `js/present/deck.js`에 있습니다.

### 한글 자동 검증 시 보안 승인 창 없애기 (한컴 공식 보안 모듈)

한글 COM 자동화로 파일을 열면 "한글을 이용하여 위 파일에 접근하려는 시도…" 창이 뜰 수 있습니다. 한컴 공식 **오토메이션 보안 승인 모듈**을 PC마다 한 번 설치하면 뜨지 않습니다(관리자 권한 불필요).

```powershell
powershell -ExecutionPolicy Bypass -File tools/install-hwp-security-module.ps1 -Test   # 설치·등록·동작 확인 (npm run hwp:secmodule)
powershell -ExecutionPolicy Bypass -File tools/install-hwp-security-module.ps1 -ZipPath "보안모듈(Automation).zip"   # 인터넷 차단 PC
powershell -ExecutionPolicy Bypass -File tools/install-hwp-security-module.ps1 -Uninstall   # 제거
```

- 설치 스크립트는 [한컴디벨로퍼](https://developer.hancom.com/hwpautomation) 공식 배포본 `보안모듈(Automation).zip`을 받아 SHA-256과 비트(한글 2024는 32비트)를 확인합니다. 이어서 `%LOCALAPPDATA%\HNC\HwpAutomation\SecurityModule`에 DLL을 복사하고, `HKCU\Software\HNC\HwpAutomation\Modules`에 `FilePathCheckerModuleExample` = DLL 경로를 등록합니다.
- 자동화 코드는 `tools/lib/hwp-com.ps1`의 `New-HwpAutomation`이 파일을 열기 전에 `RegisterModule("FilePathCheckDLL", "FilePathCheckerModuleExample")`를 호출합니다. 두 번째 인자는 레지스트리 값 이름과 같아야 합니다.
- 한컴 예제 모듈은 모든 경로 접근을 허용하며, `RegisterModule`을 호출한 자동화 세션에만 적용됩니다.

| 폴더 | 내용 |
|---|---|
| `js/io` | CSV/XLSX 파싱(인코딩·헤더행 탐지·다중 시트), 엑셀 템플릿, 프로젝트 파일 |
| `js/model` | 열 역할 자동 판별, 한국어 척도 라벨 사전, 재코딩(결측=null·역문항·복수응답), 코드북, 사전·사후 매칭 |
| `js/stats` | 분포함수(t·F·χ²·정규·스튜던트화 범위), t검정, Welch ANOVA, Games-Howell/Tukey, Mann-Whitney, Wilcoxon, Kruskal-Wallis, Shapiro-Wilk, χ²/Fisher, 상관, 회귀, Cronbach α, Holm |
| `js/analysis` | 문항·영역·NPS·복수응답, 교차분석, 사전·사후, IPA, 주관식 |
| `js/evaluation` | 논리모형, 성과지표 실적·달성률·판정, 연계 점검, 사업정보 시트 파서 |
| `js/narrative` | 조사 자동 선택, 수준 어휘·수치 표기 |
| `js/charts` | 순수 SVG 차트(발산형 막대, 덤벨, 불릿, IPA, NPS 등, 밝은/어두운 테마·툴팁 속성), canvas PNG 변환 |
| `js/report` | 보고서 블록 생성, HTML 렌더러, **HWPX 작성기**(`hwpx/`) |
| `js/present` | 분석 결과 → 발표 슬라이드 구성(슬라이드당 메시지 하나) |
| `js/ui` | 화면(불러오기·설정·사업정보·결과·보고서·발표), 상태 저장소, 테마, 툴팁, PWA |
| `sw.js`, `manifest.webmanifest`, `icons/` | 설치·오프라인(서비스워커 사전 캐시는 `tools/build-sw.mjs`로 생성) |
| `vendor/fonts/pretendard-gov` | Pretendard GOV 가변 글꼴 분할본(SIL OFL 1.1) — 필요한 글자 조각만 받음 |
| `templates/hwpx/blank.hwpx` | 한글 2024에서 저장한 기준 빈 문서 → `tools/hwpx-extract-template.mjs`로 `template-parts.js` 생성 |
| `vendor/` | PapaParse 5.4.1, SheetJS 0.20.3, JSZip 3.10.1 (내부망 대비 로컬 사본) |

규칙: `core·stats·model·analysis·evaluation·narrative·report·io·present·charts`는 DOM에 의존하지 않으며(Node 테스트 가능), 화면은 인라인 이벤트 핸들러 없이 `data-act`/`data-change` 위임만 사용합니다(CSP `script-src 'self'`).
