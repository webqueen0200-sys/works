// 모든 API 함수에서 공통으로 사용하는 CORS 헤더 설정.
// GitHub Pages(등 다른 도메인)에서 이 Vercel API를 호출할 수 있도록 허용합니다.
// 운영 환경에서는 '*' 대신 실제 GitHub Pages 주소로 좁혀서 사용하는 것을 권장합니다.
function applyCors(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return true; // 이미 응답을 보냈으므로 호출부에서 바로 return 해야 함
  }
  return false;
}

module.exports = { applyCors };
