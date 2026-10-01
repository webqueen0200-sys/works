// ============================================================
// config.js — 업무관리 시트 공통 설정
// "분류" / "분류 정의" 시트를 기준으로 한 드롭다운 옵션 정의
// ============================================================

// 배포용 API 베이스 URL. Vercel에 배포한 뒤 여기 본인의 API 주소를 넣으세요.
// 비워두면(빈 문자열) 브라우저 localStorage에 저장되는 데모 모드로 동작합니다.
const API_BASE = "https://works-beige.vercel.app"; // 예: "https://your-project.vercel.app"

// 대분류
const MAJOR_CATEGORIES = ["기업", "소상공인", "GA", "공통", "SI"];

// 대분류별 중분류 ("분류"/"요약" 시트 기준)
const MINOR_CATEGORY_MAP = {
  "기업": ["상품서비스", "요금제/패키지", "메인", "비즈인사이트", "이벤트", "마이페이지", "고객지원", "혜택", "개선", "빌보드/팝업", "콘텐츠", "가입신청", "개인화", "개발지원", "공통", "외부채널", "웹접근성", "기타"],
  "소상공인": ["상품서비스", "요금제/패키지", "메인", "소상공인 인사이트", "이벤트", "마이페이지", "고객지원", "혜택", "개선", "빌보드/팝업", "콘텐츠", "가입신청", "개인화", "개발지원", "공통", "외부채널", "웹접근성", "기타"],
  "GA": ["GA_기업", "GA_소상", "GA_공통"],
  "공통": ["업무지원", "업무관리", "회의", "기타"],
  "SI": ["기타"]
};

// 구분 / 중요도 / 진행현황 / 배포 / 검수여부
const OPTIONS = {
  배포: ["O", "X", "-"],
  구분: ["신규", "수정", "기타"],
  중요도: ["긴급", "상", "중", "하", "-"],
  진행현황: ["예정", "접수", "검토", "대기", "진행", "검수", "완료", "개발", "보류", "취소"],
  검수여부: ["O", "X", "-"]
};

// 집계에서 제외되는 진행현황(취소)
const EXCLUDED_STATUS = ["취소"];

// 담당자 실명 -> 익명 코드 매핑 (화면/저장 시 코드만 사용)
// 실명은 참고용 주석으로만 남겨둡니다.
// 송승현=기획2, 전상현=기획3, 전지혜=기획4
// 우승연=디자인1, 김지윤=디자인2, 박중현=디자인3
// 김형윤=퍼블1, 최봄=퍼블2, 이대희=퍼블3
const ASSIGNEE_OPTIONS = {
  기획: ["기획2", "기획3", "기획4"],
  디자인: ["디자인1", "디자인2", "디자인3"],
  퍼블: ["퍼블1", "퍼블2", "퍼블3"]
};

// GA 담당 코드
const GA_OPTIONS = ["GA1", "GA2"];

// 기준 MM (월 목표 투입공수) — 요약 탭 상단 "기준 MM" 표에 사용, 설정에서 조정 가능
const DEFAULT_TARGET_MM = { 기획: 2, 디자인: 2, 퍼블: 3, GA: 1, PM: 1 };

// MM 환산 기준 (총합 H ÷ MM_HOURS = MM)
const MM_HOURS = 160;

