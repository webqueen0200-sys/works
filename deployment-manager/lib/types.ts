export interface Deployment {
  id: string;
  no: string | null;
  deploy_date: string | null; // 배포일 (date)
  deploy_time: string | null; // 시간 (time)
  deploy_type: string | null; // 배포유형 (정기/비정기)
  category: string | null; // 분류 (소상공인/기업 등)
  work_type: string | null; // 구분 (배포/BO반영 등)
  scope: string | null; // 작업범위 (퍼블만/개발포함 등)
  rms_no: string | null; // RMS NO
  task_name: string | null; // 업무명
  file_list: string | null; // 파일목록
  requester: string | null; // 요청자
  planner: string | null; // 기획
  publisher: string | null; // 퍼블리싱
  developer: string | null; // 개발담당자
  impact: string | null; // 타서비스 영향도
  stg_review_at: string | null; // STG 검수일시
  stg_reviewer: string | null; // STG 검수자
  prod_review_at: string | null; // 운영 검수일시
  prod_reviewer: string | null; // 운영 검수자
  confirm_up: string | null; // 완료 확인(U+)
  created_at: string;
}

export type DeploymentInput = Omit<Deployment, "id" | "created_at">;

export const COLUMNS: { key: keyof Deployment; label: string; width?: string }[] = [
  { key: "no", label: "NO", width: "60px" },
  { key: "deploy_date", label: "배포일", width: "120px" },
  { key: "deploy_time", label: "시간", width: "90px" },
  { key: "deploy_type", label: "배포유형", width: "100px" },
  { key: "category", label: "분류", width: "100px" },
  { key: "work_type", label: "구분", width: "100px" },
  { key: "scope", label: "작업범위", width: "100px" },
  { key: "rms_no", label: "RMS NO", width: "100px" },
  { key: "task_name", label: "업무명", width: "260px" },
  { key: "file_list", label: "파일목록", width: "220px" },
  { key: "requester", label: "요청자", width: "90px" },
  { key: "planner", label: "기획", width: "90px" },
  { key: "publisher", label: "퍼블리싱", width: "90px" },
  { key: "developer", label: "개발담당자", width: "100px" },
  { key: "impact", label: "타서비스 영향도", width: "220px" },
  { key: "stg_review_at", label: "STG 검수일시", width: "160px" },
  { key: "stg_reviewer", label: "STG 검수자", width: "100px" },
  { key: "prod_review_at", label: "운영 검수일시", width: "160px" },
  { key: "prod_reviewer", label: "운영 검수자", width: "100px" },
  { key: "confirm_up", label: "완료 확인(U+)", width: "110px" },
];

export const SEARCH_KEYS: (keyof Deployment)[] = [
  "no",
  "deploy_type",
  "category",
  "work_type",
  "scope",
  "rms_no",
  "task_name",
  "file_list",
  "requester",
  "planner",
  "publisher",
  "developer",
  "impact",
  "stg_reviewer",
  "prod_reviewer",
  "confirm_up",
];

export const emptyDeploymentInput = (): DeploymentInput => ({
  no: "",
  deploy_date: "",
  deploy_time: "",
  deploy_type: "",
  category: "",
  work_type: "",
  scope: "",
  rms_no: "",
  task_name: "",
  file_list: "",
  requester: "",
  planner: "",
  publisher: "",
  developer: "",
  impact: "",
  stg_review_at: "",
  stg_reviewer: "",
  prod_review_at: "",
  prod_reviewer: "",
  confirm_up: "",
});
