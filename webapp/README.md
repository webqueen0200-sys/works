# 업무관리 시트 (웹앱)

Google Sheets 기반 "업무현황_N월 / 요약_N월" 시트를 대체하는 웹 업무관리 도구입니다.
- **프론트엔드(관리 화면)**: 정적 HTML/CSS/JS → **GitHub Pages**
- **데이터 저장(백엔드 API)**: Vercel 서버리스 함수 + **Vercel KV**(Redis)

## 폴더 구성

```
webapp/
├─ index.html        관리 화면
├─ styles.css
├─ app.js            화면 로직 (테이블 렌더링, 드롭다운, 요약 계산)
├─ config.js         드롭다운 옵션 · 담당자 코드 · 컬럼 정의 (여기서 API_BASE 설정)
├─ api/
│  ├─ months.js       월 시트 목록 조회/저장
│  ├─ settings.js     월별 기준 MM / 업무일수 설정
│  ├─ tasks.js        업무 목록 조회 · 신규 등록
│  ├─ tasks/[id].js   업무 수정 · 삭제
│  ├─ _kv.js          Vercel KV 접근 래퍼
│  └─ _cors.js        CORS 허용 헤더
├─ package.json       (@vercel/kv 의존성)
└─ vercel.json
```

## 1. 저장소 하나로 GitHub + Vercel 함께 사용하기 (권장)

이 폴더 전체를 하나의 GitHub 저장소로 올리세요.

```bash
git init
git add .
git commit -m "업무관리 시트 초기 버전"
git remote add origin <본인의 깃허브 저장소 주소>
git push -u origin main
```

### GitHub Pages 켜기
1. 저장소 → **Settings → Pages**
2. Source: `Deploy from a branch` → `main` / `/ (root)` 선택 → 저장
3. 몇 분 뒤 `https://<계정>.github.io/<저장소명>/` 에서 화면 확인 (이 시점엔 로컬 데모 모드로 동작 — 아래 2번을 해야 여러 기기/사용자가 같은 데이터를 봅니다)

### Vercel에 같은 저장소 연결 (API 전용으로 사용)
1. https://vercel.com → **Add New → Project** → 방금 만든 GitHub 저장소 선택
2. Framework Preset: `Other` 로 두면 됩니다 (별도 빌드 명령 불필요)
3. 배포가 끝나면 `https://<프로젝트명>.vercel.app` 주소가 생깁니다 (이 안의 `/api/*` 함수만 사용할 예정입니다)

### Vercel KV(데이터 저장소) 연결
1. Vercel 프로젝트 → **Storage** 탭 → **Create Database** → `KV` (Upstash for Redis) 선택
2. 생성 후 프로젝트에 **Connect**를 누르면 `KV_REST_API_URL`, `KV_REST_API_TOKEN` 등 환경변수가 자동으로 추가됩니다
3. 환경변수가 추가되면 **Redeploy**를 한 번 눌러 반영하세요

### 프론트엔드가 Vercel API를 바라보도록 연결
`config.js` 맨 위의 값을 채우고 다시 GitHub에 push 하세요.

```js
const API_BASE = "https://<프로젝트명>.vercel.app";
```

이 값이 비어있으면(`""`) 브라우저의 localStorage에만 저장되는 **로컬 데모 모드**로 동작합니다. (같은 브라우저에서는 데이터가 유지되지만, 팀원과 공유되지 않습니다.)

## 2. 화면 사용법

- 상단 **월 탭**(`업무현황_9월` 등)으로 월별 시트를 전환합니다. `+ 새 월 시트`로 다음 달 시트를 추가하세요.
- **업무현황** 탭: 실제 스프레드시트처럼 각 셀을 바로 편집합니다. `대분류`를 바꾸면 `중분류` 옵션이 자동으로 바뀝니다.
- **요약** 탭: 업무현황 탭의 데이터를 기준으로 아래 표가 자동 계산됩니다.
  - 대분류별 업무 건수 (진행현황별)
  - 직무별 투입 MM (기준 MM 대비 투입률)
  - 대분류·중분류별 투입 MM 상세
  - SLA 평가 평균/등급
- **기준 설정** 버튼: 직무별 기준 MM, 업무일수를 월별로 조정합니다.
- **CSV 내보내기**: 현재 월 데이터를 CSV로 다운로드합니다 (Excel에서 열람 가능).

## 3. 담당자 익명화 규칙

`기획 / 디자인 / 퍼블` 담당자 컬럼은 실명 대신 아래 코드만 선택할 수 있도록 드롭다운을 제한했습니다 (`config.js`의 `ASSIGNEE_OPTIONS`).

| 코드 | 실명 (참고용, 화면에는 노출되지 않음) |
|---|---|
| 기획2 | 송승현 |
| 기획3 | 전상현 |
| 기획4 | 전지혜 |
| 디자인1 | 우승연 |
| 디자인2 | 김지윤 |
| 디자인3 | 박중현 |
| 퍼블1 | 김형윤 |
| 퍼블2 | 최봄 |
| 퍼블3 | 이대희 |

담당자를 추가/변경하려면 `config.js`의 `ASSIGNEE_OPTIONS` 배열만 수정하면 됩니다.

## 4. 분류 체계 (드롭다운 값)

`config.js`의 `MAJOR_CATEGORIES`, `MINOR_CATEGORY_MAP`, `OPTIONS` 는 첨부하신 원본 파일의 **"분류" / "분류 정의"** 시트를 그대로 옮긴 것입니다.

- 대분류: 기업 / 소상공인 / GA / 공통 / SI
- 중분류: 대분류에 따라 자동으로 옵션이 바뀝니다 (예: 기업 → 상품서비스, 요금제/패키지, 메인 …)
- 구분: 신규 / 수정 / 기타
- 중요도: 긴급 / 상 / 중 / 하 / -
- 진행현황: 예정 / 접수 / 검토 / 대기 / 진행 / 검수 / 완료 / 개발 / 보류 / 취소
- SLA 평가: 매우만족 / 만족 / 보통 / 미흡 / 매우미흡

## 5. 계산 규칙

- `총합(H)` = 기획(H)+디자인(H)+퍼블(H)+GA(H)+PM(H)
- `MM` = 총합(H) ÷ 160 (단, **대분류가 SI인 업무는 MM 계산에서 제외** — 원본 시트의 규칙을 그대로 반영)
- 요약 탭의 "업무 건 수"는 취소 건도 포함한 전체 건수입니다 (원본 `요약_N월` 시트와 동일)

## 6. 커스터마이징 팁

- 컬럼을 추가/삭제하려면 `config.js`의 `COLUMNS` 배열과 `emptyTask()` 를 함께 수정하세요.
- CORS를 특정 GitHub Pages 주소로 제한하려면 `api/_cors.js`의 `"*"` 부분을 본인의 Pages 주소로 바꾸세요.
- 여러 사용자가 "동시에" 편집할 경우, 현재 구조는 마지막 저장이 우선(Last-write-wins) 합니다.
