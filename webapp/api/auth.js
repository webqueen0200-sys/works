// 로그인 · 비밀번호 변경 · 사용자 관리 API (한 파일로 처리)
//
//  POST   /api/auth?action=login     { email, password }        → { token, user }
//  POST   /api/auth?action=logout                                → { ok }
//  GET    /api/auth?action=me                                    → { user }
//  POST   /api/auth?action=password  { current, next }           → { token, user }  (본인 비밀번호 변경)
//
//  [관리자 전용]
//  GET    /api/auth?action=users                                 → { users }
//  POST   /api/auth?action=users     { email, name, admin }      → 신규 등록 (초기 비밀번호 medialog2026!)
//  PATCH  /api/auth?action=users     { email, name?, active?, admin? }
//  DELETE /api/auth?action=users     { email }
//  POST   /api/auth?action=reset     { email }                   → 비밀번호를 medialog2026! 로 초기화
//
// 로그인 토큰은 요청 헤더 "Authorization: Bearer <토큰>" 으로 보냅니다.

const { withApi } = require("./_cors");
const A = require("./_auth");

function bad(res, status, error) {
  res.status(status).json({ error });
}

function body(req) {
  const b = req.body;
  if (!b) return {};
  if (typeof b === "string") {
    try { return JSON.parse(b); } catch (e) { return {}; }
  }
  return b;
}

// 활성 관리자가 최소 1명 남는지 확인
function hasOtherActiveAdmin(users, exceptEmail) {
  return users.some((u) => u.email !== exceptEmail && u.admin && u.active !== false);
}

