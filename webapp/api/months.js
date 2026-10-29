const { withApi } = require("./_cors");
const { getJSON, setJSON } = require("./_kv");
const { resolveNs } = require("./_ns");

module.exports = withApi(async (req, res) => {
  // ?ns=biz 가 있으면 저장 키 앞에 "biz:" 를 붙여 index_biz.html 데이터를 분리합니다.
  const ns = resolveNs(req);
  if (!ns.ok) return res.status(400).json({ error: ns.error });
  if (req.method === "GET") {
    const months = await getJSON(ns.key("months"), []);
    return res.status(200).json({ months });
  }

  if (req.method === "POST") {
    const { months } = req.body || {};
    if (!Array.isArray(months)) return res.status(400).json({ error: "months 배열이 필요합니다." });
    await setJSON(ns.key("months"), months);
    return res.status(200).json({ months });
  }

  return res.status(405).json({ error: "지원하지 않는 메서드입니다." });
});
