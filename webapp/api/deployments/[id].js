// 배포 관리 개별 행 수정
//   PATCH  /api/deployments/{id}  body { 필드명: 값 }  → { deployment: {...} }
//   DELETE /api/deployments/{id}                      → { deleted: id }

const { withApi } = require("../_cors");
const { getJSON, setJSON } = require("../_kv");

const KEY = "deployments";

module.exports = withApi(async (req, res) => {
  const { id } = req.query;

  if (req.method === "PATCH" || req.method === "PUT") {
    const patch = req.body || {};
    const rows = await getJSON(KEY, []);
    const idx = rows.findIndex(r => r.id === id);
    if (idx === -1) return res.status(404).json({ error: "해당 행을 찾을 수 없습니다." });
    // id / created_at 은 덮어쓰지 않습니다.
    const { id: _ignore, created_at: _ignore2, ...safe } = patch;
    rows[idx] = { ...rows[idx], ...safe };
    await setJSON(KEY, rows);
    return res.status(200).json({ deployment: rows[idx] });
  }

  if (req.method === "DELETE") {
    const rows = await getJSON(KEY, []);
    const next = rows.filter(r => r.id !== id);
    await setJSON(KEY, next);
    return res.status(200).json({ deleted: id });
  }

  return res.status(405).json({ error: "지원하지 않는 메서드입니다." });
});
