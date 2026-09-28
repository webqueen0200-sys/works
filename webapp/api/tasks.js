const { applyCors } = require("./_cors");
const { getJSON, setJSON } = require("./_kv");
const { randomUUID } = require("crypto");

module.exports = async (req, res) => {
  if (applyCors(req, res)) return;

  if (req.method === "GET") {
    const month = req.query.month;
    if (!month) return res.status(400).json({ error: "month 쿼리 파라미터가 필요합니다." });
    const tasks = await getJSON(`tasks:${month}`, []);
    return res.status(200).json({ tasks });
  }

  if (req.method === "POST") {
    const { month, task } = req.body || {};
    if (!month || !task) return res.status(400).json({ error: "month, task 값이 필요합니다." });
    const tasks = await getJSON(`tasks:${month}`, []);
    const newTask = { ...task, id: task.id || randomUUID() };
    tasks.push(newTask);
    await setJSON(`tasks:${month}`, tasks);
    return res.status(201).json({ task: newTask });
  }

  return res.status(405).json({ error: "지원하지 않는 메서드입니다." });
};
