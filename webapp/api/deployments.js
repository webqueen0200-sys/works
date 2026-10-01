const { withApi } = require("./_cors");
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

function pickFields(input) {
  const output = {};
  for (const field of fields) {
    if (Object.prototype.hasOwnProperty.call(input, field)) output[field] = input[field] === "" ? null : input[field];
  }
  return output;
}

module.exports = withApi(async (req, res) => {
  const db = supabase();
  if (req.method === "GET") {
    const { data, error } = await db.from("deployments").select("*").order("created_at", { ascending: false });
    if (error) throw error;
    return res.status(200).json({ deployments: data || [] });
  }
  if (req.method === "POST") {
    const { data, error } = await db.from("deployments").insert(pickFields(req.body || {})).select("*").single();
    if (error) throw error;
    return res.status(201).json({ deployment: data });
  }
  if (req.method === "DELETE") {
    const ids = req.body && req.body.ids;
    if (!Array.isArray(ids) || ids.length === 0 || ids.some((id) => typeof id !== "string")) return res.status(400).json({ error: "ids 배열이 필요합니다." });
    const { data, error } = await db.from("deployments").delete().in("id", ids).select("id");
    if (error) throw error;
    return res.status(200).json({ ok: true, deleted: data ? data.length : 0 });
  }
  return res.status(405).json({ error: "지원하지 않는 메서드입니다." });
});
