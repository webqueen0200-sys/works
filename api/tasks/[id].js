const { applyCors } = require("../_cors");
const { getJSON, setJSON } = require("../_kv");

module.exports = async (req, res) => {
  if (applyCors(req, res)) return;

  const { id } = req.query;

  if (req.method === "PUT") {
    const { month, patch } = req.body || {};
    if (!month || !patch) return res.status(400).json({ error: "month, patch 값이 필요합니다." });
    const tasks = await getJSON(`tasks:${month}`, []);
    const idx = tasks.findIndex(t => t.id === id);
    if (idx === -1) return res.status(404).json({ error: "해당 업무를 찾을 수 없습니다." });
    tasks[idx] = { ...tasks[idx], ...patch, id };
    await setJSON(`tasks:${month}`, tasks);
    return res.status(200).json({ task: tasks[idx] });
  }

  if (req.method === "DELETE") {
    const month = req.query.month;
    if (!month) return res.status(400).json({ error: "month 쿼리 파라미터가 필요합니다." });
    const tasks = await getJSON(`tasks:${month}`, []);
    const next = tasks.filter(t => t.id !== id);
    await setJSON(`tasks:${month}`, next);
    return res.status(200).json({ deleted: id });
  }

  return res.status(405).json({ error: "지원하지 않는 메서드입니다." });
};
