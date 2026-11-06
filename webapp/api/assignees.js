const { withApi } = require("./_cors");
const { getJSON, setJSON } = require("./_kv");
const { resolveNs } = require("./_ns");
const detail = require("./_detail");

const DEFAULT_ASSIGNEES = {
  기획: ["기획2", "기획3", "기획4"],
  디자인: ["디자인1", "디자인2", "디자인3"],
  퍼블: ["퍼블1", "퍼블2", "퍼블3"],
  GA: ["GA1", "GA2"]
};

module.exports = withApi(async (req, res) => {
  // ?ns=biz 가 있으면 저장 키 앞에 "biz:" 를 붙여 index_biz.html 데이터를 분리합니다.
  const ns = resolveNs(req);
  if (!ns.ok) return res.status(400).json({ error: ns.error });
  if (detail.denyNonAdminWrite(req, res, ns)) return; // 업무상세내역은 관리자만 변경
  if (req.method === "GET") {
    // stored: 저장된 값이 있는지 (없으면 화면이 기본값을 씁니다)
    const saved = await getJSON(ns.key("assignees"), null);
    return res.status(200).json({ assignees: saved || DEFAULT_ASSIGNEES, stored: !!saved });
  }

  if (req.method === "PUT") {
    const { assignees } = req.body || {};
    if (!assignees) return res.status(400).json({ error: "assignees 값이 필요합니다." });
    await setJSON(ns.key("assignees"), assignees);
    return res.status(200).json({ assignees });
  }

  return res.status(405).json({ error: "지원하지 않는 메서드입니다." });
});
