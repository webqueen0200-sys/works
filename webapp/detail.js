// ============================================================
// detail.js — 업무상세내역 (detail.html)
// - 로그인 사용자별로 본인 업무만 입력 · 조회 (서버가 사용자별로 분리 저장)
// - 관리자: 대시보드, 전체 엑셀 다운로드, 담당자 · 분류 · 기준 설정, 탭 삭제
// - 서버: works-beige API 를 ?ns=detail 로 호출 (api/_detail.js 참고)
// ============================================================
(function () {
  "use strict";

  const NS = "detail";
  const DAY_LIMIT = 480;                       // 하루 기준 처리시간(분)
  const TITLE_MAX = 300;
  const ROLES = ["기획", "디자인", "퍼블", "GA"];
  const UNASSIGNED = "미지정";
  const MM_H = (typeof MM_HOURS !== "undefined" && MM_HOURS) || 160;   // 1 MM = 160H (업무관리와 동일)
  const DEFAULT_ASSIGNEES = { 기획: ["기획2", "기획3", "기획4"], 디자인: ["디자인1", "디자인2", "디자인3"], 퍼블: ["퍼블1", "퍼블2", "퍼블3"], GA: ["GA1", "GA2"] };
  const DEFAULT_TARGET = { 기획: 2, 디자인: 2, 퍼블: 3, GA: 1 };
  const CSV_HEADERS = ["월", "업무명", "완료처리자", "처리일", "처리소요시간(분)", "처리건수", "대분류", "중분류", "소분류"];
  const CSV_KEYS = ["month", "title", "worker", "date", "minutes", "count", "major", "minor", "sub"];

  // ---------- 분류 기본값 (관리자가 분류 설정에서 변경 가능) ----------
  const DEFAULT_CATEGORY_ROWS = [
    ["기타", "휴가", "연차/반차/반반차"],
    ["기타", "스마트워킹데이", "매월 2,3주 수요일 스마트워킹데이"],
    ["기타", "총괄_관리", "현장대리인 업무"],
    ["기타", "계약업무", "계약업무 대응 및 지원"],
    ["기타", "업무보고", "주간/월간/ 업무 진행상황 및 지표 보고"],
    ["기타", "업무교육", "직무교육 / 업무교육 / 인수인계 등"],
    ["기타", "업무미팅", "업무수행관련 대내외 회의"],
    ["Web서비스 기획", "기획_개발문의지원", "개발 문의사항 확인 답변"],
    ["Web서비스 기획", "기획_사업문의지원", "사업 문의사항 확인 답변"],
    ["Web서비스 기획", "운영이슈_검토/제안", "신규/개선 요구사항에 대한 영향도 검토 및 제안"],
    ["Web서비스 기획", "벤치마킹_시장동향조사", "홈페이지  트렌드 조사"],
    ["Web서비스 기획", "Web서비스 기획", "신규/개선 기능 기능정의서 작성"],
    ["Web서비스 기획", "UI개선 기획서 작성", "신규/개선 UI 기획서 작성"],
    ["Web서비스 기획", "컨텐츠 기획서 작성", "컨텐츠 신규제작, 수정사항 기획서 작성"],
    ["Web서비스 기획", "체크리스트 작성", "신규/개선 기능 반영 시 검수를 위한 체크리스트 작성"],
    ["Web서비스 기획", "프로젝트진행지원", "SI 프로젝트 진행 시 문의사항 대응"],
    ["Web서비스 기획", "웹접근성", "웹접근성 인증 심사 대응"],
    ["Web서비스 운영", "반영 검수", "신규/개선 기능 반영 전/후 테스트"],
    ["Web서비스 운영", "BO 반영", "게시물 등 BO 직접 등록"],
    ["Web서비스 운영", "모니터링", "정기/비정기 모니터링"],
    ["프로모션 운영", "프로모션 및 내/외부 배너 기획", "팝업, 배너 등 프로모션 제작물 기획서 작성"],
    ["프로모션 운영", "프로모션 반영 및 검수", "팝업, 배너 등 프로모션 제작물 반영 전/후 테스트"],
    ["데이터분석", "데이터 수집/관리/분석", "GA4 기반 데이터 수집 관리 검증 및 성과 분석 보고 지원"],
    ["데이터분석", "대시보드 구축/운영", "루커스튜디오 기반 대시보드 구축 유지보수 지원"],
    ["디자인", "UI 개선 디자인", "UI 개선 페이지 디자인"],
    ["디자인", "컨텐츠 디자인", "컨텐츠 페이지 디자인"],
    ["디자인", "프로모션 디자인", "프로모션 페이지 디자인"],
    ["디자인", "배너 디자인", "내/외부 채널 배너 제작"],
    ["디자인", "퍼블리싱 검수", "퍼블리싱 페이지 디자인 검수"],
    ["디자인", "웹접근성", "웹접근성 인증 심사 대응"],
    ["퍼블리싱", "UI 개선 퍼블리싱", "UI 개선 페이지 html 제작"],
    ["퍼블리싱", "컨텐츠 퍼블리싱", "컨텐츠 페이지 html 제작"],
    ["퍼블리싱", "프로모션 퍼블리싱", "프로모션 페이지 html 제작"],
    ["퍼블리싱", "검수", "신규/개선 기능 반영 전/후 테스트"],
    ["퍼블리싱", "반영", "정기/비정기 반영 및 배포 진행"],
    ["퍼블리싱", "웹접근성", "웹접근성 인증 심사 대응"],
    ["퍼블리싱", "퍼블_개발문의지원", "개발 문의사항 확인 답변"]
  ];
  const subKey = (major, minor) => `${major}|${minor}`;
  function defaultCategories() {
    const c = { majors: [], minors: {}, subs: {} };
    DEFAULT_CATEGORY_ROWS.forEach(([ma, mi, su]) => {
      if (!c.minors[ma]) { c.majors.push(ma); c.minors[ma] = []; }
      if (!c.minors[ma].includes(mi)) c.minors[ma].push(mi);
      (c.subs[subKey(ma, mi)] = c.subs[subKey(ma, mi)] || []).push(su);
    });
    return c;
  }

  // ---------- 상태 ----------
  const S = {
    user: null, isAdmin: false,
    tabs: [], tab: null,
    own: {},                  // { 탭명: [업무] } — 본인 데이터 (모든 탭)
    all: null,                // { 탭명: [업무] } — 관리자 전체 데이터 (필요할 때 불러옴)
    users: {},                // 메일 → 이름 (관리자)
    assignees: JSON.parse(JSON.stringify(DEFAULT_ASSIGNEES)),
    cats: defaultCategories(),
    favs: [],
    settingsCache: {},
    view: "entry",
    search: null,             // { start, end } — 업무 목록 기간 조회 중
    editing: null,            // { id, tab }
    selected: new Set()
  };

  // ---------- 공통 유틸 ----------
  const $ = (id) => document.getElementById(id);
  const pad = (n) => String(n).padStart(2, "0");
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const uid = () => (crypto.randomUUID ? crypto.randomUUID() : "d_" + Date.now() + "_" + Math.random().toString(16).slice(2));
  const num = (v) => { const n = parseFloat(v); return isNaN(n) ? 0 : n; };
  const fmt2 = (v) => num(v).toFixed(2);
  const fmtH = (min) => { const h = min / 60; return Number.isInteger(h) ? String(h) : h.toFixed(1); };
  const toMM = (min) => min / 60 / MM_H;

  function nowMonth() { const d = new Date(); return `${d.getFullYear()}.${pad(d.getMonth() + 1)}`; }
  function today() { const d = new Date(); return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())}`; }
  function addMonths(ym, n) {
    const [y, m] = ym.split(".").map(Number);
    const d = new Date(y, m - 1 + n, 1);
    return `${d.getFullYear()}.${pad(d.getMonth() + 1)}`;
  }
  function monthsBetween(a, b) {
    const out = []; let cur = a;
    while (cur <= b && out.length < 120) { out.push(cur); cur = addMonths(cur, 1); }
    return out;
  }
  // "2026.11" "2026-11" "202611" "2026.1" → "2026.11"
  function parseMonth(text) {
    const s = String(text || "").trim();
    let m = /^(\d{4})[.\-/년\s]*(\d{1,2})월?$/.exec(s);
    if (!m) return null;
    const mo = +m[2];
    if (mo < 1 || mo > 12) return null;
    return `${m[1]}.${pad(mo)}`;
  }
  // "2026.11.06" "2026-11-06" "20261106" "11/06" "11.6" → "2026.11.06"
  function parseDate(text, baseYear) {
    const s = String(text || "").trim();
    let y, mo, d, m;
    if ((m = /^(\d{4})[.\-/\s]*(\d{1,2})[.\-/\s]*(\d{1,2})\.?$/.exec(s))) { y = +m[1]; mo = +m[2]; d = +m[3]; }
    else if ((m = /^(\d{1,2})[.\-/](\d{1,2})\.?$/.exec(s))) { y = baseYear || new Date().getFullYear(); mo = +m[1]; d = +m[2]; }
    else return null;
    const dt = new Date(y, mo - 1, d);
    if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== d) return null;
    return `${y}.${pad(mo)}.${pad(d)}`;
  }
  const dotToIso = (s) => (s || "").replace(/\./g, "-");
  const isoToDot = (s) => (s || "").replace(/-/g, ".");

  function roleOf(name) {
    const n = String(name || "").trim();
    for (const r of ROLES) if ((S.assignees[r] || []).includes(n)) return r;
    return UNASSIGNED;
  }
  function workerOrder(name) {
    const r = roleOf(name);
    const ri = r === UNASSIGNED ? ROLES.length : ROLES.indexOf(r);
    const ai = r === UNASSIGNED ? 0 : S.assignees[r].indexOf(name);
    return ri * 1000 + ai;
  }
  function sortWorkers(names) {
    return [...names].sort((a, b) => workerOrder(a) - workerOrder(b) || a.localeCompare(b, "ko"));
  }

  // ---------- 서버 호출 ----------
  function withNs(path) { return path + (path.includes("?") ? "&" : "?") + "ns=" + NS; }
  async function api(path, opts, raw) {
    const o = Object.assign({ cache: "no-store" }, opts || {});
    if (o.body && typeof o.body !== "string") { o.body = JSON.stringify(o.body); o.headers = { "Content-Type": "application/json" }; }
    const res = await fetch(API_BASE + (raw ? path : withNs(path)), o);
    let body = {};
    try { body = await res.json(); } catch (e) { /* 무시 */ }
    if (!res.ok) throw new Error(`${res.status} ${body.error || res.statusText || ""}`.trim());
    return body;
  }

  function setSaveStatus(kind, text) {
    const el = $("saveStatus");
    el.className = "save-status" + (kind ? " save-" + kind : "");
    el.textContent = text || "";
    el.onclick = kind === "error" ? () => alert(el.title || text) : null;
  }
  function savedNow() { const d = new Date(); setSaveStatus("ok", `저장됨 ${pad(d.getHours())}:${pad(d.getMinutes())}`); }

  // 탭별 본인 목록 저장 (같은 탭 저장은 순서대로 처리)
  const putChain = {};
  function putOwn(tab, user) {
    const run = async () => {
      setSaveStatus("saving", "저장 중…");
      try {
        const body = { month: tab, tasks: S.own[tab] || [] };
        const r = await api("/api/tasks", { method: "PUT", body });
        S.own[tab] = r.tasks || [];
        S.all = null;           // 관리자 집계는 다시 불러오도록
        savedNow();
      } catch (e) {
        setSaveStatus("error", "저장 실패 (클릭)");
        $("saveStatus").title = e.message;
        throw e;
      }
    };
    putChain[tab] = (putChain[tab] || Promise.resolve()).catch(() => {}).then(run);
    return putChain[tab];
  }

  async function loadOwnTab(tab) {
    const r = await api(`/api/tasks?month=${encodeURIComponent(tab)}`);
    S.own[tab] = r.tasks || [];
  }
  async function loadOwnAll() { await Promise.all(S.tabs.map(loadOwnTab)); }

  async function loadAllData(force) {
    if (!S.isAdmin) return null;
    if (S.all && !force) return S.all;
    const out = {};
    await Promise.all(S.tabs.map(async (tab) => {
      const r = await api(`/api/tasks?month=${encodeURIComponent(tab)}&scope=all`);
      out[tab] = r.tasks || [];
    }));
    try {
      // auth API 는 auth.js 가 토큰을 자동으로 붙이지 않으므로 직접 붙입니다.
      const tk = window.WorksAuth && window.WorksAuth.token();
      const u = await api("/api/auth?action=users", tk ? { headers: { Authorization: "Bearer " + tk } } : null, true);
      S.users = {}; (u.users || []).forEach((x) => { S.users[x.email] = x.name || x.email; });
    } catch (e) { /* 이름 없이 메일로 표시 */ }
    S.all = out;
    return out;
  }

  async function getSettings(month) {
    if (S.settingsCache[month]) return S.settingsCache[month];
    let s = null;
    try { s = (await api(`/api/settings?month=${encodeURIComponent(month)}`)).settings; } catch (e) { s = null; }
    const target = Object.assign({}, DEFAULT_TARGET, (s && s.targetMM) || {});
    S.settingsCache[month] = { targetMM: target, workDays: (s && s.workDays) || 20 };
    return S.settingsCache[month];
  }

  // ---------- 초기화 ----------
  async function init() {
    const user = window.WorksAuth ? await window.WorksAuth.ready() : null;
    S.user = user || { name: "", email: "" };
    S.isAdmin = !!(user && user.admin);
    document.body.classList.toggle("is-admin", S.isAdmin);
    bindControls();
    resetForm();
    setSaveStatus("saving", "불러오는 중…");

    try {
      const [months, asg, cat, fav] = await Promise.all([
        api("/api/months"),
        api("/api/assignees").catch(() => null),
        api("/api/categories").catch(() => null),
        api("/api/settings?month=favorites").catch(() => null)
      ]);
      S.tabs = (months.months || []).filter(Boolean);
      // 담당자: 이 화면에서 저장한 적이 없으면 업무관리에 등록된 담당자를 그대로 사용
      let asgVal = asg && asg.stored ? asg.assignees : null;
      if (!asgVal) { try { asgVal = (await api("/api/assignees", null, true)).assignees; } catch (e) { asgVal = null; } }
      if (asgVal) ROLES.forEach((r) => { if (Array.isArray(asgVal[r])) S.assignees[r] = asgVal[r].slice(); });
      if (cat && cat.stored && cat.categories && Array.isArray(cat.categories.majors)) S.cats = normCats(cat.categories);
      S.favs = (fav && fav.settings && Array.isArray(fav.settings.items)) ? fav.settings.items : [];

      if (!S.tabs.length) {
        S.tabs = [`세부업무_${new Date().getMonth() + 1}월`];
        await api("/api/months", { method: "POST", body: { months: S.tabs } });
      }
      const cur = `_${new Date().getMonth() + 1}월`;
      S.tab = S.tabs.find((t) => t.endsWith(cur)) || S.tabs[S.tabs.length - 1];
      await loadOwnAll();
      setSaveStatus("", "");
    } catch (e) {
      console.error(e);
      setSaveStatus("error", "불러오기 실패 (클릭)");
      $("saveStatus").title = e.message;
      if (!S.tabs.length) S.tabs = [`세부업무_${new Date().getMonth() + 1}월`];
      if (!S.tab) S.tab = S.tabs[S.tabs.length - 1];
    }
    fillWorkerList();
    fillMajor();
    renderFavs();
    buildPeriodSelects();
    renderTabs();
    renderAll();
  }

  function normCats(c) {
    const out = { majors: [...c.majors], minors: {}, subs: {} };
    out.majors.forEach((m) => { out.minors[m] = Array.isArray(c.minors && c.minors[m]) ? [...c.minors[m]] : []; });
    Object.entries(c.subs || {}).forEach(([k, v]) => { out.subs[k] = Array.isArray(v) ? [...v] : []; });
    return out;
  }

  // ---------- 탭 ----------
  function renderTabs() {
    const wrap = $("monthTabs");
    wrap.innerHTML = "";
    S.tabs.forEach((t) => {
      const w = document.createElement("span");
      w.className = "month-tab-wrap";
      const b = document.createElement("button");
      b.className = "month-tab" + (t === S.tab && !S.search ? " active" : "");
      b.textContent = t;
      b.onclick = () => switchTab(t);
      w.appendChild(b);
      if (S.isAdmin) {
        const d = document.createElement("button");
        d.className = "month-tab-del";
        d.textContent = "✕";
        d.title = "이 탭 삭제 (관리자)";
        d.onclick = (e) => { e.stopPropagation(); deleteTab(t); };
        w.appendChild(d);
      }
      wrap.appendChild(w);
    });
    const add = document.createElement("button");
    add.className = "month-tab add";
    add.textContent = "+ 새 월 시트";
    add.onclick = openTabModal;
    wrap.appendChild(add);
    const sp = document.createElement("span");
    sp.className = "month-tabs-spacer";
    wrap.appendChild(sp);
    if (S.isAdmin) {
      const a = document.createElement("button");
      a.className = "month-tab assignee-settings-btn";
      a.textContent = "담당자 설정";
      a.onclick = openAssigneeSettings;
      wrap.appendChild(a);
    }
  }

  function switchTab(t) {
    S.tab = t;
    S.search = null;
    S.selected.clear();
    if (S.editing && S.editing.tab !== t) cancelEdit();
    renderTabs();
    if (S.view !== "entry") setView("entry"); else renderAll();
  }

  function suggestTabName() {
    const m = new Date().getMonth() + 1;
    let n = m;
    for (let i = 0; i < 12 && S.tabs.includes(`세부업무_${n}월`); i++) n = n % 12 + 1;
    return `세부업무_${n}월`;
  }

  function openTabModal() {
    const modal = $("tabModal");
    const inp = $("tabNameInput");
    inp.value = suggestTabName();
    $("tabModalMsg").textContent = "";
    modal.style.display = "flex";
    setTimeout(() => { inp.focus(); inp.select(); }, 30);
    const close = () => { modal.style.display = "none"; };
    $("btnTabClose").onclick = close;
    const save = async () => {
      const name = inp.value.trim();
      if (!name) { $("tabModalMsg").textContent = "탭 이름을 입력하세요."; return; }
      if (S.tabs.includes(name)) { $("tabModalMsg").textContent = "이미 있는 탭 이름입니다."; return; }
      $("btnTabSave").disabled = true;
      try {
        const next = [...S.tabs, name];
        await api("/api/months", { method: "POST", body: { months: next } });
        S.tabs = next;
        S.own[name] = [];
        if (S.all) S.all[name] = [];
        close();
        switchTab(name);
      } catch (e) {
        $("tabModalMsg").textContent = "저장하지 못했습니다. " + e.message;
      } finally { $("btnTabSave").disabled = false; }
    };
    $("btnTabSave").onclick = save;
    inp.onkeydown = (e) => { if (e.key === "Enter") save(); if (e.key === "Escape") close(); };
  }

  // 빨간 글씨 확인창 (예 → resolve(true))
  function confirmDanger(title, text) {
    return new Promise((resolve) => {
      const modal = $("confirmModal");
      $("confirmTitle").textContent = title || "삭제";
      $("confirmText").textContent = text || "삭제하면 복구할 수 없습니다. 삭제하시겠습니까?";
      modal.style.display = "flex";
      const done = (v) => { modal.style.display = "none"; document.removeEventListener("keydown", onKey); resolve(v); };
      const onKey = (e) => { if (e.key === "Escape") done(false); };
      document.addEventListener("keydown", onKey);
      $("btnConfirmYes").onclick = () => done(true);
      $("btnConfirmNo").onclick = () => done(false);
      $("btnConfirmNo").focus();
    });
  }

  async function deleteTab(tab) {
    if (!S.isAdmin) return;
    const ok = await confirmDanger(`'${tab}' 탭 삭제`, "삭제하면 복구할 수 없습니다. 삭제하시겠습니까?");
    if (!ok) return;
    try {
      setSaveStatus("saving", "삭제 중…");
      await api(`/api/tasks?month=${encodeURIComponent(tab)}`, { method: "DELETE" });
      let next = S.tabs.filter((t) => t !== tab);
      if (!next.length) next = [`세부업무_${new Date().getMonth() + 1}월`];
      await api("/api/months", { method: "POST", body: { months: next } });
      S.tabs = next;
      delete S.own[tab];
      if (S.all) delete S.all[tab];
      next.forEach((t) => { if (!S.own[t]) S.own[t] = []; });
      savedNow();
      if (S.editing && S.editing.tab === tab) cancelEdit();
      switchTab(S.tab === tab ? next[next.length - 1] : S.tab);
    } catch (e) {
      setSaveStatus("error", "삭제 실패 (클릭)");
      $("saveStatus").title = e.message;
      alert("탭을 삭제하지 못했습니다.\n" + e.message);
    }
  }

  // ---------- 화면 전환 ----------
  function setView(v) {
    if (v === "dashboard" && !S.isAdmin) v = "entry";
    S.view = v;
    $("entryPanel").style.display = v === "entry" ? "" : "none";
    $("summaryPanel").style.display = v === "summary" ? "" : "none";
    $("dashboardPanel").style.display = v === "dashboard" ? "" : "none";
    $("btnEntryView").classList.toggle("active", v === "entry");
    $("btnSummaryView").classList.toggle("active", v === "summary");
    $("btnDashboardView").classList.toggle("active", v === "dashboard");
    renderAll();
  }
  function renderAll() {
    if (S.view === "entry") { renderEntryMeta(); renderList(); updateDayMeter(); }
    if (S.view === "summary") renderSummary();
    if (S.view === "dashboard") renderDashboard();
  }

  // ---------- 조회 기간 ----------
  function monthOptions() {
    const set = new Set();
    const cur = nowMonth();
    monthsBetween(addMonths(cur, -12), addMonths(cur, 2)).forEach((m) => set.add(m));
    Object.values(S.own).forEach((list) => list.forEach((t) => { if (parseMonth(t.month)) set.add(t.month); }));
    return [...set].sort();
  }
  function fillMonthSelect(sel, value) {
    const opts = monthOptions();
    if (value && !opts.includes(value)) { opts.push(value); opts.sort(); }
    sel.innerHTML = opts.map((m) => `<option value="${m}">${m}</option>`).join("");
    sel.value = value;
  }
  function buildPeriodSelects() {
    const cur = nowMonth();
    fillMonthSelect($("periodStart"), $("periodStart").value || addMonths(cur, -2));
    fillMonthSelect($("periodEnd"), $("periodEnd").value || cur);
  }
  function period() {
    let a = $("periodStart").value, b = $("periodEnd").value;
    if (a > b) { [a, b] = [b, a]; $("periodStart").value = a; $("periodEnd").value = b; }
    return { start: a, end: b };
  }
  function runSearch() {
    const p = period();
    if (S.view === "entry") {
      S.search = p;
      S.selected.clear();
      renderTabs();
      renderList();
    } else renderAll();
  }
  function clearSearch() { S.search = null; S.selected.clear(); renderTabs(); renderList(); }

  // ---------- 입력 폼 ----------
  function fillWorkerList() {
    $("workerList").innerHTML = ROLES.flatMap((r) => S.assignees[r] || []).map((n) => `<option value="${esc(n)}"></option>`).join("");
  }
  function fillSelect(sel, items, value, placeholder) {
    const list = [...items];
    if (value && !list.includes(value)) list.push(value); // 분류가 바뀌었어도 기존 값은 유지
    sel.innerHTML = `<option value="">${placeholder}</option>` + list.map((v) => `<option value="${esc(v)}">${esc(v)}</option>`).join("");
    sel.value = value || "";
  }
  function fillMajor(value, minor, sub) {
    fillSelect($("fMajor"), S.cats.majors, value || "", "대분류 선택");
    fillMinor(minor, sub);
  }
  function fillMinor(value, sub) {
    const ma = $("fMajor").value;
    fillSelect($("fMinor"), ma ? (S.cats.minors[ma] || []) : [], value || "", ma ? "중분류 선택" : "대분류 먼저 선택");
    fillSub(sub);
  }
  function fillSub(value) {
    const ma = $("fMajor").value, mi = $("fMinor").value;
    const subs = ma && mi ? (S.cats.subs[subKey(ma, mi)] || []) : [];
    fillSelect($("fSub"), subs, value || "", mi ? (subs.length ? "소분류 선택" : "소분류 없음") : "중분류 먼저 선택");
    if (!value && subs.length === 1) $("fSub").value = subs[0];   // 하나뿐이면 자동 선택
    updateFavToggle();
  }
  function setCategory(ma, mi, su) { fillMajor(ma, mi, su); }

  function resetForm(keep) {
    $("fMonth").value = keep ? $("fMonth").value || nowMonth() : nowMonth();
    $("fWorker").value = keep ? $("fWorker").value : (S.user && S.user.name) || "";
    $("fDate").value = keep ? $("fDate").value || today() : today();
    $("fMinutes").value = "";
    $("fTitle").value = "";
    if (!keep) fillMajor();
    ["fMonth", "fDate", "fMinutes", "fTitle", "fWorker"].forEach((id) => $(id).classList.remove("is-invalid"));
    updateCounter();
    updateDayMeter();
  }

  function renderEntryMeta() {
    $("entryTabLabel").textContent = S.editing ? `저장 위치: ${S.editing.tab}` : `저장 위치: ${S.tab}`;
  }

  function updateCounter() {
    const n = $("fTitle").value.length;
    const c = $("titleCounter");
    c.textContent = `${n}/${TITLE_MAX}`;
    c.classList.toggle("is-full", n >= TITLE_MAX);
  }

  // 처리일 기준 같은 날짜에 입력한 처리소요시간 합계 (본인 · 모든 탭)
  function minutesOnDate(date, excludeId) {
    let sum = 0;
    Object.values(S.own).forEach((list) => list.forEach((t) => {
      if (t.date === date && t.id !== excludeId) sum += num(t.minutes);
    }));
    return sum;
  }
  function updateDayMeter() {
    const date = parseDate($("fDate").value);
    const base = date ? minutesOnDate(date, S.editing && S.editing.id) : 0;
    const total = base + (parseInt($("fMinutes").value, 10) || 0);
    $("dayMeterText").textContent = `${total}분/${DAY_LIMIT}분`;
    $("dayMeterFill").style.width = Math.min(100, total / DAY_LIMIT * 100) + "%";
    const m = $("dayMeter");
    m.classList.toggle("is-over", total > DAY_LIMIT);
    m.classList.toggle("is-full", total === DAY_LIMIT);
    m.title = date ? `${date} 입력 합계 ${base}분 + 현재 입력 ${total - base}분` : "처리일을 입력하면 같은 날짜의 합계가 표시됩니다.";
  }

  function msg(text, isErr) {
    const el = $("entryMsg");
    el.textContent = text || "";
    el.classList.toggle("is-err", !!isErr);
    if (text && !isErr) setTimeout(() => { if (el.textContent === text) el.textContent = ""; }, 3000);
  }

  function readForm() {
    const errs = [];
    const mark = (id, bad) => $(id).classList.toggle("is-invalid", !!bad);
    const month = parseMonth($("fMonth").value);
    mark("fMonth", !month); if (!month) errs.push("월(YYYY.MM)");
    const title = $("fTitle").value.trim();
    mark("fTitle", !title); if (!title) errs.push("업무명");
    const worker = $("fWorker").value.trim();
    mark("fWorker", !worker); if (!worker) errs.push("완료처리자");
    const date = parseDate($("fDate").value);
    mark("fDate", !date); if (!date) errs.push("처리일(YYYY.MM.DD)");
    const minRaw = $("fMinutes").value.trim();
    const minutes = parseInt(minRaw, 10);
    const minBad = !/^\d{1,4}$/.test(minRaw) || minutes <= 0;
    mark("fMinutes", minBad); if (minBad) errs.push("처리소요시간(분)");
    const major = $("fMajor").value, minor = $("fMinor").value, sub = $("fSub").value;
    if (!major || !minor) errs.push("대분류 · 중분류");
    if (month) $("fMonth").value = month;
    if (date) $("fDate").value = date;
    return { errs, rec: { month, title: title.slice(0, TITLE_MAX), worker, date, minutes, count: 1, major, minor, sub } };
  }

  async function saveEntry() {
    const { errs, rec } = readForm();
    if (errs.length) { msg(`입력값을 확인하세요: ${errs.join(", ")}`, true); return; }
    const editing = S.editing;
    const dayTotal = minutesOnDate(rec.date, editing && editing.id) + rec.minutes;
    if (dayTotal > DAY_LIMIT && !confirm(`${rec.date} 처리소요시간 합계가 ${dayTotal}분으로 ${DAY_LIMIT}분을 넘습니다.\n그래도 저장할까요?`)) return;

    const btn = $("btnEntrySave");
    btn.disabled = true;
    const now = new Date().toISOString();
    let tab, backup;
    try {
      if (editing) {
        tab = editing.tab;
        const list = S.own[tab] || [];
        const i = list.findIndex((t) => t.id === editing.id);
        if (i < 0) throw new Error("수정할 업무를 찾지 못했습니다. 새로고침 후 다시 시도하세요.");
        backup = list.slice();
        list[i] = Object.assign({}, list[i], rec, { updatedAt: now });
      } else {
        tab = S.tab;
        S.own[tab] = S.own[tab] || [];
        backup = S.own[tab].slice();
        S.own[tab].push(Object.assign({ id: uid(), createdAt: now, updatedAt: now }, rec));
      }
      await putOwn(tab);
      msg(editing ? "수정했습니다." : "저장했습니다. 목록에 추가되었습니다.");
      if (editing) { S.editing = null; setEditUi(false); resetForm(true); }
      else resetForm(true);
      buildPeriodSelects();
      renderList();
      renderEntryMeta();
      $("fTitle").focus();
    } catch (e) {
      if (tab && backup) S.own[tab] = backup;
      msg("저장하지 못했습니다. " + e.message, true);
      renderList();
    } finally { btn.disabled = false; }
  }

  function setEditUi(on) {
    $("entryCard").classList.toggle("is-editing", on);
    $("entryEditBadge").style.display = on ? "" : "none";
    $("btnEntryCancel").style.display = on ? "" : "none";
    $("btnEntryReset").style.display = on ? "none" : "";
    $("btnEntrySave").textContent = on ? "수정 저장" : "저장";
    $("entryTitle").textContent = on ? "업무 수정" : "업무 입력";
    renderEntryMeta();
  }
  function startEdit(tab, id) {
    const t = (S.own[tab] || []).find((x) => x.id === id);
    if (!t) return;
    S.editing = { tab, id };
    $("fMonth").value = t.month || "";
    $("fTitle").value = t.title || "";
    $("fWorker").value = t.worker || "";
    $("fDate").value = t.date || "";
    $("fMinutes").value = t.minutes || "";
    setCategory(t.major, t.minor, t.sub);
    updateCounter();
    setEditUi(true);
    updateDayMeter();
    renderList();
    $("entryCard").scrollIntoView({ behavior: "smooth", block: "start" });
    $("fTitle").focus();
  }
  function cancelEdit() {
    S.editing = null;
    setEditUi(false);
    resetForm(true);
    renderList();
  }

  // ---------- 즐겨찾기 ----------
  const favId = (f) => `${f.major}|${f.minor}|${f.sub || ""}`;
  function currentCat() { return { major: $("fMajor").value, minor: $("fMinor").value, sub: $("fSub").value }; }
  function renderFavs() {
    const box = $("favChips");
    if (!S.favs.length) {
      box.innerHTML = `<span class="fav-empty">분류를 선택하고 ‘☆ 즐겨찾기 추가’를 누르면 여기에 표시됩니다. 한 번 클릭으로 대·중·소분류가 선택됩니다.</span>`;
      return;
    }
    const cur = favId(currentCat());
    box.innerHTML = S.favs.map((f, i) => `
      <span class="fav-chip${favId(f) === cur ? " is-on" : ""}" data-i="${i}" title="${esc(f.major)} › ${esc(f.minor)}${f.sub ? " › " + esc(f.sub) : ""}" role="button" tabindex="0">
        <span class="fav-major">${esc(f.major)}</span>${esc(f.minor)}
        <button type="button" class="fav-x" data-x="${i}" title="즐겨찾기에서 삭제" aria-label="즐겨찾기에서 삭제">✕</button>
      </span>`).join("");
    box.querySelectorAll(".fav-chip").forEach((chip) => {
      const pick = () => { const f = S.favs[+chip.dataset.i]; setCategory(f.major, f.minor, f.sub); renderFavs(); };
      chip.onclick = (e) => { if (e.target.closest(".fav-x")) return; pick(); };
      chip.onkeydown = (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pick(); } };
    });
    box.querySelectorAll(".fav-x").forEach((x) => {
      x.onclick = (e) => { e.stopPropagation(); S.favs.splice(+x.dataset.x, 1); saveFavs(); };
    });
  }
  function updateFavToggle() {
    const c = currentCat();
    const btn = $("btnFavToggle");
    const on = S.favs.some((f) => favId(f) === favId(c));
    btn.disabled = !(c.major && c.minor);
    btn.classList.toggle("is-on", on);
    btn.textContent = on ? "★ 즐겨찾기 해제" : "☆ 즐겨찾기 추가";
    if ($("favChips").children.length) renderFavs();
  }
  function toggleFav() {
    const c = currentCat();
    if (!c.major || !c.minor) return;
    const i = S.favs.findIndex((f) => favId(f) === favId(c));
    if (i >= 0) S.favs.splice(i, 1);
    else {
      if (S.favs.length >= 30) { msg("즐겨찾기는 30개까지 등록할 수 있습니다.", true); return; }
      S.favs.push(c);
    }
    saveFavs();
  }
  async function saveFavs() {
    renderFavs();
    updateFavToggle();
    try { await api("/api/settings", { method: "PUT", body: { month: "favorites", settings: { items: S.favs } } }); }
    catch (e) { msg("즐겨찾기를 저장하지 못했습니다. " + e.message, true); }
  }

  // ---------- 업무 목록 ----------
  function listRecords() {
    let rows;
    if (S.search) {
      rows = [];
      S.tabs.forEach((tab) => (S.own[tab] || []).forEach((t) => {
        if (t.month >= S.search.start && t.month <= S.search.end) rows.push({ t, tab });
      }));
    } else rows = (S.own[S.tab] || []).map((t) => ({ t, tab: S.tab }));
    rows.sort((a, b) => (b.t.date || "").localeCompare(a.t.date || "") || (b.t.createdAt || "").localeCompare(a.t.createdAt || ""));
    return rows;
  }
  const rowKey = (tab, id) => `${tab}\u0001${id}`;

  function renderList() {
    const rows = listRecords();
    const table = $("listTable");
    table.classList.toggle("is-search", !!S.search);
    $("listTitle").textContent = S.search ? "업무 목록 · 기간 조회" : `업무 목록 · ${S.tab}`;
    const chip = $("listSearchChip");
    if (S.search) {
      chip.style.display = "";
      chip.innerHTML = `${S.search.start} ~ ${S.search.end} (모든 탭) <button type="button" id="btnClearSearch">해제</button>`;
      $("btnClearSearch").onclick = clearSearch;
    } else chip.style.display = "none";

    // 화면에 없는 선택은 정리
    const keys = new Set(rows.map((r) => rowKey(r.tab, r.t.id)));
    [...S.selected].forEach((k) => { if (!keys.has(k)) S.selected.delete(k); });

    const totalMin = rows.reduce((a, r) => a + num(r.t.minutes), 0);
    $("listCount").textContent = `${rows.length}건 · ${totalMin}분 (${fmtH(totalMin)}H)`;
    const body = $("listBody");
    if (!rows.length) {
      body.innerHTML = `<tr class="list-empty"><td colspan="13">${S.search ? "조회 기간에 입력한 업무가 없습니다." : "아직 입력한 업무가 없습니다. 위에서 입력하고 저장하세요."}</td></tr>`;
    } else {
      body.innerHTML = rows.map((r, i) => {
        const t = r.t, k = rowKey(r.tab, t.id);
        const editing = S.editing && S.editing.id === t.id && S.editing.tab === r.tab;
        return `<tr data-k="${esc(k)}" class="${S.selected.has(k) ? "is-selected" : ""}${editing ? " is-editing" : ""}">
          <td class="c-chk"><input type="checkbox" class="row-chk" ${S.selected.has(k) ? "checked" : ""} aria-label="선택" /></td>
          <td class="c-no">${i + 1}</td>
          <td class="c-tab search-only">${esc(r.tab)}</td>
          <td>${esc(t.month)}</td>
          <td class="c-title">${esc(t.title)}</td>
          <td>${esc(t.worker)}</td>
          <td>${esc(t.date)}</td>
          <td>${num(t.minutes)}</td>
          <td>${t.count || 1}</td>
          <td>${esc(t.major)}</td>
          <td>${esc(t.minor)}</td>
          <td class="c-sub">${esc(t.sub)}</td>
          <td class="c-act"><button type="button" class="row-edit">수정</button></td>
        </tr>`;
      }).join("") +
      `<tr class="list-foot"><td></td><td colspan="${S.search ? 6 : 5}" class="c-title">합계</td><td>${totalMin}</td><td>${rows.length}</td><td colspan="4"></td></tr>`;
    }
    body.querySelectorAll("tr[data-k]").forEach((tr) => {
      const [tab, id] = tr.dataset.k.split("\u0001");
      tr.querySelector(".row-chk").onchange = (e) => {
        if (e.target.checked) S.selected.add(tr.dataset.k); else S.selected.delete(tr.dataset.k);
        tr.classList.toggle("is-selected", e.target.checked);
        updateSelectionUi(rows);
      };
      tr.querySelector(".row-edit").onclick = () => startEdit(tab, id);
      tr.ondblclick = (e) => { if (!e.target.closest("input,button")) startEdit(tab, id); };
    });
    updateSelectionUi(rows);
  }
  function updateSelectionUi(rows) {
    const n = S.selected.size;
    const btn = $("btnDeleteSelected");
    btn.disabled = n === 0;
    btn.textContent = n ? `선택 삭제 (${n})` : "선택 삭제";
    const all = $("chkAll");
    all.checked = rows.length > 0 && n === rows.length;
    all.indeterminate = n > 0 && n < rows.length;
  }
  function toggleAll(checked) {
    S.selected.clear();
    if (checked) listRecords().forEach((r) => S.selected.add(rowKey(r.tab, r.t.id)));
    renderList();
  }
  async function deleteSelected() {
    const n = S.selected.size;
    if (!n) return;
    const ok = await confirmDanger(`선택한 ${n}건 삭제`, "삭제하면 복구할 수 없습니다. 삭제하시겠습니까?");
    if (!ok) return;
    const byTab = {};
    [...S.selected].forEach((k) => { const [tab, id] = k.split("\u0001"); (byTab[tab] = byTab[tab] || new Set()).add(id); });
    const backups = {};
    try {
      for (const tab of Object.keys(byTab)) {
        backups[tab] = (S.own[tab] || []).slice();
        S.own[tab] = backups[tab].filter((t) => !byTab[tab].has(t.id));
        if (S.editing && S.editing.tab === tab && byTab[tab].has(S.editing.id)) cancelEdit();
        await putOwn(tab);
      }
      S.selected.clear();
      msg(`${n}건을 삭제했습니다.`);
    } catch (e) {
      Object.assign(S.own, backups);
      msg("삭제하지 못했습니다. " + e.message, true);
    }
    renderList();
    updateDayMeter();
  }

  // ---------- 집계 공통 ----------
  async function dataset() {
    if (S.isAdmin) {
      const all = await loadAllData();
      return Object.values(all || {}).flat();
    }
    return Object.values(S.own).flat();
  }
  function inRange(list, p) { return list.filter((t) => t.month >= p.start && t.month <= p.end); }
  // { 월: { 담당자: {count, minutes} } }
  function aggregate(list) {
    const out = {};
    list.forEach((t) => {
      const m = t.month, w = (t.worker || "").trim() || "(이름 없음)";
      out[m] = out[m] || {};
      const a = out[m][w] = out[m][w] || { count: 0, minutes: 0 };
      a.count += num(t.count) || 1;
      a.minutes += num(t.minutes);
    });
    return out;
  }
  function loadingHtml(title) { return `<h3>${esc(title)}</h3><p class="dash-empty">불러오는 중…</p>`; }

  // ---------- 요약 ----------
  async function renderSummary() {
    const p = period();
    $("summaryTitle").textContent = `요약 · ${p.start} ~ ${p.end}`;
    $("sumWorkerCard").innerHTML = loadingHtml("월별 담당자별 업무 건수 · 투입시간");
    $("sumMMCard").innerHTML = loadingHtml("월별 투입 MM");
    let list;
    try { list = inRange(await dataset(), p); }
    catch (e) { $("sumWorkerCard").innerHTML = `<h3>요약</h3><p class="dash-empty">불러오지 못했습니다. ${esc(e.message)}</p>`; $("sumMMCard").innerHTML = ""; return; }
    const months = monthsBetween(p.start, p.end);
    const agg = aggregate(list);
    const scopeNote = S.isAdmin ? "전체 사용자가 입력한 업무 기준입니다." : "본인이 입력한 업무 기준입니다.";

    // 1) 월별 · 담당자별 건수 / 투입시간
    let h = `<h3>월별 담당자별 업무 건수 · 투입시간</h3><table class="summary-table"><thead><tr><th>월</th><th>역할</th><th>담당자</th><th>건수</th><th>투입시간(분)</th><th>투입시간(H)</th><th>MM</th></tr></thead><tbody>`;
    let gc = 0, gm = 0;
    months.forEach((m) => {
      const ws = sortWorkers(Object.keys(agg[m] || {}));
      if (!ws.length) {
        h += `<tr><td class="month-cell">${m}</td><td colspan="6" class="muted">입력 없음</td></tr>`;
        return;
      }
      let mc = 0, mm = 0;
      ws.forEach((w, i) => {
        const a = agg[m][w]; mc += a.count; mm += a.minutes;
        h += `<tr>${i === 0 ? `<td class="month-cell" rowspan="${ws.length + 1}">${m}</td>` : ""}<td class="cell-label role-cell">${esc(roleOf(w))}</td><td class="cell-label">${esc(w)}</td><td>${a.count}</td><td>${a.minutes.toLocaleString()}</td><td>${fmtH(a.minutes)}</td><td>${fmt2(toMM(a.minutes))}</td></tr>`;
      });
      gc += mc; gm += mm;
      h += `<tr class="subtotal-row"><td class="cell-label" colspan="2">${m} 계</td><td>${mc}</td><td>${mm.toLocaleString()}</td><td>${fmtH(mm)}</td><td>${fmt2(toMM(mm))}</td></tr>`;
    });
    h += `<tr class="grand-row"><td class="cell-label" colspan="3">기간 합계</td><td>${gc}</td><td>${gm.toLocaleString()}</td><td>${fmtH(gm)}</td><td>${fmt2(toMM(gm))}</td></tr></tbody></table>`;
    h += `<p class="summary-note">${scopeNote} MM = 투입시간(H) ÷ ${MM_H}H. 역할은 담당자 설정의 담당자 코드와 완료처리자 이름이 같을 때 표시됩니다.</p>`;
    $("sumWorkerCard").innerHTML = h;

    // 2) 월별 투입 MM (기준 MM · 투입 MM · 투입률)
    const settings = await Promise.all(months.map(getSettings));
    const cols = [...ROLES, "계"];
    let t = `<h3>월별 투입 MM</h3><table class="summary-table"><thead><tr><th rowspan="2">월</th>${cols.map((c) => `<th colspan="3">${c}</th>`).join("")}</tr><tr>${cols.map(() => "<th>기준 MM</th><th>투입 MM</th><th>투입률</th>").join("")}</tr></thead><tbody>`;
    const tot = {}; cols.forEach((c) => { tot[c] = { base: 0, mm: 0 }; });
    const cell = (base, mm) => {
      const rate = base ? mm / base * 100 : 0;
      return `<td>${fmt2(base)}</td><td>${fmt2(mm)}</td><td class="${rate > 100 ? "rate-over" : ""}">${base ? rate.toFixed(1) + "%" : "-"}</td>`;
    };
    months.forEach((m, idx) => {
      const target = settings[idx].targetMM;
      const byRole = {}; ROLES.forEach((r) => { byRole[r] = 0; });
      let other = 0;
      Object.entries(agg[m] || {}).forEach(([w, a]) => { const r = roleOf(w); if (byRole[r] != null) byRole[r] += a.minutes; else other += a.minutes; });
      let rowBase = 0, rowMM = 0;
      t += `<tr><td class="month-cell">${m}</td>`;
      ROLES.forEach((r) => {
        const base = num(target[r]), mm = toMM(byRole[r]);
        rowBase += base; rowMM += mm; tot[r].base += base; tot[r].mm += mm;
        t += cell(base, mm);
      });
      rowMM += toMM(other);
      tot["계"].base += rowBase; tot["계"].mm += rowMM;
      t += cell(rowBase, rowMM) + "</tr>";
    });
    t += `<tr class="grand-row"><td class="cell-label">기간 합계</td>${cols.map((c) => cell(tot[c].base, tot[c].mm)).join("")}</tr></tbody></table>`;
    t += `<p class="summary-note">기준 MM은 ‘기준 설정’에서 월별로 지정합니다. 투입률 = 투입 MM ÷ 기준 MM. 역할을 알 수 없는(${UNASSIGNED}) 담당자의 시간은 ‘계’에만 포함됩니다.</p>`;
    $("sumMMCard").innerHTML = t;
  }

  // ---------- 대시보드 (관리자) ----------
  async function renderDashboard() {
    if (!S.isAdmin) return;
    const p = period();
    $("dashTitle").textContent = `대시보드 · ${p.start} ~ ${p.end}`;
    $("dashKpis").innerHTML = "";
    $("dashMatrixCard").innerHTML = loadingHtml("담당자별 월간 건수 · 투입시간 · MM");
    $("dashRoleCard").innerHTML = ""; $("dashMajorCard").innerHTML = "";
    let list;
    try { list = inRange(await dataset(), p); }
    catch (e) { $("dashMatrixCard").innerHTML = `<h3>대시보드</h3><p class="dash-empty">불러오지 못했습니다. ${esc(e.message)}</p>`; return; }
    const months = monthsBetween(p.start, p.end);
    const agg = aggregate(list);
    const settings = await Promise.all(months.map(getSettings));

    const totalCount = list.reduce((a, t) => a + (num(t.count) || 1), 0);
    const totalMin = list.reduce((a, t) => a + num(t.minutes), 0);
    const baseTotal = settings.reduce((a, s) => a + ROLES.reduce((b, r) => b + num(s.targetMM[r]), 0), 0);
    const mmTotal = toMM(totalMin);
    const workers = new Set(list.map((t) => (t.worker || "").trim()).filter(Boolean));
    const kpis = [
      { label: "입력 업무", value: `${totalCount.toLocaleString()}건` },
      { label: "투입시간", value: `${fmtH(totalMin)}H`, sub: `${totalMin.toLocaleString()}분` },
      { label: "투입 MM / 기준 MM", value: `${fmt2(mmTotal)} / ${fmt2(baseTotal)}` },
      { label: "투입률", value: baseTotal ? `${(mmTotal / baseTotal * 100).toFixed(1)}%` : "-" },
      { label: "입력 담당자", value: `${workers.size}명` }
    ];
    $("dashKpis").innerHTML = kpis.map((k) => `<div class="kpi-card"><div class="kpi-value">${k.value}</div><div class="kpi-label">${k.label}</div>${k.sub ? `<div class="kpi-sub">${k.sub}</div>` : ""}</div>`).join("");

    // 담당자 × 월 표 (기획/디자인/퍼블/GA 순, 담당자 설정 순서)
    const groups = ROLES.map((r) => ({ role: r, names: [...(S.assignees[r] || [])] }));
    const extra = sortWorkers([...workers].filter((w) => roleOf(w) === UNASSIGNED));
    if (extra.length) groups.push({ role: UNASSIGNED, names: extra });
    const get = (m, w) => (agg[m] && agg[m][w]) || { count: 0, minutes: 0 };
    const cells = (c, min) => `<td>${c || ""}</td><td>${min ? fmtH(min) : ""}</td><td>${min ? fmt2(toMM(min)) : ""}</td>`;
    let h = `<h3>담당자별 월간 건수 · 투입시간 · MM</h3><div class="table-wrap"><table class="summary-table"><thead><tr><th rowspan="2">역할</th><th rowspan="2">담당자</th>${months.map((m) => `<th colspan="3">${m}</th>`).join("")}<th colspan="3">합계</th></tr><tr>${[...months, "합계"].map(() => "<th>건수</th><th>시간(H)</th><th>MM</th>").join("")}</tr></thead><tbody>`;
    const grand = months.map(() => ({ c: 0, m: 0 })); let gC = 0, gM = 0;
    groups.forEach((g) => {
      const sub = months.map(() => ({ c: 0, m: 0 })); let sC = 0, sM = 0;
      g.names.forEach((w, i) => {
        let rc = 0, rm = 0;
        h += `<tr>${i === 0 ? `<td class="cell-label role-cell" rowspan="${g.names.length + 1}">${esc(g.role)}</td>` : ""}<td class="cell-label">${esc(w)}</td>`;
        months.forEach((m, mi) => { const a = get(m, w); rc += a.count; rm += a.minutes; sub[mi].c += a.count; sub[mi].m += a.minutes; h += cells(a.count, a.minutes); });
        sC += rc; sM += rm;
        h += cells(rc, rm) + "</tr>";
      });
      if (!g.names.length) return;
      h += `<tr class="subtotal-row"><td class="cell-label">소계</td>${sub.map((x) => cells(x.c, x.m)).join("")}${cells(sC, sM)}</tr>`;
      sub.forEach((x, i) => { grand[i].c += x.c; grand[i].m += x.m; }); gC += sC; gM += sM;
    });
    h += `<tr class="grand-row"><td class="cell-label" colspan="2">합계</td>${grand.map((x) => cells(x.c, x.m)).join("")}${cells(gC, gM)}</tr></tbody></table></div>`;
    $("dashMatrixCard").innerHTML = h;

    // 역할별 투입 MM vs 기준 MM
    const roleMin = {}; ROLES.forEach((r) => { roleMin[r] = 0; });
    list.forEach((t) => { const r = roleOf(t.worker); if (roleMin[r] != null) roleMin[r] += num(t.minutes); });
    const roleRows = ROLES.map((r) => {
      const base = settings.reduce((a, s) => a + num(s.targetMM[r]), 0);
      return { r, mm: toMM(roleMin[r]), base };
    });
    const maxR = Math.max(1e-9, ...roleRows.map((x) => Math.max(x.mm, x.base)));
    $("dashRoleCard").innerHTML = `<h3>역할별 투입 MM (기준 대비)</h3>` + roleRows.map((x) =>
      `<div class="bar-row"><span class="bar-label">${x.r}</span><div class="bar-track"><div class="bar-fill" style="width:${x.mm / maxR * 100}%"></div></div><span class="bar-value">${fmt2(x.mm)} / ${fmt2(x.base)}${x.base ? ` (${(x.mm / x.base * 100).toFixed(0)}%)` : ""}</span></div>`).join("");

    // 대분류별 투입시간
    const byMajor = {};
    list.forEach((t) => { const k = t.major || "(미분류)"; byMajor[k] = (byMajor[k] || 0) + num(t.minutes); });
    const order = [...S.cats.majors.filter((m) => byMajor[m] != null), ...Object.keys(byMajor).filter((m) => !S.cats.majors.includes(m))];
    const maxM = Math.max(1, ...Object.values(byMajor));
    $("dashMajorCard").innerHTML = `<h3>대분류별 투입시간</h3>` + (order.length ? order.map((m) =>
      `<div class="bar-row"><span class="bar-label wide">${esc(m)}</span><div class="bar-track"><div class="bar-fill" style="width:${byMajor[m] / maxM * 100}%"></div></div><span class="bar-value">${fmtH(byMajor[m])}H</span></div>`).join("") : `<p class="dash-empty">조회 기간에 입력된 업무가 없습니다.</p>`);
  }

  // ---------- 기준 설정 (관리자) ----------
  async function openSettings() {
    const modal = $("settingsModal");
    const sel = $("settingsMonth");
    fillMonthSelect(sel, $("periodEnd").value || nowMonth());
    modal.style.display = "flex";
    let draft = null;
    const draw = async () => {
      $("settingsForm").innerHTML = `<p class="dash-empty">불러오는 중…</p>`;
      delete S.settingsCache[sel.value];
      const s = await getSettings(sel.value);
      draft = { targetMM: Object.assign({}, s.targetMM), workDays: s.workDays };
      const f = $("settingsForm");
      f.innerHTML = "";
      ROLES.forEach((r) => {
        const row = document.createElement("div");
        row.className = "settings-row";
        row.innerHTML = `<label>${r} 기준 MM</label>`;
        const inp = document.createElement("input");
        inp.type = "number"; inp.step = "0.1"; inp.value = draft.targetMM[r] ?? 0;
        inp.oninput = () => { draft.targetMM[r] = parseFloat(inp.value) || 0; };
        row.appendChild(inp); f.appendChild(row);
      });
      const row = document.createElement("div");
      row.className = "settings-row";
      row.innerHTML = `<label>업무일수</label>`;
      const wd = document.createElement("input");
      wd.type = "number"; wd.value = draft.workDays || 20;
      wd.oninput = () => { draft.workDays = parseInt(wd.value, 10) || 20; };
      row.appendChild(wd); f.appendChild(row);
    };
    sel.onchange = draw;
    await draw();
    $("btnSettingsClose").onclick = () => { modal.style.display = "none"; };
    $("btnSettingsSave").onclick = async () => {
      try {
        await api("/api/settings", { method: "PUT", body: { month: sel.value, settings: draft } });
        S.settingsCache[sel.value] = draft;
        modal.style.display = "none";
        renderAll();
      } catch (e) { alert("기준 설정을 저장하지 못했습니다.\n" + e.message); }
    };
  }

  // ---------- 담당자 설정 (관리자) ----------
  let assigneeDraft = null;
  function openAssigneeSettings() {
    assigneeDraft = {};
    ROLES.forEach((r) => { assigneeDraft[r] = [...(S.assignees[r] || [])]; });
    const modal = $("assigneeModal");
    modal.style.display = "flex";
    renderAssigneeForm();
    $("btnAssigneeClose").onclick = () => { modal.style.display = "none"; assigneeDraft = null; };
    $("btnAssigneeSave").onclick = async () => {
      const btn = $("btnAssigneeSave");
      btn.disabled = true; btn.textContent = "저장 중…";
      try {
        const renames = [];
        ROLES.forEach((r) => {
          (S.assignees[r] || []).forEach((oldName, i) => {
            const nn = (assigneeDraft[r][i] || "").trim();
            if (nn && nn !== oldName) renames.push({ oldName, newName: nn });
          });
        });
        const next = {};
        ROLES.forEach((r) => { next[r] = assigneeDraft[r].map((v) => v.trim()).filter(Boolean); });
        await api("/api/assignees", { method: "PUT", body: { assignees: next } });
        S.assignees = next;
        if (renames.length) await applyRenames(renames);
        modal.style.display = "none";
        assigneeDraft = null;
        fillWorkerList();
        renderAll();
      } catch (e) {
        alert("담당자 설정을 저장하지 못했습니다.\n" + e.message);
      } finally { btn.disabled = false; btn.textContent = "저장"; }
    };
  }
  // 이름이 바뀐 담당자를 모든 사용자 · 모든 탭의 완료처리자에 반영
  async function applyRenames(renames) {
    const all = await loadAllData(true);
    const map = {}; renames.forEach((x) => { map[x.oldName] = x.newName; });
    for (const tab of Object.keys(all)) {
      const byUser = {};
      let changed = new Set();
      all[tab].forEach((t) => {
        const u = t.createdBy; (byUser[u] = byUser[u] || []).push(t);
        if (map[t.worker]) { t.worker = map[t.worker]; changed.add(u); }
      });
      for (const u of changed) {
        await api("/api/tasks", { method: "PUT", body: { month: tab, user: u, tasks: byUser[u] } });
      }
    }
    S.all = null;
    await loadOwnAll();
  }
  function renderAssigneeForm() {
    const c = $("assigneeForm");
    c.innerHTML = ROLES.map((role) => `
      <div class="assignee-col">
        <h4>${role}</h4>
        <div class="assignee-list">
          ${assigneeDraft[role].map((name, i) => `
            <div class="assignee-row">
              <input type="text" value="${esc(name)}" data-role="${role}" data-idx="${i}" />
              <button type="button" class="assignee-del" data-role="${role}" data-idx="${i}">✕</button>
            </div>`).join("")}
        </div>
        <button type="button" class="btn btn-ghost btn-sm assignee-add" data-role="${role}">+ 추가</button>
      </div>`).join("");
    c.querySelectorAll(".assignee-row input").forEach((inp) => { inp.oninput = () => { assigneeDraft[inp.dataset.role][+inp.dataset.idx] = inp.value; }; });
    c.querySelectorAll(".assignee-del").forEach((b) => { b.onclick = () => { assigneeDraft[b.dataset.role].splice(+b.dataset.idx, 1); renderAssigneeForm(); }; });
    c.querySelectorAll(".assignee-add").forEach((b) => { b.onclick = () => { const r = b.dataset.role; assigneeDraft[r].push(`${r}${assigneeDraft[r].length + 1}`); renderAssigneeForm(); }; });
  }

  // ---------- 분류 설정 (관리자) ----------
  let catDraft = null, catMajor = null, catMinor = null;
  function openCategorySettings() {
    catDraft = normCats(S.cats);
    catMajor = catDraft.majors[0] || null;
    catMinor = catMajor ? (catDraft.minors[catMajor] || [])[0] || null : null;
    $("categoryModal").style.display = "flex";
    renderCategoryForm();
    $("btnCategoryClose").onclick = () => { $("categoryModal").style.display = "none"; catDraft = null; };
    $("btnCategoryReset").onclick = () => {
      if (!confirm("분류를 처음 기본값으로 되돌릴까요? (저장을 눌러야 반영됩니다)")) return;
      catDraft = defaultCategories(); catMajor = catDraft.majors[0]; catMinor = catDraft.minors[catMajor][0]; renderCategoryForm();
    };
    $("btnCategorySave").onclick = async () => {
      const btn = $("btnCategorySave");
      btn.disabled = true; btn.textContent = "저장 중…";
      try {
        const out = { majors: [], minors: {}, subs: {} };
        catDraft.majors.map((m) => m.trim()).filter(Boolean).forEach((ma) => {
          if (out.minors[ma]) return;
          out.majors.push(ma);
          out.minors[ma] = [];
          (catDraft.minors[ma] || []).map((v) => v.trim()).filter(Boolean).forEach((mi) => {
            if (out.minors[ma].includes(mi)) return;
            out.minors[ma].push(mi);
            out.subs[subKey(ma, mi)] = (catDraft.subs[subKey(ma, mi)] || []).map((v) => v.trim()).filter(Boolean);
          });
        });
        await api("/api/categories", { method: "PUT", body: { categories: out } });
        S.cats = out;
        $("categoryModal").style.display = "none";
        catDraft = null;
        const c = currentCat();
        setCategory(c.major, c.minor, c.sub);
        renderFavs();
      } catch (e) {
        alert("분류 설정을 저장하지 못했습니다.\n" + e.message);
      } finally { btn.disabled = false; btn.textContent = "저장"; }
    };
  }
  function moveKey(obj, from, to) { if (from === to) return; obj[to] = obj[from] || []; delete obj[from]; }
  function renderCategoryForm() {
    const el = $("categoryForm");
    el.classList.add("three");
    const d = catDraft;
    if (!d.majors.includes(catMajor)) catMajor = d.majors[0] || null;
    const minors = catMajor ? (d.minors[catMajor] = d.minors[catMajor] || []) : [];
    if (!minors.includes(catMinor)) catMinor = minors[0] || null;
    const sk = catMajor && catMinor != null ? subKey(catMajor, catMinor) : null;
    const subs = sk ? (d.subs[sk] = d.subs[sk] || []) : [];
    const pane = (title, rows, addId, addLabel) => `
      <div class="category-pane"><h4>${title}</h4>
        ${rows === null ? `<p class="dash-empty">왼쪽에서 먼저 선택하세요.</p>` : `<div class="category-list">${rows}</div><button type="button" class="btn btn-ghost btn-sm" id="${addId}">${addLabel}</button>`}
      </div>`;
    const majorRows = d.majors.map((m, i) => `
      <div class="category-row ${m === catMajor ? "is-active" : ""}">
        <button type="button" class="category-pick" data-pick-major="${i}" title="중분류 편집">${m === catMajor ? "▸" : "　"}</button>
        <input type="text" value="${esc(m)}" data-major="${i}" />
        <button type="button" class="assignee-del" data-del-major="${i}">✕</button>
      </div>`).join("");
    const minorRows = minors.map((m, i) => `
      <div class="category-row ${m === catMinor ? "is-active" : ""}">
        <button type="button" class="category-pick" data-pick-minor="${i}" title="소분류 편집">${m === catMinor ? "▸" : "　"}</button>
        <input type="text" value="${esc(m)}" data-minor="${i}" />
        <button type="button" class="assignee-del" data-del-minor="${i}">✕</button>
      </div>`).join("");
    const subRows = subs.map((s, i) => `
      <div class="category-row">
        <input type="text" value="${esc(s)}" data-sub="${i}" />
        <button type="button" class="assignee-del" data-del-sub="${i}">✕</button>
      </div>`).join("");
    el.innerHTML =
      pane("대분류", majorRows, "btnAddMajor", "+ 대분류 추가") +
      pane(`중분류 ${catMajor ? `· <span class="category-active-name">${esc(catMajor)}</span>` : ""}`, catMajor ? minorRows : null, "btnAddMinor", "+ 중분류 추가") +
      pane(`소분류 ${catMinor ? `· <span class="category-active-name">${esc(catMinor)}</span>` : ""}`, sk ? subRows : null, "btnAddSub", "+ 소분류 추가");

    el.querySelectorAll("[data-major]").forEach((inp) => {
      inp.oninput = () => {
        const i = +inp.dataset.major, oldN = d.majors[i], newN = inp.value;
        d.majors[i] = newN;
        moveKey(d.minors, oldN, newN);
        (d.minors[newN] || []).forEach((mi) => moveKey(d.subs, subKey(oldN, mi), subKey(newN, mi)));
        if (catMajor === oldN) catMajor = newN;
      };
    });
    el.querySelectorAll("[data-minor]").forEach((inp) => {
      inp.oninput = () => {
        const i = +inp.dataset.minor, oldN = d.minors[catMajor][i], newN = inp.value;
        d.minors[catMajor][i] = newN;
        moveKey(d.subs, subKey(catMajor, oldN), subKey(catMajor, newN));
        if (catMinor === oldN) catMinor = newN;
      };
    });
    el.querySelectorAll("[data-sub]").forEach((inp) => { inp.oninput = () => { d.subs[sk][+inp.dataset.sub] = inp.value; }; });
    el.querySelectorAll("[data-pick-major]").forEach((b) => { b.onclick = () => { catMajor = d.majors[+b.dataset.pickMajor]; catMinor = null; renderCategoryForm(); }; });
    el.querySelectorAll("[data-pick-minor]").forEach((b) => { b.onclick = () => { catMinor = minors[+b.dataset.pickMinor]; renderCategoryForm(); }; });
    el.querySelectorAll("[data-del-major]").forEach((b) => {
      b.onclick = () => {
        const i = +b.dataset.delMajor, name = d.majors[i];
        if (!confirm(`'${name}' 대분류와 하위 분류를 모두 삭제할까요?`)) return;
        (d.minors[name] || []).forEach((mi) => delete d.subs[subKey(name, mi)]);
        d.majors.splice(i, 1); delete d.minors[name];
        renderCategoryForm();
      };
    });
    el.querySelectorAll("[data-del-minor]").forEach((b) => {
      b.onclick = () => {
        const i = +b.dataset.delMinor, name = minors[i];
        if (!confirm(`'${name}' 중분류와 하위 소분류를 삭제할까요?`)) return;
        delete d.subs[subKey(catMajor, name)];
        minors.splice(i, 1);
        renderCategoryForm();
      };
    });
    el.querySelectorAll("[data-del-sub]").forEach((b) => { b.onclick = () => { subs.splice(+b.dataset.delSub, 1); renderCategoryForm(); }; });
    const addMajor = $("btnAddMajor");
    if (addMajor) addMajor.onclick = () => { const n = `새 대분류${d.majors.length + 1}`; d.majors.push(n); d.minors[n] = []; catMajor = n; catMinor = null; renderCategoryForm(); };
    const addMinor = $("btnAddMinor");
    if (addMinor) addMinor.onclick = () => { const n = `새 중분류${minors.length + 1}`; minors.push(n); d.subs[subKey(catMajor, n)] = []; catMinor = n; renderCategoryForm(); };
    const addSub = $("btnAddSub");
    if (addSub) addSub.onclick = () => { subs.push(""); renderCategoryForm(); const last = el.querySelectorAll("[data-sub]"); if (last.length) last[last.length - 1].focus(); };
  }

  // ---------- CSV ----------
  function csvEscape(v) { const s = String(v == null ? "" : v); return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; }
  function download(blob, name) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function stamp() { const d = new Date(); return `${String(d.getFullYear()).slice(2)}${pad(d.getMonth() + 1)}${pad(d.getDate())}`; }
  function exportCsvTemplate() {
    const ex = [nowMonth(), "(예시) 메인 배너 반영 검수", (S.user && S.user.name) || "", today(), "60", "1", "Web서비스 운영", "반영 검수", "신규/개선 기능 반영 전/후 테스트"];
    const text = "﻿" + CSV_HEADERS.map(csvEscape).join(",") + "\n" + ex.map(csvEscape).join(",") + "\n";
    download(new Blob([text], { type: "text/csv;charset=utf-8" }), "업무상세내역_업로드양식.csv");
  }
  function parseCsv(text) {
    const rows = []; let row = [], cur = "", q = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (q) {
        if (ch === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; }
        else cur += ch;
      } else if (ch === '"') q = true;
      else if (ch === ",") { row.push(cur); cur = ""; }
      else if (ch === "\n" || ch === "\r") {
        if (ch === "\r" && text[i + 1] === "\n") i++;
        row.push(cur); cur = "";
        if (row.some((c) => c.trim() !== "")) rows.push(row);
        row = [];
      } else cur += ch;
    }
    row.push(cur);
    if (row.some((c) => c.trim() !== "")) rows.push(row);
    return rows;
  }
  // 엑셀에서 저장한 CSV(EUC-KR)도 읽을 수 있도록
  async function readCsvText(file) {
    const buf = await file.arrayBuffer();
    try { return new TextDecoder("utf-8", { fatal: true }).decode(buf).replace(/^﻿/, ""); }
    catch (e) { return new TextDecoder("euc-kr").decode(buf); }
  }
  async function handleCsvFile(e) {
    const file = e.target.files && e.target.files[0];
    e.target.value = "";
    if (!file) return;
    const rows = parseCsv(await readCsvText(file));
    if (rows.length < 2) { alert("데이터 행이 없습니다. 헤더 아래에 업무를 입력한 뒤 다시 올려주세요."); return; }
    const headers = rows[0].map((h) => (h || "").trim().replace(/\s+/g, ""));
    const idx = {};
    CSV_HEADERS.forEach((h, i) => { const at = headers.indexOf(h.replace(/\s+/g, "")); if (at >= 0) idx[CSV_KEYS[i]] = at; });
    if (idx.title == null || idx.date == null) {
      alert("양식의 헤더를 인식하지 못했습니다.\n‘양식 받기’로 받은 CSV의 첫 줄(헤더)을 그대로 두고 올려주세요.\n(필수: 업무명, 처리일)");
      return;
    }
    const imported = [], skipped = [];
    const now = new Date().toISOString();
    rows.slice(1).forEach((r, i) => {
      const v = (k) => (idx[k] == null ? "" : String(r[idx[k]] ?? "").trim().replace(/^="(.*)"$/, "$1"));
      const line = i + 2;
      const title = v("title");
      if (!title || title.startsWith("(예시)")) { if (title) skipped.push(`${line}행: 예시 행`); else skipped.push(`${line}행: 업무명 없음`); return; }
      const date = parseDate(v("date"));
      if (!date) { skipped.push(`${line}행: 처리일 형식 오류`); return; }
      const month = parseMonth(v("month")) || date.slice(0, 7);
      const minRaw = v("minutes").replace(/[^\d]/g, "");
      if (!minRaw || minRaw.length > 4) { skipped.push(`${line}행: 처리소요시간 오류`); return; }
      imported.push({
        id: uid(), month, title: title.slice(0, TITLE_MAX), worker: v("worker") || (S.user && S.user.name) || "",
        date, minutes: parseInt(minRaw, 10), count: 1, major: v("major"), minor: v("minor"), sub: v("sub"),
        createdAt: now, updatedAt: now
      });
    });
    if (!imported.length) { alert("올릴 수 있는 행이 없습니다.\n\n" + skipped.slice(0, 10).join("\n")); return; }
    const cur = S.own[S.tab] || [];
    const replace = cur.length ? confirm(
      `CSV에서 ${imported.length}건을 읽었습니다. (저장 위치: ${S.tab})\n\n` +
      `[확인] 이 탭의 내 업무 ${cur.length}건을 모두 지우고 교체\n[취소] 기존 목록 뒤에 추가`) : false;
    const backup = cur.slice();
    S.own[S.tab] = replace ? imported : [...cur, ...imported];
    try {
      await putOwn(S.tab);
      S.search = null;
      renderTabs(); buildPeriodSelects(); renderList(); updateDayMeter();
      alert(`${imported.length}건을 올렸습니다.${skipped.length ? `\n\n건너뛴 행 ${skipped.length}개:\n` + skipped.slice(0, 10).join("\n") + (skipped.length > 10 ? "\n…" : "") : ""}`);
    } catch (err) {
      S.own[S.tab] = backup;
      alert("업로드 내용을 저장하지 못했습니다.\n" + err.message);
    }
  }

  // ---------- 엑셀 다운로드 ----------
  function openExport(mode) {
    if (mode === "admin" && !S.isAdmin) return;
    const modal = $("exportModal");
    $("exportTitle").textContent = mode === "admin" ? "관리자 엑셀 다운로드" : "엑셀 다운로드";
    $("exportDesc").textContent = mode === "admin"
      ? "선택한 기간에 모든 사용자가 입력한 업무를 내려받습니다."
      : "선택한 기간에 내가 입력한 업무를 내려받습니다.";
    const p = period();
    fillMonthSelect($("exportStart"), p.start);
    fillMonthSelect($("exportEnd"), p.end);
    $("exportMsg").textContent = "";
    modal.style.display = "flex";
    $("btnExportClose").onclick = () => { modal.style.display = "none"; };
    $("btnExportRun").onclick = async () => {
      let a = $("exportStart").value, b = $("exportEnd").value;
      if (a > b) [a, b] = [b, a];
      const btn = $("btnExportRun");
      btn.disabled = true; $("exportMsg").textContent = "";
      try {
        const src = mode === "admin" ? Object.values(await loadAllData(true)).flat() : Object.values(S.own).flat();
        const list = inRange(src, { start: a, end: b })
          .sort((x, y) => (x.date || "").localeCompare(y.date || "") || (x.worker || "").localeCompare(y.worker || "", "ko"));
        if (!list.length) { $("exportMsg").textContent = "선택한 기간에 입력된 업무가 없습니다."; return; }
        if (typeof XlsxLite === "undefined") throw new Error("엑셀 도구(xlsx.js)를 불러오지 못했습니다.");
        const who = mode === "admin" ? "전체" : ((S.user && S.user.name) || "내업무");
        const def = buildWorkbook(list, { start: a, end: b, admin: mode === "admin", who });
        download(XlsxLite.build(def), `업무상세내역_${who}_${a.replace(".", "")}-${b.replace(".", "")}_${stamp()}.xlsx`);
        modal.style.display = "none";
      } catch (e) {
        $("exportMsg").textContent = "다운로드하지 못했습니다. " + e.message;
      } finally { btn.disabled = false; }
    };
  }

  function buildWorkbook(list, o) {
    const FONT = "맑은 고딕";
    const thin = ["thin", "FFBFBFBF"];
    const box = { l: thin, r: thin, t: thin, b: thin };
    const st = (x) => Object.assign({ font: { name: FONT, sz: 10 }, border: box, align: { v: "center" } }, x || {});
    const head = st({ font: { name: FONT, sz: 10, b: true, color: "FFFFFFFF" }, fill: "FF1D1D1F", align: { h: "center", v: "center", wrap: true } });
    const center = st({ align: { h: "center", v: "center" } });
    const left = st({ align: { h: "left", v: "center", wrap: true } });
    const numS = st({ align: { h: "right", v: "center" }, numFmt: "#,##0" });
    const totS = st({ font: { name: FONT, sz: 10, b: true }, fill: "FFF2F2F2", align: { h: "center", v: "center" } });
    const totN = st({ font: { name: FONT, sz: 10, b: true }, fill: "FFF2F2F2", align: { h: "right", v: "center" }, numFmt: "#,##0" });

    // 시트 1: 상세 목록
    const cols = [
      ["NO", 6, "c"], ["월", 9, "c"], ["처리일", 12, "c"], ["업무명", 48, "l"], ["완료처리자", 12, "c"], ["역할", 8, "c"],
      ["처리소요시간(분)", 11, "n"], ["처리건수", 8, "n"], ["대분류", 16, "c"], ["중분류", 22, "l"], ["소분류", 36, "l"]
    ];
    if (o.admin) cols.push(["작성자", 18, "c"]);
    const cells = [];
    const put = (r, c, v, s, extra) => cells.push(Object.assign({ r, c, v, s }, extra || {}));
    const totalMin = list.reduce((a, t) => a + num(t.minutes), 0);
    put(1, 1, `업무상세내역 (${o.who})`, { font: { name: FONT, sz: 14, b: true } });
    put(2, 1, `기간 ${o.start} ~ ${o.end} · 총 ${list.length}건 · ${totalMin.toLocaleString()}분 (${fmtH(totalMin)}H) · 다운로드 ${today()}`, { font: { name: FONT, sz: 10, color: "FF666666" } });
    const HR = 4, FIRST = 5, LAST = FIRST + list.length - 1;
    cols.forEach(([label], i) => put(HR, i + 1, label, head));
    list.forEach((t, i) => {
      const r = FIRST + i;
      const vals = [i + 1, t.month, t.date, t.title, t.worker, roleOf(t.worker), num(t.minutes), num(t.count) || 1, t.major, t.minor, t.sub];
      if (o.admin) vals.push(S.users[t.createdBy] || t.createdBy || "");
      vals.forEach((v, c) => { const k = cols[c][2]; put(r, c + 1, v, k === "n" ? numS : k === "l" ? left : center); });
    });
    const TR = LAST + 1;
    put(TR, 1, "합계", totS);
    for (let c = 2; c <= cols.length; c++) {
      if (c === 7) put(TR, c, null, totN, { f: `SUM(G${FIRST}:G${LAST})` });
      else if (c === 8) put(TR, c, null, totN, { f: `SUM(H${FIRST}:H${LAST})` });
      else put(TR, c, "", totS);
    }
    const lastCol = XlsxLite.colName(cols.length);
    const sheet1 = {
      name: "업무상세내역",
      cols: cols.map(([, w], i) => ({ c: i + 1, width: w })),
      rowHeights: { 1: 24, [HR]: 30 },
      cells,
      merges: [`A1:${lastCol}1`, `A2:${lastCol}2`],
      freeze: { row: HR },
      autoFilter: `A${HR}:${lastCol}${LAST}`,
      landscapeFit: true
    };

    // 시트 2: 월별 · 담당자별 합계
    const agg = aggregate(list);
    const c2 = [];
    const put2 = (r, c, v, s, extra) => c2.push(Object.assign({ r, c, v, s }, extra || {}));
    put2(1, 1, `월별 담당자별 합계 (${o.start} ~ ${o.end})`, { font: { name: FONT, sz: 14, b: true } });
    ["월", "역할", "담당자", "건수", "투입시간(분)", "투입시간(H)", "MM"].forEach((h, i) => put2(3, i + 1, h, head));
    let r = 4;
    const mmS = st({ align: { h: "right", v: "center" }, numFmt: "0.00" });
    const hS = st({ align: { h: "right", v: "center" }, numFmt: "0.0" });
    Object.keys(agg).sort().forEach((m) => {
      sortWorkers(Object.keys(agg[m])).forEach((w) => {
        const a = agg[m][w];
        put2(r, 1, m, center); put2(r, 2, roleOf(w), center); put2(r, 3, w, center);
        put2(r, 4, a.count, numS); put2(r, 5, a.minutes, numS);
        put2(r, 6, null, hS, { f: `E${r}/60` }); put2(r, 7, null, mmS, { f: `E${r}/60/${MM_H}` });
        r++;
      });
    });
    put2(r, 1, "합계", totS); put2(r, 2, "", totS); put2(r, 3, "", totS);
    put2(r, 4, null, totN, { f: `SUM(D4:D${r - 1})` }); put2(r, 5, null, totN, { f: `SUM(E4:E${r - 1})` });
    put2(r, 6, null, Object.assign({}, totN, { numFmt: "0.0" }), { f: `E${r}/60` });
    put2(r, 7, null, Object.assign({}, totN, { numFmt: "0.00" }), { f: `E${r}/60/${MM_H}` });
    const sheet2 = {
      name: "월별 담당자별 합계",
      cols: [10, 10, 14, 9, 13, 12, 9].map((w, i) => ({ c: i + 1, width: w })),
      rowHeights: { 1: 24, 3: 22 },
      cells: c2,
      freeze: { row: 3 }
    };
    return { sheets: [sheet1, sheet2] };
  }

  // ---------- 연결 확인 ----------
  async function checkConnection() {
    const btn = $("btnHealth");
    btn.disabled = true;
    const lines = [];
    try {
      const h = await fetch(API_BASE + "/api/health", { cache: "no-store" });
      lines.push(`서버 연결: ${h.ok ? "정상" : "오류 " + h.status}`);
    } catch (e) { lines.push("서버 연결: 실패 (" + e.message + ")"); }
    try {
      const r = await api(`/api/tasks?month=${encodeURIComponent(S.tab)}`);
      lines.push(`읽기(GET): 정상 — ${S.tab} ${(r.tasks || []).length}건`);
    } catch (e) { lines.push("읽기(GET): 실패 — " + e.message); }
    try {
      await putOwn(S.tab);
      lines.push("쓰기(PUT): 정상");
    } catch (e) { lines.push("쓰기(PUT): 실패 — " + e.message); }
    btn.disabled = false;
    alert(lines.join("\n"));
  }

  // ---------- 이벤트 ----------
  function bindControls() {
    $("brandHome").onclick = () => setView("entry");
    $("btnEntryView").onclick = () => setView("entry");
    $("btnSummaryView").onclick = () => setView("summary");
    $("btnDashboardView").onclick = () => setView("dashboard");
    $("btnSearch").onclick = runSearch;
    $("btnSummaryRefresh").onclick = async () => { S.all = null; S.settingsCache = {}; if (!S.isAdmin) await loadOwnAll().catch(() => {}); renderSummary(); };
    $("btnDashRefresh").onclick = () => { S.all = null; S.settingsCache = {}; renderDashboard(); };
    $("btnImport").onclick = () => $("csvFileInput").click();
    $("csvFileInput").onchange = handleCsvFile;
    $("btnCsvTemplate").onclick = exportCsvTemplate;
    $("btnExport").onclick = () => openExport("mine");
    $("btnAdminExport").onclick = () => openExport("admin");
    $("btnCategorySettings").onclick = openCategorySettings;
    $("btnSettings").onclick = openSettings;
    $("btnHealth").onclick = checkConnection;

    $("btnEntrySave").onclick = saveEntry;
    $("btnEntryReset").onclick = () => { resetForm(false); msg(""); };
    $("btnEntryCancel").onclick = cancelEdit;
    $("btnDeleteSelected").onclick = deleteSelected;
    $("chkAll").onchange = (e) => toggleAll(e.target.checked);
    $("btnFavToggle").onclick = toggleFav;
    $("fMajor").onchange = () => { fillMinor(); };
    $("fMinor").onchange = () => { fillSub(); };
    $("fSub").onchange = updateFavToggle;

    $("fTitle").oninput = updateCounter;
    $("fMinutes").oninput = () => {
      const el = $("fMinutes");
      const clean = el.value.replace(/[^\d]/g, "").slice(0, 4);
      if (clean !== el.value) el.value = clean;
      updateDayMeter();
    };
    $("fMonth").oninput = () => {
      const el = $("fMonth");
      const d = el.value.replace(/[^\d]/g, "");
      if (/^\d{6}$/.test(d) && !el.value.includes(".")) el.value = `${d.slice(0, 4)}.${d.slice(4)}`;
    };
    $("fMonth").onblur = () => { const m = parseMonth($("fMonth").value); if (m) $("fMonth").value = m; };
    $("fDate").oninput = () => {
      const el = $("fDate");
      const d = el.value.replace(/[^\d]/g, "");
      if (/^\d{8}$/.test(d) && !/[.\-/]/.test(el.value)) el.value = `${d.slice(0, 4)}.${d.slice(4, 6)}.${d.slice(6)}`;
      updateDayMeter();
    };
    $("fDate").onblur = () => {
      const d = parseDate($("fDate").value);
      $("fDate").classList.toggle("is-invalid", !!$("fDate").value && !d);
      if (d) $("fDate").value = d;
      updateDayMeter();
    };
    const picker = $("fDatePicker");
    $("fDateBtn").onclick = () => {
      const d = parseDate($("fDate").value) || today();
      picker.value = dotToIso(d);
      if (picker.showPicker) { try { picker.showPicker(); return; } catch (e) { /* 아래로 */ } }
      picker.focus(); picker.click();
    };
    picker.onchange = () => { if (picker.value) { $("fDate").value = isoToDot(picker.value); $("fDate").classList.remove("is-invalid"); updateDayMeter(); } };

    // Enter 로 저장, Esc 로 수정 취소
    ["fMonth", "fTitle", "fWorker", "fDate", "fMinutes"].forEach((id) => {
      $(id).addEventListener("keydown", (e) => {
        if (e.key === "Enter" && !e.isComposing) { e.preventDefault(); saveEntry(); }
        if (e.key === "Escape" && S.editing) cancelEdit();
      });
    });
    // 모달 바깥 클릭 시 닫기 (확인창 제외)
    ["tabModal", "exportModal", "settingsModal"].forEach((id) => {
      $(id).addEventListener("mousedown", (e) => { if (e.target.id === id) $(id).style.display = "none"; });
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
