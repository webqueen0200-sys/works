// 휴일 관리 API
//  GET  /api/holidays          → { holidays: { "2026": [{id,name,date}] }, leaves: [{id,start,end,type,assignee,role,hours,days}] }
//  PUT  /api/holidays          → body { holidays } 또는 { leaves } (보낸 항목만 저장)
//  ?ns=biz 가 있으면 저장 키 앞에 "biz:" 를 붙여 데이터를 분리합니다.
const { withApi } = require("./_cors");
const { getJSON, setJSON } = require("./_kv");

const NS_PATTERN = /^[a-z0-9_-]{1,20}$/i;

function resolveKey(req) {
  let raw = req.query ? req.query.ns : "";
  if (Array.isArray(raw)) raw = raw[0];
  const ns = String(raw || "").trim();
  if (!ns) return { ok: true, key: (name) => name };
  if (!NS_PATTERN.test(ns)) return { ok: false, error: "ns 값은 영문·숫자·-·_ 20자 이내만 사용할 수 있습니다." };
  return { ok: true, key: (name) => `${ns}:${name}` };
}

module.exports = withApi(async (req, res) => {
  const ns = resolveKey(req);
  if (!ns.ok) return res.status(400).json({ error: ns.error });

  if (req.method === "GET") {
    const holidays = await getJSON(ns.key("holidays"), {});
    const leaves = await getJSON(ns.key("leaves"), []);
    return res.status(200).json({ holidays, leaves });
  }

  if (req.method === "PUT") {
    const { holidays, leaves } = req.body || {};
    if (holidays === undefined && leaves === undefined) {
      return res.status(400).json({ error: "holidays 또는 leaves 값이 필요합니다." });
    }
    if (holidays !== undefined) {
      if (!holidays || typeof holidays !== "object" || Array.isArray(holidays)) {
        return res.status(400).json({ error: "holidays 는 연도별 객체여야 합니다." });
      }
      await setJSON(ns.key("holidays"), holidays);
    }
    if (leaves !== undefined) {
      if (!Array.isArray(leaves)) return res.status(400).json({ error: "leaves 는 배열이어야 합니다." });
      await setJSON(ns.key("leaves"), leaves);
    }
    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ error: "지원하지 않는 메서드입니다." });
});
