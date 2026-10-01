const { withApi } = require("./_cors");
const { getJSON, setJSON } = require("./_kv");

const DEFAULT_ASSIGNEES = {
  기획: ["기획2", "기획3", "기획4"],
  디자인: ["디자인1", "디자인2", "디자인3"],
  퍼블: ["퍼블1", "퍼블2", "퍼블3"],
  GA: ["GA1", "GA2"]
};

module.exports = withApi(async (req, res) => {
  if (req.method === "GET") {
    const assignees = await getJSON("assignees", DEFAULT_ASSIGNEES);
    return res.status(200).json({ assignees });
  }

  if (req.method === "PUT") {
    const { assignees } = req.body || {};
    if (!assignees) return res.status(400).json({ error: "assignees 값이 필요합니다." });
    await setJSON("assignees", assignees);
    return res.status(200).json({ assignees });
  }

  return res.status(405).json({ error: "지원하지 않는 메서드입니다." });
});
