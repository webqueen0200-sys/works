// 모든 API 함수 공통: CORS 헤더 + 에러 처리 래퍼
//
// 중요: 함수가 예외로 죽으면 Vercel 기본 오류 페이지가 응답되는데,
// 거기엔 CORS 헤더가 없어서 브라우저에는 "Failed to fetch"로만 보입니다.
// 그래서 모든 핸들러를 withApi()로 감싸 어떤 상황에서도 CORS 헤더를 붙입니다.

function setCorsHeaders(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Max-Age", "86400");
  // 데이터 API는 절대 캐시되면 안 됩니다.
  // (저장 직후 새로고침했을 때 예전 응답이 내려오는 것을 방지)
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
  res.setHeader("CDN-Cache-Control", "no-store");
  res.setHeader("Vercel-CDN-Cache-Control", "no-store");
}

// 기존 방식 호환용
function applyCors(req, res) {
  setCorsHeaders(res);
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return true;
  }
  return false;
}

// 권장 방식: module.exports = withApi(async (req, res) => { ... })
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