module.exports = withApi(async (req, res) => {
  let action = req.query ? req.query.action : "";
  if (Array.isArray(action)) action = action[0];
  action = String(action || "");

  // ---------- 로그인 ----------
  if (action === "login") {
    if (req.method !== "POST") return bad(res, 405, "지원하지 않는 메서드입니다.");
    const { email, password } = body(req);
    const em = A.normEmail(email);
    if (!em || !password) return bad(res, 400, "메일주소와 비밀번호를 입력하세요.");
    if ((await A.failCount(em)) >= A.FAIL_LIMIT) {
      return bad(res, 429, "로그인 실패가 많아 잠시 차단되었습니다. 15분 후 다시 시도하세요.");
    }
    const users = await A.getUsersWithBootstrap();
    const user = users.find((u) => u.email === em);
    if (!user || !A.verifyPassword(password, user)) {
      await A.addFail(em);
      return bad(res, 401, "메일주소 또는 비밀번호가 맞지 않습니다.");
    }
    if (user.active === false) {
      return bad(res, 403, "사용이 중지된 계정입니다. 관리자에게 문의하세요.");
    }
    await A.clearFail(em);
    user.lastLoginAt = new Date().toISOString();
    await A.saveUsers(users);
    const token = await A.createSession(user);
    return res.status(200).json({ token, user: A.publicUser(user) });
  }

  // ---------- 이하 로그인 필요 ----------
  const auth = await A.authenticate(req);
  if (!auth) return res.status(401).json({ error: "로그인이 필요합니다.", code: "AUTH_REQUIRED" });
  const me = auth.user;

  if (action === "logout") {
    await A.deleteSession(auth.token);
    return res.status(200).json({ ok: true });
  }

  if (action === "me") {
    return res.status(200).json({ user: A.publicUser(me) });
  }

  if (action === "password") {
    if (req.method !== "POST") return bad(res, 405, "지원하지 않는 메서드입니다.");
    const { current, next } = body(req);
    if (!A.verifyPassword(current, me)) return bad(res, 400, "현재 비밀번호가 맞지 않습니다.");
    if (current === next) return bad(res, 400, "현재 비밀번호와 다른 비밀번호를 입력하세요.");
    const msg = A.checkNewPassword(next);
    if (msg) return bad(res, 400, msg);
    const users = await A.getUsers();
    const u = users.find((x) => x.email === me.email);
    const { salt, hash } = A.hashPassword(next);
    Object.assign(u, { salt, hash, ver: (u.ver || 1) + 1, mustChange: false, updatedAt: new Date().toISOString() });
    await A.saveUsers(users);
    // 다른 기기의 로그인은 끊고, 지금 화면은 새 토큰으로 계속 사용
    await A.deleteSession(auth.token);
    const token = await A.createSession(u);
    return res.status(200).json({ token, user: A.publicUser(u) });
  }

  // ---------- 관리자 전용 ----------
  if (action === "users" || action === "reset") {
    if (!me.admin) return bad(res, 403, "관리자만 사용할 수 있습니다.");
    const users = await A.getUsers();
    const b = body(req);

    if (action === "reset") {
      if (req.method !== "POST") return bad(res, 405, "지원하지 않는 메서드입니다.");
      const u = users.find((x) => x.email === A.normEmail(b.email));
      if (!u) return bad(res, 404, "사용자를 찾을 수 없습니다.");
      const { salt, hash } = A.hashPassword(A.DEFAULT_PASSWORD);
      Object.assign(u, { salt, hash, ver: (u.ver || 1) + 1, mustChange: true, updatedAt: new Date().toISOString() });
      await A.saveUsers(users);
      await A.clearFail(u.email);
      return res.status(200).json({ user: A.publicUser(u), password: A.DEFAULT_PASSWORD });
    }

    if (req.method === "GET") {
      return res.status(200).json({ users: users.map(A.publicUser) });
    }

    if (req.method === "POST") {
      const em = A.normEmail(b.email);
      const name = String(b.name || "").trim();
      if (!A.isValidEmail(em)) return bad(res, 400, "메일주소 형식이 맞지 않습니다.");
      if (!name) return bad(res, 400, "이름을 입력하세요.");
      if (users.some((u) => u.email === em)) return bad(res, 409, "이미 등록된 메일주소입니다.");
      const u = A.newUser({ email: em, name, admin: !!b.admin });
      users.push(u);
      await A.saveUsers(users);
      return res.status(200).json({ user: A.publicUser(u), password: A.DEFAULT_PASSWORD });
    }

    if (req.method === "PATCH") {
      const u = users.find((x) => x.email === A.normEmail(b.email));
      if (!u) return bad(res, 404, "사용자를 찾을 수 없습니다.");
      if (b.name !== undefined) {
        const name = String(b.name || "").trim();
        if (!name) return bad(res, 400, "이름을 입력하세요.");
        u.name = name;
      }
      if (b.active !== undefined) {
        const active = !!b.active;
        if (!active && u.email === me.email) return bad(res, 400, "본인 계정은 사용 불가로 바꿀 수 없습니다.");
        if (!active && u.admin && !hasOtherActiveAdmin(users, u.email)) return bad(res, 400, "사용 가능한 관리자가 최소 1명 있어야 합니다.");
        if (!active && u.active !== false) u.ver = (u.ver || 1) + 1; // 사용 불가 → 즉시 로그아웃
        u.active = active;
      }
      if (b.admin !== undefined) {
        const admin = !!b.admin;
        if (!admin && u.email === me.email) return bad(res, 400, "본인의 관리자 권한은 해제할 수 없습니다.");
        if (!admin && u.admin && !hasOtherActiveAdmin(users, u.email)) return bad(res, 400, "사용 가능한 관리자가 최소 1명 있어야 합니다.");
        u.admin = admin;
      }
      u.updatedAt = new Date().toISOString();
      await A.saveUsers(users);
      return res.status(200).json({ user: A.publicUser(u) });
    }

    if (req.method === "DELETE") {
      const em = A.normEmail(b.email || (req.query && req.query.email));
      const u = users.find((x) => x.email === em);
      if (!u) return bad(res, 404, "사용자를 찾을 수 없습니다.");
      if (u.email === me.email) return bad(res, 400, "본인 계정은 삭제할 수 없습니다.");
      if (u.admin && !hasOtherActiveAdmin(users, u.email)) return bad(res, 400, "사용 가능한 관리자가 최소 1명 있어야 합니다.");
      await A.saveUsers(users.filter((x) => x.email !== em));
      return res.status(200).json({ deleted: em });
    }

    return bad(res, 405, "지원하지 않는 메서드입니다.");
  }

  return bad(res, 400, "action 값이 올바르지 않습니다. (login, logout, me, password, users, reset)");
}, { public: true });
