// 배포 관리(developlist.html) 목록 API
//   GET    /api/deployments            → { deployments: [...] }  (최신순)
//   POST   /api/deployments   body {}  → { deployment: {...} }   (빈 행 1건 추가)
//   DELETE /api/deployments   body { ids: [...] } → { deleted: n }
// 개별 행 수정은 api/deployments/[id].js (PATCH) 가 담당합니다.

const { withApi } = require("./_cors");
const { getJSON, setJSON } = require("./_kv");
const { randomUUID } = require("crypto");

const KEY = "deployments";

// developlist.html 의 COLUMNS 와 동일한 필드 구성
const FIELDS = [
  "deploy_date", "deploy_time", "deploy_type", "category", "work_type", "scope", "rms_no",
  "task_name", "file_list",
  "requester", "planner", "publisher", "developer",
  "impact",
  "stg_review_at", "stg_reviewer",
  "prod_review_at", "prod_reviewer",
  "confirm_up"
];

function blankRow() {
  const row = { id: randomUUID(), created_at: new Date().toISOString() };
  FIELDS.forEach(f => { row[f] = null; });
  return row;
}

module.exports = withApi(async (req, res) => {
  if (req.method === "GET") {
    const rows = await getJSON(KEY, []);
    // 최신 등록순 (페이지가 created_at 내림차순을 기대합니다)
    const sorted = [...rows].sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""));
    return res.status(200).json({ deployments: sorted });
  }

  if (req.method === "POST") {
    const rows = await getJSON(KEY, []);
    const row = blankRow();
    rows.push(row);
    await setJSON(KEY, rows);
    return res.status(201).json({ deployment: row });
  }

  if (req.method === "DELETE") {
    const { ids } = req.body || {};
    if (!Array.isArray(ids)) return res.status(400).json({ error: "ids 배열이 필요합니다." });
    const rows = await getJSON(KEY, []);
    const next = rows.filter(r => !ids.includes(r.id));
    await setJSON(KEY, next);
    return res.status(200).json({ deleted: rows.length - next.length });
  }

  return res.status(405).json({ error: "지원하지 않는 메서드입니다." });
});