// 업무현황 시트 컬럼 정의 (표시 순서)
// type: text | textarea | select | select-dependent | datepick | number | readonly | ticket
const COLUMNS = [
  { key: "no", label: "NO", type: "readonly", width: 36, group: "meta" },
  { key: "ticket", label: "티켓번호", type: "ticket", width: 64, group: "meta" },
  { key: "deploy", label: "배포", type: "select", options: OPTIONS.배포, width: 52, group: "meta" },
  { key: "major", label: "대분류", type: "select", options: MAJOR_CATEGORIES, width: 84, group: "classify" },
  { key: "minor", label: "중분류", type: "select-dependent", dependsOn: "major", map: MINOR_CATEGORY_MAP, width: 110, group: "classify" },
  { key: "kind", label: "구분", type: "select", options: OPTIONS.구분, width: 60, group: "classify" },
  { key: "priority", label: "중요도", type: "select", options: OPTIONS.중요도, width: 60, group: "classify" },
  { key: "title", label: "업무명", type: "text", width: 300, group: "content" },
  { key: "detail", label: "업무상세", type: "textarea", width: 200, group: "content" },
  { key: "reqTeam", label: "요청팀(U+)", type: "text", width: 62, maxLength: 4, group: "requester" },
  { key: "reqPerson", label: "요청자", type: "text", width: 44, maxLength: 4, group: "requester" },
  { key: "pm", label: "접수자", type: "text", width: 44, maxLength: 4, group: "requester" },
  { key: "planner", label: "기획", type: "select", options: ASSIGNEE_OPTIONS.기획, width: 76, group: "assignee" },
  { key: "designer", label: "디자인", type: "select", options: ASSIGNEE_OPTIONS.디자인, width: 76, group: "assignee" },
  { key: "publisher", label: "퍼블", type: "select", options: ASSIGNEE_OPTIONS.퍼블, width: 76, group: "assignee" },
  { key: "developer", label: "개발", type: "text", width: 44, maxLength: 4, group: "assignee" },
  { key: "ga", label: "GA", type: "select", options: GA_OPTIONS, width: 60, group: "assignee" },
  { key: "receivedDate", label: "접수일", type: "datepick", width: 70, group: "schedule" },
  { key: "startDate", label: "시작일", type: "datepick", width: 70, group: "schedule" },
  { key: "dueDate", label: "완료예정", type: "datepick", width: 70, group: "schedule" },
  { key: "doneDate", label: "완료일", type: "datepick", width: 70, group: "schedule" },
  { key: "status", label: "진행현황", type: "select", options: OPTIONS.진행현황, width: 76, group: "schedule" },
  { key: "reviewed", label: "검수(U+)", type: "select", options: OPTIONS.검수여부, width: 66, group: "schedule" },
  { key: "hPlanner", label: "기획", type: "number", width: 34, group: "hours" },
  { key: "hDesigner", label: "디자인", type: "number", width: 34, group: "hours" },
  { key: "hPublisher", label: "퍼블", type: "number", width: 34, group: "hours" },
  { key: "hGa", label: "GA", type: "number", width: 34, group: "hours" },
  { key: "hPm", label: "PM", type: "number", width: 34, group: "hours" },
  { key: "hTotal", label: "총합", type: "readonly", width: 38, group: "hours" },
  { key: "mm", label: "MM", type: "readonly", width: 44, group: "hours" },
  { key: "note", label: "비고", type: "textarea", width: 160, group: "note" }
];

function emptyTask() {
  return {
    id: null,
    no: 0,
    ticket: "", deploy: "", major: "", minor: "", kind: "", priority: "",
    title: "", detail: "",
    reqTeam: "", reqPerson: "", pm: "",
    planner: "", designer: "", publisher: "", developer: "", ga: "",
    receivedDate: "", startDate: "", dueDate: "", doneDate: "",
    status: "", reviewed: "",
    hPlanner: "", hDesigner: "", hPublisher: "", hGa: "", hPm: "",
    note: ""
  };
}

// 티켓번호로 이동할 Redmine 이슈 URL 생성
function redmineUrl(ticket) {
  return `http://210.108.138.187/redmine/issues/${ticket}`;
}

// 브라우저(app.js)와 Node(Vercel API) 양쪽에서 사용할 수 있도록 export
if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    API_BASE, MAJOR_CATEGORIES, MINOR_CATEGORY_MAP, OPTIONS, EXCLUDED_STATUS,
    ASSIGNEE_OPTIONS, GA_OPTIONS, DEFAULT_TARGET_MM, MM_HOURS, COLUMNS, emptyTask, redmineUrl
  };
}
