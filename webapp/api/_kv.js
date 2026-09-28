// Vercel KV(Upstash Redis 기반) 접근 래퍼.
// Vercel 프로젝트에 Storage > KV(또는 Upstash for Redis) 를 연결하면
// 환경변수(KV_REST_API_URL, KV_REST_API_TOKEN 등)가 자동으로 주입됩니다.
const { kv } = require("@vercel/kv");

async function getJSON(key, fallback) {
  const v = await kv.get(key);
  return v === null || v === undefined ? fallback : v;
}

async function setJSON(key, value) {
  await kv.set(key, value);
}

module.exports = { kv, getJSON, setJSON };
