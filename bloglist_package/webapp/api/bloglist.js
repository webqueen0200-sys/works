// 블로그 게시 관리(bloglist.html) 목록 API
//   GET    /api/bloglist                              → { items: [...] }  (최신순)
//   POST   /api/bloglist   body {}                    → { item: {...} }   (빈 행 1건 추가)
//   POST   /api/bloglist   body { rows:[...], replace } → { items: [...] } (CSV 일괄 등록, 배열 순서대로 맨 위)
//   DELETE /api/bloglist   body { ids: [...] }        → { deleted: n }
// 개별 행 수정은 api/bloglist/[id].js (PATCH) 가 담당합니다.

const { withApi } = require("./_cors");
const { getJSON, setJSON } = require("./_kv");
const { randomUUID } = require("crypto");

const KEY = "bloglist";

// bloglist.html 의 COLUMNS 와 동일한 필드 구성 + 최대 길이
const FIELDS = {
  title: 200, url: 1000, category: 0, product: 30, keyword: 500,
  stg_thumb: 20, stg_pub: 20, received_date: 10, open_date: 10, note: 1000
};

function clean(src) {
  const out = {};
  Object.keys(FIELDS).forEach(f => {
    let v = src && src[f] != null ? String(src[f]).trim() : "";
    if (FIELDS[f]) v = v.slice(0, FIELDS[f]);
    out[f] = v === "" ? null : v;
  });
  return out;
}

function newRow(src, createdAt) {
  return { id: randomUUID(), created_at: createdAt || new Date().toISOString(), ...clean(src) };
}

module.exports = withApi(async (req, res) => {
  if (req.method === "GET") {
    const rows = await getJSON(KEY, []);
    const sorted = [...rows].sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""));
    return res.status(200).json({ items: sorted });
  }

  if (req.method === "POST") {
    const body = req.body || {};
    const rows = await getJSON(KEY, []);

    if (Array.isArray(body.rows)) {
      if (body.rows.length > 5000) return res.status(400).json({ error: "한 번에 최대 5000건까지 등록할 수 있습니다." });
      const base = Date.now();
      const n = body.rows.length;
      // 첫 번째 행이 가장 최신(맨 위)이 되도록 created_at 부여
      const made = body.rows.map((r, i) => newRow(r, new Date(base + (n - i)).toISOString()));
      await setJSON(KEY, body.replace ? made : rows.concat(made));
      return res.status(201).json({ items: made });
    }

    const row = newRow(body);
    rows.push(row);
    await setJSON(KEY, rows);
    return res.status(201).json({ item: row });
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
