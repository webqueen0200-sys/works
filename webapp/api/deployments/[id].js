const { withApi } = require("../_cors");
const { createClient } = require("@supabase/supabase-js");

const fields = [
  "no", "deploy_date", "deploy_time", "deploy_type", "category", "work_type", "scope", "rms_no",
  "task_name", "file_list", "requester", "planner", "publisher", "developer", "impact",
  "stg_review_at", "stg_reviewer", "prod_review_at", "prod_reviewer", "confirm_up",
];

function supabase() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

module.exports = withApi(async (req, res) => {
  if (req.method !== "PATCH") return res.status(405).json({ error: "지원하지 않는 메서드입니다." });
  const id = req.query.id;
  if (!id) return res.status(400).json({ error: "id가 필요합니다." });
  const input = req.body || {};
  const payload = {};
  for (const field of fields) {
    if (Object.prototype.hasOwnProperty.call(input, field)) payload[field] = input[field] === "" ? null : input[field];
  }
  if (Object.keys(payload).length === 0) return res.status(400).json({ error: "수정할 필드가 필요합니다." });
  const { data, error } = await supabase().from("deployments").update(payload).eq("id", id).select("*").maybeSingle();
  if (error) throw error;
  if (!data) return res.status(404).json({ error: "해당 배포 건을 찾을 수 없습니다." });
  return res.status(200).json({ deployment: data });
});
