// 모든 API 함수 공통: CORS 헤더 + 에러 처리 래퍼
function setCorsHeaders(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Max-Age", "86400");
}

function applyCors(req, res) {
  setCorsHeaders(res);
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return true;
  }
  return false;
}

function withApi(handler) {
  return async (req, res) => {
    setCorsHeaders(res);
    if (req.method === "OPTIONS") {
      res.status(204).end();
      return;
    }
    try {
      await handler(req, res);
    } catch (err) {
      console.error("[API ERROR]", req.method, req.url, err);
      if (!res.headersSent) {
        res.status(500).json({
          error: (err && err.message) || "서버 내부 오류",
          hint: "Vercel 프로젝트에 KV(Upstash Redis)가 연결되어 있고 환경변수가 주입되었는지 확인하세요."
        });
      }
    }
  };
}

module.exports = { applyCors, withApi, setCorsHeaders };
