// 데이터 구분(namespace) 공통 함수
// - 요청 주소에 ?ns=biz 가 있으면 저장 키 앞에 "biz:" 를 붙여 index.html 데이터와 분리합니다.
// - ns 가 없으면 기존 키를 그대로 사용합니다. (index.html · developlist.html 은 영향 없음)
// - 파일명이 "_" 로 시작하므로 Vercel 이 API 주소로 노출하지 않습니다. (_cors.js, _kv.js 와 동일)

const NS_PATTERN = /^[a-z0-9_-]{1,20}$/i;

// 성공: { ok: true, key(name) }  /  실패: { ok: false, error }
function resolveNs(req) {
  let raw = req.query ? req.query.ns : "";
  if (Array.isArray(raw)) raw = raw[0];
  const ns = String(raw || "").trim();
  if (!ns) return { ok: true, ns: "", key: (name) => name };
  if (!NS_PATTERN.test(ns)) {
    return { ok: false, error: "ns 값은 영문·숫자·-·_ 20자 이내만 사용할 수 있습니다." };
  }
  return { ok: true, ns, key: (name) => `${ns}:${name}` };
}

module.exports = { resolveNs };
