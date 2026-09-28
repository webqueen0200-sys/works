const { applyCors } = require("./_cors");
const { getJSON, setJSON } = require("./_kv");

const DEFAULT_SETTINGS = { targetMM: { 기획: 2, 디자인: 2, 퍼블: 3, GA: 1, PM: 1 }, workDays: 20 };

module.exports = async (req, res) => {
  if (applyCors(req, res)) return;

  if (req.method === "GET") {
    const month = req.query.month;
    if (!month) return res.status(400).json({ error: "month 쿼리 파라미터가 필요합니다." });
    const settings = await getJSON(`settings:${month}`, DEFAULT_SETTINGS);
    return res.status(200).json({ settings });
  }

  if (req.method === "PUT") {
    const { month, settings } = req.body || {};
    if (!month || !settings) return res.status(400).json({ error: "month, settings 값이 필요합니다." });
    await setJSON(`settings:${month}`, settings);
    return res.status(200).json({ settings });
  }

  return res.status(405).json({ error: "지원하지 않는 메서드입니다." });
};
