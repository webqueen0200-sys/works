const { applyCors } = require("./_cors");
const { getJSON, setJSON } = require("./_kv");

module.exports = async (req, res) => {
  if (applyCors(req, res)) return;

  if (req.method === "GET") {
    const months = await getJSON("months", []);
    return res.status(200).json({ months });
  }

  if (req.method === "POST") {
    const { months } = req.body || {};
    if (!Array.isArray(months)) return res.status(400).json({ error: "months 배열이 필요합니다." });
    await setJSON("months", months);
    return res.status(200).json({ months });
  }

  return res.status(405).json({ error: "지원하지 않는 메서드입니다." });
};
