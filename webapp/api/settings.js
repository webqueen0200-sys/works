const { withApi } = require("./_cors");
const { getJSON, setJSON } = require("./_kv");
const { resolveNs } = require("./_ns");
const detail = require("./_detail");

const DEFAULT_SETTINGS = { targetMM: { 기획: 2, 디자인: 2, 퍼블: 3, GA: 1, PM: 1 }, workDays: 20 };

module.exports = withApi(async (req, res) => {
  // ?ns=biz 가 있으면 저장 키 앞에 "biz:" 를 붙여 index_biz.html 데이터를 분리합니다.
  const ns = resolveNs(req);
  if (!ns.ok) return res.status(400).json({ error: ns.error });
  // ?ns=detail&month=favorites : 사용자별 분류 즐겨찾기 (본인 것만 읽고 씀)
  if (detail.isDetail(ns) && (req.query.month === "favorites" || (req.body && req.body.month === "favorites"))) {
    const favKey = ns.key(`favorites:${detail.normEmail(req.authUser && req.authUser.email)}`);
    if (req.method === "GET") return res.status(200).json({ settings: await getJSON(favKey, { items: [] }) });
    if (req.method === "PUT") {
      const items = (((req.body || {}).settings || {}).items || []).slice(0, 30);
      await setJSON(favKey, { items });
      return res.status(200).json({ settings: { items } });
    }
    return res.status(405).json({ error: "지원하지 않는 메서드입니다." });
  }
  if (detail.denyNonAdminWrite(req, res, ns)) return;
  if (req.method === "GET") {
    const month = req.query.month;
    if (!month) return res.status(400).json({ error: "month 쿼리 파라미터가 필요합니다." });
    const settings = await getJSON(ns.key(`settings:${month}`), DEFAULT_SETTINGS);
    return res.status(200).json({ settings });
  }

  if (req.method === "PUT") {
    const { month, settings } = req.body || {};
    if (!month || !settings) return res.status(400).json({ error: "month, settings 값이 필요합니다." });
    await setJSON(ns.key(`settings:${month}`), settings);
    return res.status(200).json({ settings });
  }

  return res.status(405).json({ error: "지원하지 않는 메서드입니다." });
});
