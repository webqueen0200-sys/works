// 모든 API 함수 공통: CORS 헤더 + 에러 처리 래퍼
//
// 중요: 함수가 예외로 죽으면 Vercel 기본 오류 페이지가 응답되는데,
// 거기엔 CORS 헤더가 없어서 브라우저에는 "Failed to fetch"로만 보입니다.
// 그래서 모든 핸들러를 withApi()로 감싸 어떤 상황에서도 CORS 헤더를 붙입니다.

function setCorsHeaders(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
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
// 기본적으로 로그인(토큰)이 있어야 호출됩니다. 로그인 사용자는 req.authUser 로 넘어옵니다.
// 로그인 없이 열어야 하는 API(연결 진단·로그인)는 withApi(handler, { public: true }) 로 감쌉니다.
function withApi(handler, opts) {
  const isPublic = !!(opts && opts.public);
  return async (req, res) => {
    setCorsHeaders(res);
    if (req.method === "OPTIONS") {
      res.status(204).end();
      return;
    }
    try {
      if (!isPublic) {
        // 순환 참조를 피하려고 여기서 불러옵니다.
        const { authenticate } = require("./_auth");
        const auth = await authenticate(req);
        if (!auth) {
          res.status(401).json({ error: "로그인이 필요합니다.", code: "AUTH_REQUIRED" });
          return;
        }
        req.authUser = auth.user;
        req.authToken = auth.token;
      }
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
