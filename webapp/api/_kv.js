// Vercel KV / Upstash Redis 접근 래퍼.
//
// 연결 방식에 따라 주입되는 환경변수 이름이 다릅니다.
//  - Vercel KV            : KV_REST_API_URL / KV_REST_API_TOKEN
//  - Upstash(마켓플레이스) : UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN
// 둘 중 있는 쪽을 자동으로 사용합니다.
//
// 또한 import 시점에 예외가 터지면 함수 자체가 죽어 CORS 헤더 없이 실패하므로
// (브라우저에는 "Failed to fetch"로만 보임) 클라이언트 생성은 지연 처리합니다.

const { createClient } = require("@vercel/kv");

let client = null;

function resolveConfig() {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  return { url, token };
}

function getClient() {
  if (client) return client;
  const { url, token } = resolveConfig();
  if (!url || !token) {
    throw new Error(
      "KV 환경변수가 없습니다. Vercel 프로젝트 > Storage 에서 KV(Upstash Redis)를 만들고 Connect 한 뒤 Redeploy 하세요. " +
      "(필요 변수: KV_REST_API_URL / KV_REST_API_TOKEN)"
    );
  }
  client = createClient({ url, token });
  return client;
}

function isConfigured() {
  const { url, token } = resolveConfig();
  return Boolean(url && token);
}

async function getJSON(key, fallback) {
  const v = await getClient().get(key);
  return v === null || v === undefined ? fallback : v;
}

async function setJSON(key, value) {
  await getClient().set(key, value);
}

module.exports = { getClient, isConfigured, getJSON, setJSON };
