// ============================================================
// auth.js — 로그인 공통 스크립트
// 업무관리(index.html) · 디지털사업(index_biz.html) · 배포 관리(developlist.html) · 블로그 게시 관리(bloglist.html)
// 네 화면이 <head> 맨 위에서 이 파일 하나를 불러 같은 로그인을 씁니다.
//
// 하는 일
//  1) 로그인 전에는 화면 내용을 가리고 로그인 창을 띄웁니다.
//  2) works-beige API 로 가는 요청(fetch)에 로그인 토큰을 자동으로 붙입니다.
//     → 각 화면의 기존 코드(app.js 등)는 고치지 않아도 됩니다.
//     → 로그인 전에 나간 요청은 로그인이 끝날 때까지 기다렸다가 보내집니다.
//     → 중간에 로그인이 풀리면(만료·사용 불가) 로그인 창을 다시 띄우고, 로그인 후 그 요청을 다시 보냅니다.
//  3) 상단 메뉴 오른쪽에 사용자 메뉴(비밀번호 변경 · 사용자 관리 · 로그아웃)를 붙입니다.
// ============================================================
(function () {
  "use strict";
  if (window.WorksAuth) return;

  var API = String(window.AUTH_API_BASE || "https://works-beige.vercel.app").replace(/\/+$/, "");
  var TOKEN_KEY = "works_auth_token_v1";
  var origFetch = window.fetch.bind(window);

  var state = { token: "", user: null, ready: null, resolveReady: null, checking: false };

  // ---------- 토큰 저장 ----------
  function loadToken() { try { return localStorage.getItem(TOKEN_KEY) || ""; } catch (e) { return ""; } }
  function saveToken(t) { try { t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY); } catch (e) {} }
  state.token = loadToken();

  // ---------- 화면 가리기 (로그인 전) ----------
  var root = document.documentElement;
  root.classList.add("wk-auth-pending");

  var css = [
    "html.wk-auth-pending body{visibility:hidden}",
    "html.wk-auth-pending #wkAuthLayer{visibility:visible}",
    "#wkAuthLayer,#wkAuthLayer *{box-sizing:border-box}",
    "#wkAuthLayer{font-family:'Pretendard Variable',Pretendard,'SF Pro Text',system-ui,-apple-system,sans-serif;letter-spacing:-0.2px;color:#1d1d1f}",
    ".wk-screen{position:fixed;inset:0;z-index:2147483000;display:flex;align-items:center;justify-content:center;padding:16px;background:#f5f5f7;overflow:auto}",
    ".wk-dim{position:fixed;inset:0;z-index:2147483000;display:flex;align-items:center;justify-content:center;padding:16px;background:rgba(0,0,0,.42);-webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px);overflow:auto}",
    ".wk-card{width:100%;max-width:380px;background:#fff;border-radius:18px;padding:32px 28px 28px;box-shadow:0 12px 40px rgba(0,0,0,.12)}",
    ".wk-card.wide{max-width:920px;padding:24px 24px 20px}",
    ".wk-card h2{margin:0 0 6px;font-size:22px;font-weight:700;letter-spacing:-0.4px}",
    ".wk-card .wk-sub{margin:0 0 22px;font-size:13px;color:#6e6e73;line-height:1.5}",
    ".wk-field{display:block;margin-bottom:12px}",
    ".wk-field span{display:block;margin-bottom:6px;font-size:12px;font-weight:600;color:#424245}",
    ".wk-input{width:100%;height:40px;padding:0 12px;border:1px solid #d2d2d7;border-radius:10px;font:inherit;font-size:14px;color:#1d1d1f;background:#fff;outline:none}",
    ".wk-input:focus{border-color:#0071e3;box-shadow:0 0 0 3px rgba(0,113,227,.18)}",
    ".wk-btn{display:inline-flex;align-items:center;justify-content:center;height:36px;padding:0 14px;border:1px solid #d2d2d7;border-radius:980px;background:#fff;color:#1d1d1f;font:inherit;font-size:13px;font-weight:500;cursor:pointer;white-space:nowrap}",
    ".wk-btn:hover{background:#f5f5f7}",
    ".wk-btn.primary{background:#0071e3;border-color:#0071e3;color:#fff}",
    ".wk-btn.primary:hover{background:#0077ed}",
    ".wk-btn.danger{color:#d70015}",
    ".wk-btn.sm{height:28px;padding:0 10px;font-size:12px}",
    ".wk-btn.block{width:100%;height:42px;font-size:15px;margin-top:6px}",
    ".wk-btn:disabled{opacity:.5;cursor:default}",
    ".wk-err{min-height:18px;margin:4px 0 6px;font-size:12px;color:#d70015;line-height:1.5}",
    ".wk-ok{color:#1d7d3a}",
    ".wk-hint{margin:10px 0 0;font-size:12px;color:#86868b;line-height:1.5}",
    ".wk-row{display:flex;gap:8px;justify-content:flex-end;margin-top:14px}",
    ".wk-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:14px}",
    ".wk-head h2{margin:0}",
    ".wk-add{display:flex;flex-wrap:wrap;gap:8px;align-items:center;padding:12px;border-radius:12px;background:#f5f5f7;margin-bottom:12px}",
    ".wk-add .wk-input{width:auto;flex:1 1 200px;height:34px}",
    ".wk-add label{display:inline-flex;align-items:center;gap:4px;font-size:13px;color:#424245}",
    ".wk-table-wrap{max-height:56vh;overflow:auto;border:1px solid #e8e8ed;border-radius:12px}",
    ".wk-table{width:100%;border-collapse:collapse;font-size:13px}",
    ".wk-table th{position:sticky;top:0;background:#fafafc;font-weight:600;color:#424245;text-align:center;padding:9px 8px;border-bottom:1px solid #e8e8ed;white-space:nowrap}",
    ".wk-table td{padding:7px 8px;border-bottom:1px solid #f0f0f3;text-align:center;vertical-align:middle;white-space:nowrap}",
    ".wk-table td.l{text-align:left}",
    ".wk-table tr.off td{color:#86868b}",
    ".wk-table .wk-input{height:30px;font-size:13px;min-width:90px}",
    ".wk-tag{display:inline-block;padding:2px 8px;border-radius:980px;font-size:11px;font-weight:600}",
    ".wk-tag.on{background:#e3f3e8;color:#1d7d3a}.wk-tag.off{background:#f2f2f4;color:#86868b}.wk-tag.warn{background:#fff4e0;color:#a05a00}",
    ".wk-switch{position:relative;display:inline-block;width:38px;height:22px;cursor:pointer;vertical-align:middle}",
    ".wk-switch input{opacity:0;width:0;height:0}",
    ".wk-switch i{position:absolute;inset:0;border-radius:22px;background:#d2d2d7;transition:.15s}",
    ".wk-switch i:before{content:'';position:absolute;left:2px;top:2px;width:18px;height:18px;border-radius:50%;background:#fff;box-shadow:0 1px 2px rgba(0,0,0,.2);transition:.15s}",
    ".wk-switch input:checked+i{background:#34c759}",
    ".wk-switch input:checked+i:before{transform:translateX(16px)}",
    ".wk-switch input:disabled+i{opacity:.45;cursor:default}",
    // 상단 사용자 메뉴
    ".wk-user{position:relative;margin-left:auto;display:flex;align-items:center;height:100%;flex:0 0 auto}",
    ".wk-user-btn{display:inline-flex;align-items:center;gap:6px;height:28px;padding:0 10px;border:0;border-radius:980px;background:rgba(255,255,255,.12);color:#fff;font-family:'Pretendard Variable',Pretendard,system-ui,sans-serif;font-size:12px;cursor:pointer;white-space:nowrap}",
    ".wk-user-btn:hover{background:rgba(255,255,255,.22)}",
    ".wk-user-menu{position:fixed;z-index:2147482000;min-width:180px;padding:6px;border-radius:12px;background:#fff;box-shadow:0 8px 28px rgba(0,0,0,.18);font-family:'Pretendard Variable',Pretendard,system-ui,sans-serif}",
    ".wk-user-menu .who{padding:8px 10px 10px;border-bottom:1px solid #f0f0f3;margin-bottom:4px;font-size:12px;color:#6e6e73;line-height:1.5}",
    ".wk-user-menu .who b{display:block;font-size:13px;color:#1d1d1f}",
    ".wk-user-menu button{display:block;width:100%;text-align:left;padding:8px 10px;border:0;border-radius:8px;background:none;font:inherit;font-size:13px;color:#1d1d1f;cursor:pointer}",
    ".wk-user-menu button:hover{background:#f5f5f7}",
    ".wk-auth-bar{display:flex;align-items:center;height:40px;padding:0 24px;background:#000;border-bottom:1px solid rgba(255,255,255,.14)}",
    "@media (max-width:640px){.wk-card{padding:24px 18px 20px}.wk-auth-bar{padding:0 8px}}"
  ].join("\n");
  var styleEl = document.createElement("style");
  styleEl.id = "wkAuthStyle";
  styleEl.textContent = css;
  (document.head || document.documentElement).appendChild(styleEl);

  // ---------- 공통 도구 ----------
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function fmtDate(iso) {
    if (!iso) return "-";
    var d = new Date(iso);
    if (isNaN(d)) return "-";
    function p(n) { return (n < 10 ? "0" : "") + n; }
    return (d.getFullYear() % 100) + "/" + p(d.getMonth() + 1) + "/" + p(d.getDate()) + " " + p(d.getHours()) + ":" + p(d.getMinutes());
  }
  function domReady() {
    return new Promise(function (r) {
      if (document.readyState !== "loading") r();
      else document.addEventListener("DOMContentLoaded", r, { once: true });
    });
  }
  function layer() {
    var el = document.getElementById("wkAuthLayer");
    if (!el) {
      el = document.createElement("div");
      el.id = "wkAuthLayer";
      document.body.appendChild(el);
    }
    return el;
  }
  function clearLayer() { var el = document.getElementById("wkAuthLayer"); if (el) el.innerHTML = ""; }

  // 인증 API 호출 (토큰 직접 첨부, 자동 대기 없음)
  function authApi(action, method, data) {
    var headers = { "Content-Type": "application/json" };
    if (state.token) headers.Authorization = "Bearer " + state.token;
    return origFetch(API + "/api/auth?action=" + action, {
      method: method || "GET",
      headers: headers,
      cache: "no-store",
      body: data ? JSON.stringify(data) : undefined
    }).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (json) {
        if (!res.ok) {
          var err = new Error(json.error || ("요청 실패 (" + res.status + ")"));
          err.status = res.status;
          throw err;
        }
        return json;
      });
    });
  }

  // ---------- 로그인 대기 ----------
  function resetReady() {
    state.ready = new Promise(function (r) { state.resolveReady = r; });
  }
  resetReady();

  function finishLogin(user) {
    state.user = user;
    root.classList.remove("wk-auth-pending");
    clearLayer();
    renderUserMenu();
    state.resolveReady(user);
  }

  function requireLogin(message) {
    // 이미 로그인 창을 띄운 상태면 다시 만들지 않습니다.
    if (state.user || !root.classList.contains("wk-auth-pending")) {
      state.user = null;
      resetReady();
    }
    saveToken("");
    state.token = "";
    root.classList.add("wk-auth-pending");
    closeUserMenu();
    domReady().then(function () { showLogin(message); });
    return state.ready;
  }

  function afterAuth(user) {
    if (user && user.mustChange) {
      domReady().then(function () { showPassword(true); });
    } else {
      finishLogin(user);
    }
  }

  function boot() {
    if (!state.token) { requireLogin(); return; }
    authApi("me").then(function (j) { afterAuth(j.user); }).catch(function (e) {
      if (e.status === 401 || e.status === 403) requireLogin();
      else requireLogin("서버에 연결하지 못했습니다. 잠시 후 다시 시도하세요. (" + e.message + ")");
    });
  }

  // ---------- fetch 에 토큰 자동 첨부 ----------
  function urlOf(input) {
    if (typeof input === "string") return input;
    if (input && input.url) return input.url;
    return String(input || "");
  }
  function isApi(url) { return url.indexOf(API + "/api/") === 0; }
  function isPublic(url) { return url.indexOf(API + "/api/health") === 0 || url.indexOf(API + "/api/auth") === 0; }

  function withToken(input, init) {
    var opts = Object.assign({}, init || {});
    var base = opts.headers || (input && typeof input !== "string" && input.headers) || undefined;
    var h = new Headers(base);
    if (state.token) h.set("Authorization", "Bearer " + state.token);
    opts.headers = h;
    return opts;
  }

  window.fetch = function (input, init) {
    var url = urlOf(input);
    if (!isApi(url) || isPublic(url)) return origFetch(input, init);
    return state.ready.then(function () {
      return origFetch(input, withToken(input, init));
    }).then(function (res) {
      if (res.status !== 401) return res;
      // 로그인이 풀린 경우: 다시 로그인한 뒤 같은 요청을 한 번 더 보냅니다.
      return requireLogin("로그인이 만료되었습니다. 다시 로그인하세요.").then(function () {
        return origFetch(input, withToken(input, init));
      });
    });
  };

  // ---------- 로그인 화면 ----------
  function showLogin(message) {
    var el = layer();
    if (el.querySelector("#wkLoginForm")) {
      if (message) el.querySelector("#wkLoginErr").textContent = message;
      return;
    }
    el.innerHTML =
      '<div class="wk-screen" role="dialog" aria-modal="true" aria-labelledby="wkLoginTitle">' +
      '<form class="wk-card" id="wkLoginForm" autocomplete="on" novalidate>' +
      '<h2 id="wkLoginTitle">로그인</h2>' +
      '<p class="wk-sub">등록된 메일주소와 비밀번호로 로그인하세요.</p>' +
      '<label class="wk-field"><span>메일주소</span><input class="wk-input" id="wkLoginEmail" type="email" name="username" autocomplete="username" required></label>' +
      '<label class="wk-field"><span>비밀번호</span><input class="wk-input" id="wkLoginPw" type="password" name="password" autocomplete="current-password" required></label>' +
      '<div class="wk-err" id="wkLoginErr" role="alert">' + esc(message || "") + '</div>' +
      '<button class="wk-btn primary block" type="submit" id="wkLoginBtn">로그인</button>' +
      '<p class="wk-hint">계정이 없거나 비밀번호를 잊었다면 관리자에게 비밀번호 리셋을 요청하세요.</p>' +
      '</form></div>';
    var form = el.querySelector("#wkLoginForm");
    var emailEl = el.querySelector("#wkLoginEmail");
    try { emailEl.value = localStorage.getItem("works_auth_last_email") || ""; } catch (e) {}
    (emailEl.value ? el.querySelector("#wkLoginPw") : emailEl).focus();
    form.addEventListener("submit", function (ev) {
      ev.preventDefault();
      var email = emailEl.value.trim();
      var pw = el.querySelector("#wkLoginPw").value;
      var err = el.querySelector("#wkLoginErr");
      var btn = el.querySelector("#wkLoginBtn");
      if (!email || !pw) { err.textContent = "메일주소와 비밀번호를 입력하세요."; return; }
      btn.disabled = true; btn.textContent = "확인 중…"; err.textContent = "";
      authApi("login", "POST", { email: email, password: pw }).then(function (j) {
        state.token = j.token;
        saveToken(j.token);
        try { localStorage.setItem("works_auth_last_email", email); } catch (e) {}
        afterAuth(j.user);
      }).catch(function (e) {
        err.textContent = e.message;
        btn.disabled = false; btn.textContent = "로그인";
        el.querySelector("#wkLoginPw").select();
      });
    });
  }

  // ---------- 비밀번호 변경 ----------
  // forced = true: 초기 비밀번호(신규·리셋)로 로그인한 경우 — 변경해야 들어갈 수 있음
  function showPassword(forced) {
    closeUserMenu();
    var el = layer();
    el.innerHTML =
      '<div class="' + (forced ? "wk-screen" : "wk-dim") + '" role="dialog" aria-modal="true" aria-labelledby="wkPwTitle">' +
      '<form class="wk-card" id="wkPwForm" novalidate>' +
      '<h2 id="wkPwTitle">비밀번호 변경</h2>' +
      '<p class="wk-sub">' + (forced
        ? "초기 비밀번호로 로그인했습니다. 사용할 비밀번호로 변경해 주세요."
        : "새 비밀번호로 바꾸면 다른 기기의 로그인은 해제됩니다.") + '</p>' +
      '<input type="text" name="username" autocomplete="username" value="' + esc(state.user ? state.user.email : "") + '" hidden>' +
      '<label class="wk-field"><span>현재 비밀번호</span><input class="wk-input" id="wkPwCur" type="password" autocomplete="current-password"></label>' +
      '<label class="wk-field"><span>새 비밀번호</span><input class="wk-input" id="wkPwNew" type="password" autocomplete="new-password"></label>' +
      '<label class="wk-field"><span>새 비밀번호 확인</span><input class="wk-input" id="wkPwNew2" type="password" autocomplete="new-password"></label>' +
      '<p class="wk-hint" style="margin:0 0 4px">8자 이상, 영문과 숫자를 함께 사용하세요.</p>' +
      '<div class="wk-err" id="wkPwErr" role="alert"></div>' +
      '<div class="wk-row">' +
      (forced ? '<button class="wk-btn" type="button" id="wkPwLogout">로그아웃</button>' : '<button class="wk-btn" type="button" id="wkPwCancel">취소</button>') +
      '<button class="wk-btn primary" type="submit" id="wkPwSave">변경</button></div>' +
      '</form></div>';
    el.querySelector("#wkPwCur").focus();
    if (forced) {
      root.classList.add("wk-auth-pending");
      el.querySelector("#wkPwLogout").addEventListener("click", logout);
    } else {
      el.querySelector("#wkPwCancel").addEventListener("click", clearLayer);
    }
    el.querySelector("#wkPwForm").addEventListener("submit", function (ev) {
      ev.preventDefault();
      var cur = el.querySelector("#wkPwCur").value;
      var n1 = el.querySelector("#wkPwNew").value;
      var n2 = el.querySelector("#wkPwNew2").value;
      var err = el.querySelector("#wkPwErr");
      var btn = el.querySelector("#wkPwSave");
      if (!cur || !n1) { err.textContent = "비밀번호를 입력하세요."; return; }
      if (n1 !== n2) { err.textContent = "새 비밀번호가 서로 다릅니다."; return; }
      btn.disabled = true; err.textContent = "";
      authApi("password", "POST", { current: cur, next: n1 }).then(function (j) {
        state.token = j.token;
        saveToken(j.token);
        if (forced) {
          finishLogin(j.user);
        } else {
          state.user = j.user;
          clearLayer();
          renderUserMenu();
        }
        alert("비밀번호를 변경했습니다.");
      }).catch(function (e) {
        btn.disabled = false;
        if (e.status === 401) { requireLogin("로그인이 만료되었습니다. 다시 로그인하세요."); return; }
        err.textContent = e.message;
      });
    });
  }

  // ---------- 로그아웃 ----------
  function logout() {
    var done = function () {
      saveToken("");
      state.token = "";
      location.reload();
    };
    authApi("logout", "POST").then(done, done);
  }

  // ---------- 상단 사용자 메뉴 ----------
  var menuEl = null;
  function closeUserMenu() {
    if (menuEl) { menuEl.remove(); menuEl = null; }
  }
  function renderUserMenu() {
    domReady().then(function () {
      var old = document.getElementById("wkUser");
      if (old) old.remove();
      if (!state.user) return;
      var host = document.querySelector(".global-nav");
      if (!host) {
        host = document.getElementById("wkAuthBar");
        if (!host) {
          host = document.createElement("div");
          host.id = "wkAuthBar";
          host.className = "wk-auth-bar";
          document.body.insertBefore(host, document.body.firstChild);
        }
      }
      var wrap = document.createElement("div");
      wrap.className = "wk-user";
      wrap.id = "wkUser";
      wrap.innerHTML = '<button type="button" class="wk-user-btn" aria-haspopup="menu">' +
        esc(state.user.name || state.user.email) + (state.user.admin && state.user.name !== "관리자" ? " · 관리자" : "") + ' ▾</button>';
      host.appendChild(wrap);
      wrap.querySelector("button").addEventListener("click", function (ev) {
        ev.stopPropagation();
        if (menuEl) { closeUserMenu(); return; }
        var r = ev.currentTarget.getBoundingClientRect();
        menuEl = document.createElement("div");
        menuEl.className = "wk-user-menu";
        menuEl.setAttribute("role", "menu");
        menuEl.innerHTML =
          '<div class="who"><b>' + esc(state.user.name) + '</b>' + esc(state.user.email) + '</div>' +
          '<button type="button" data-act="pw" role="menuitem">비밀번호 변경</button>' +
          (state.user.admin ? '<button type="button" data-act="users" role="menuitem">사용자 관리</button>' : "") +
          '<button type="button" data-act="logout" role="menuitem">로그아웃</button>';
        document.body.appendChild(menuEl);
        var w = menuEl.offsetWidth;
        menuEl.style.top = (r.bottom + 6) + "px";
        menuEl.style.left = Math.max(8, Math.min(window.innerWidth - w - 8, r.right - w)) + "px";
        menuEl.addEventListener("click", function (e) {
          var act = e.target && e.target.getAttribute("data-act");
          if (!act) return;
          closeUserMenu();
          if (act === "pw") showPassword(false);
          if (act === "users") showUsers();
          if (act === "logout") logout();
        });
      });
    });
  }
  document.addEventListener("click", function (e) {
    if (menuEl && !menuEl.contains(e.target)) closeUserMenu();
  });
  window.addEventListener("resize", closeUserMenu);
  document.addEventListener("keydown", function (e) {
    if (e.key !== "Escape") return;
    closeUserMenu();
    var dim = document.querySelector("#wkAuthLayer .wk-dim");
    if (dim) clearLayer();
  });

  // ---------- 사용자 관리 (관리자) ----------
  function showUsers() {
    var el = layer();
    el.innerHTML =
      '<div class="wk-dim" role="dialog" aria-modal="true" aria-labelledby="wkUsersTitle">' +
      '<div class="wk-card wide">' +
      '<div class="wk-head"><h2 id="wkUsersTitle">사용자 관리</h2><button class="wk-btn" type="button" id="wkUsersClose">닫기</button></div>' +
      '<form class="wk-add" id="wkAddForm" novalidate>' +
      '<input class="wk-input" id="wkAddEmail" type="email" placeholder="메일주소">' +
      '<input class="wk-input" id="wkAddName" type="text" placeholder="이름" style="flex:0 1 160px">' +
      '<label><input type="checkbox" id="wkAddAdmin"> 관리자</label>' +
      '<button class="wk-btn primary sm" type="submit">추가</button>' +
      '</form>' +
      '<div class="wk-err" id="wkUsersMsg" role="status"></div>' +
      '<div class="wk-table-wrap"><table class="wk-table"><thead><tr>' +
      '<th>이름</th><th>메일주소</th><th>사용</th><th>관리자</th><th>비밀번호</th><th>최근 로그인</th><th></th>' +
      '</tr></thead><tbody id="wkUsersBody"><tr><td colspan="7">불러오는 중…</td></tr></tbody></table></div>' +
      '<p class="wk-hint">새로 추가하거나 비밀번호를 리셋하면 초기 비밀번호는 <b>medialog2026!</b> 입니다. 첫 로그인 때 본인이 새 비밀번호로 바꾸게 됩니다. 사용을 끄면 바로 로그아웃됩니다.</p>' +
      '</div></div>';
    el.querySelector("#wkUsersClose").addEventListener("click", clearLayer);
    var msg = el.querySelector("#wkUsersMsg");
    function say(t, ok) { msg.textContent = t || ""; msg.classList.toggle("wk-ok", !!ok); }

    function load() {
      authApi("users").then(function (j) { draw(j.users || []); }).catch(fail);
    }
    function fail(e) {
      if (e.status === 401) { requireLogin("로그인이 만료되었습니다. 다시 로그인하세요."); return; }
      say(e.message);
      load();
    }
    function draw(users) {
      var tb = el.querySelector("#wkUsersBody");
      if (!tb) return;
      users.sort(function (a, b) {
        if (!!b.admin - !!a.admin) return !!b.admin - !!a.admin;
        return String(a.name).localeCompare(String(b.name), "ko");
      });
      tb.innerHTML = users.map(function (u) {
        var self = state.user && u.email === state.user.email;
        return '<tr class="' + (u.active ? "" : "off") + '" data-email="' + esc(u.email) + '">' +
          '<td class="l"><input class="wk-input" data-f="name" value="' + esc(u.name) + '" aria-label="이름"></td>' +
          '<td class="l">' + esc(u.email) + (self ? ' <span class="wk-tag on">나</span>' : "") + '</td>' +
          '<td><label class="wk-switch" title="' + (u.active ? "사용 가능" : "사용 불가") + '"><input type="checkbox" data-f="active"' + (u.active ? " checked" : "") + (self ? " disabled" : "") + '><i></i></label> ' +
          '<span class="wk-tag ' + (u.active ? "on" : "off") + '">' + (u.active ? "가능" : "불가") + '</span></td>' +
          '<td><input type="checkbox" data-f="admin"' + (u.admin ? " checked" : "") + (self ? " disabled" : "") + ' aria-label="관리자"></td>' +
          '<td>' + (u.mustChange ? '<span class="wk-tag warn">초기 비밀번호</span>' : '<span class="wk-tag on">변경 완료</span>') + '</td>' +
          '<td>' + fmtDate(u.lastLoginAt) + '</td>' +
          '<td><button class="wk-btn sm" type="button" data-act="reset">비밀번호 리셋</button> ' +
          (self ? "" : '<button class="wk-btn sm danger" type="button" data-act="del">삭제</button>') + '</td>' +
          '</tr>';
      }).join("") || '<tr><td colspan="7">등록된 사용자가 없습니다.</td></tr>';
    }

    var tbody = el.querySelector("#wkUsersBody");
    tbody.addEventListener("change", function (e) {
      var t = e.target, tr = t.closest("tr"), f = t.getAttribute("data-f");
      if (!tr || !f) return;
      var email = tr.getAttribute("data-email");
      var patch = { email: email };
      if (f === "name") {
        if (!t.value.trim()) { say("이름을 입력하세요."); load(); return; }
        patch.name = t.value.trim();
      }
      if (f === "active") patch.active = t.checked;
      if (f === "admin") patch.admin = t.checked;
      say("저장 중…");
      authApi("users", "PATCH", patch).then(function (j) {
        say("저장했습니다: " + (j.user.name || j.user.email), true);
        load();
      }).catch(fail);
    });
    tbody.addEventListener("click", function (e) {
      var act = e.target.getAttribute && e.target.getAttribute("data-act");
      if (!act) return;
      var tr = e.target.closest("tr"), email = tr.getAttribute("data-email");
      if (act === "reset") {
        if (!confirm(email + "\n비밀번호를 초기 비밀번호(medialog2026!)로 리셋할까요?\n이 사용자의 기존 로그인은 해제됩니다.")) return;
        authApi("reset", "POST", { email: email }).then(function () {
          say(email + " 비밀번호를 medialog2026! 로 리셋했습니다.", true);
          load();
        }).catch(fail);
      }
      if (act === "del") {
        if (!confirm(email + "\n이 사용자를 삭제할까요? 되돌릴 수 없습니다.")) return;
        authApi("users", "DELETE", { email: email }).then(function () {
          say(email + " 사용자를 삭제했습니다.", true);
          load();
        }).catch(fail);
      }
    });
    el.querySelector("#wkAddForm").addEventListener("submit", function (ev) {
      ev.preventDefault();
      var email = el.querySelector("#wkAddEmail").value.trim();
      var name = el.querySelector("#wkAddName").value.trim();
      var admin = el.querySelector("#wkAddAdmin").checked;
      if (!email || !name) { say("메일주소와 이름을 입력하세요."); return; }
      authApi("users", "POST", { email: email, name: name, admin: admin }).then(function (j) {
        say(j.user.email + " 추가했습니다. 초기 비밀번호: medialog2026!", true);
        el.querySelector("#wkAddEmail").value = "";
        el.querySelector("#wkAddName").value = "";
        el.querySelector("#wkAddAdmin").checked = false;
        load();
      }).catch(function (e) { say(e.message); });
    });
    load();
  }

  // ---------- 외부에서 쓸 수 있는 함수 ----------
  window.WorksAuth = {
    ready: function () { return state.ready; },
    user: function () { return state.user; },
    token: function () { return state.token; },
    logout: logout
  };

  boot();
})();
