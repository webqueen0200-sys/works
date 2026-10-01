const { withApi } = require("./_cors");
const { getJSON, setJSON } = require("./_kv");
const { randomUUID } = require("crypto");

const KEY = "deployments";
const fields = [
  "no", "deploy_date", "deploy_time", "deploy_type", "category", "work_type", "scope", "rms_no",
  "task_name", "file_list", "requester", "planner", "publisher", "developer", "impact",
  "stg_review_at", "stg_reviewer", "prod_review_at", "prod_reviewer", "confirm_up",
];

function pickFields(input) {
  const output = {};
  for (const field of fields) {
    if (Object.prototype.hasOwnProperty.call(input, field)) output[field] = input[field] === "" ? null : input[field];
  }
  return output;
}

module.exports = withApi(async (req, res) => {
  if (req.method === "GET") {
    const deployments = await getJSON(KEY, []);
    deployments.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    return res.status(200).json({ deployments });
  }

  if (req.method === "POST") {
    const deployments = await getJSON(KEY, []);
    const deployment = {
      ...pickFields(req.body || {}),
      id: randomUUID(),
      created_at: new Date().toISOString(),
    };
    deployments.push(deployment);
    await setJSON(KEY, deployments);
    return res.status(201).json({ deployment });
  }

  if (req.method === "DELETE") {
    const ids = req.body && req.body.ids;
    if (!Array.isArray(ids) || ids.length === 0 || ids.some((id) => typeof id !== "string")) return res.status(400).json({ error: "ids 배열이 필요합니다." });
    const deployments = await getJSON(KEY, []);
    const remaining = deployments.filter((deployment) => !ids.includes(deployment.id));
    await setJSON(KEY, remaining);
    return res.status(200).json({ ok: true, deleted: deployments.length - remaining.length });
  }

  return res.status(405).json({ error: "지원하지 않는 메서드입니다." });
});
