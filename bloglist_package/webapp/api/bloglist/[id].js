// 블로그 게시 관리 개별 행 수정
//   PATCH  /api/bloglist/{id}  body { 필드명: 값 }  → { item: {...} }
//   DELETE /api/bloglist/{id}                      → { deleted: id }

const { withApi } = require("../_cors");
const { getJSON, setJSON } = require("../_kv");

const KEY = "bloglist";
const FIELDS = {
  title: 200, url: 1000, category: 0, product: 30, keyword: 500,
  stg_thumb: 20, stg_pub: 20, received_date: 10, open_date: 10, note: 1000
};

module.exports = withApi(async (req, res) => {
  const { id } = req.query;

  if (req.method === "PATCH" || req.method === "PUT") {
    const patch = req.body || {};
    const rows = await getJSON(KEY, []);
    const idx = rows.findIndex(r => r.id === id);
    if (idx === -1) return res.status(404).json({ error: "해당 행을 찾을 수 없습니다." });
    // 정의된 필드만 반영 (id / created_at 은 덮어쓰지 않음)
    const safe = {};
    Object.keys(patch).forEach(k => {
      if (!(k in FIELDS)) return;
      let v = patch[k] == null ? "" : String(patch[k]).trim();
      if (FIELDS[k]) v = v.slice(0, FIELDS[k]);
      safe[k] = v === "" ? null : v;
    });
    rows[idx] = { ...rows[idx], ...safe };
    await setJSON(KEY, rows);
    return res.status(200).json({ item: rows[idx] });
  }

  if (req.method === "DELETE") {
    const rows = await getJSON(KEY, []);
    const next = rows.filter(r => r.id !== id);
    await setJSON(KEY, next);
    return res.status(200).json({ deleted: id });
  }

  return res.status(405).json({ error: "지원하지 않는 메서드입니다." });
});
