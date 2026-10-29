// ============================================================
// app.js — 업무관리 시트 프론트엔드 로직
// ============================================================

const state = {
  months: [],          // ["8월","9월",...]
  currentMonth: null,
  tasks: [],           // 현재 월의 업무 배열
  settings: { targetMM: { ...DEFAULT_TARGET_MM }, workDays: 20 },
  view: "dashboard",    // "dashboard" | "sheet" | "summary" | "holiday"
  searchText: "",
  statusFilter: "",   // 진행현황 필터 ("" = 전체)
  sortKey: null,        // 정렬 기준 컬럼 key (null이면 시트 등록 순서)
  sortDir: null         // "asc" | "desc"
};

// ---------------- Storage layer (Vercel API 또는 localStorage) ----------------

// 데이터 분리(namespace): index_biz.html 처럼 window.APP_NS 가 있으면
// 서버 요청에 ?ns=<값> 을 붙이고, 브라우저 저장 키 끝에 _<값> 을 붙여 index.html 데이터와 섞이지 않게 합니다.
// (index.html 은 APP_NS 가 없으므로 기존과 완전히 동일하게 동작)
function nsSuffix() { return window.APP_NS ? `_${window.APP_NS}` : ""; }
function withNs(path) {
  if (!window.APP_NS || /[?&]ns=/.test(path)) return path;
  return path + (path.includes("?") ? "&" : "?") + "ns=" + encodeURIComponent(window.APP_NS);
}

const LOCAL_MONTHS_KEY = "wm_months_v1" + nsSuffix();
const LOCAL_ASSIGNEES_KEY = "wm_assignees_v1" + nsSuffix();
const LOCAL_CATEGORIES_KEY = "wm_categories_v1" + nsSuffix();
function localMonthsKey() { return LOCAL_MONTHS_KEY; }
function localTasksKey(month) { return `wm_tasks_v1${nsSuffix()}_${month}`; }
function localSettingsKey(month) { return `wm_settings_v1${nsSuffix()}_${month}`; }

function uid() {
  return (crypto.randomUUID ? crypto.randomUUID() : "id_" + Date.now() + "_" + Math.random().toString(16).slice(2));
}

async function apiFetchJson(path, options) {
  // cache: "no-store" — 저장 직후 새로고침 시 브라우저가 예전 응답을 재사용하지 않도록
  const res = await fetch(API_BASE + withNs(path), { cache: "no-store", ...(options || {}) });
  if (!res.ok) {
    let detail = "";
    try {
      const body = await res.json();
      detail = body && body.error ? ` - ${body.error}` : "";
    } catch (e) {
      if (res.status === 404) detail = " - 해당 API 파일이 배포되지 않았습니다";
    }
    throw new Error(`${res.status} ${res.statusText}${detail} (${path})`);
  }
  return res.json();
}

async function loadMonths() {
  if (!API_BASE) {
    const raw = localStorage.getItem(localMonthsKey());
    if (raw) return JSON.parse(raw);
    const now = new Date();
    const initial = [`${now.getMonth() + 1}월`];
    localStorage.setItem(localMonthsKey(), JSON.stringify(initial));
    return initial;
  }
  const data = await apiFetchJson("/api/months");
  return data.months || [];
}

async function saveMonths(months) {
  if (!API_BASE) {
    localStorage.setItem(localMonthsKey(), JSON.stringify(months));
    return;
  }
  await apiFetchJson("/api/months", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ months })
  });
}

async function loadAssignees() {
  if (!API_BASE) {
    const raw = localStorage.getItem(LOCAL_ASSIGNEES_KEY);
    return raw ? JSON.parse(raw) : null;
  }
  try {
    const data = await apiFetchJson("/api/assignees");
    return data.assignees || null;
  } catch (e) {
    // API가 아직 배포되지 않았거나 실패한 경우 로컬에 저장된 값으로 대체
    const raw = localStorage.getItem(LOCAL_ASSIGNEES_KEY);
    return raw ? JSON.parse(raw) : null;
  }
}

async function saveAssignees(assignees) {
  // 로컬에는 항상 먼저 저장해 둡니다. (API 실패 시에도 설정이 남도록)
  try { localStorage.setItem(LOCAL_ASSIGNEES_KEY, JSON.stringify(assignees)); } catch (e) { /* 용량 초과 등 무시 */ }
  if (!API_BASE) return;
  await apiFetchJson("/api/assignees", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ assignees })
  });
}

async function loadTasks(month) {
  if (!API_BASE) {
    const raw = localStorage.getItem(localTasksKey(month));
    return raw ? JSON.parse(raw) : [];
  }
  try {
    const data = await apiFetchJson(`/api/tasks?month=${encodeURIComponent(month)}`);
    const tasks = data.tasks || [];
    // 서버 응답을 로컬 캐시에 보관 (다음 접속 시 서버 장애 대비)
    try { localStorage.setItem(localTasksKey(month), JSON.stringify(tasks)); } catch (e) {}
    return tasks;
  } catch (err) {
    console.error("[불러오기 실패]", err);
    const raw = localStorage.getItem(localTasksKey(month));
    const cached = raw ? JSON.parse(raw) : [];
    setSaveStatus("error", "불러오기 실패 (클릭)");
    saveState.lastError = (err && err.message) || String(err);
    if (cached.length) {
      alert(
        `서버에서 '${month}' 데이터를 불러오지 못해, 이 브라우저에 저장된 사본(${cached.length}건)을 표시합니다.\n\n` +
        `이 상태에서 수정하면 서버 연결이 복구될 때 덮어쓰기 됩니다.\n\n오류: ${saveState.lastError}`
      );
    }
    return cached;
  }
}

// 저장 상태 표시 (헤더 우측)
const saveState = { timer: null, inFlight: false, pending: null, lastError: null };

function setSaveStatus(kind, text) {
  const el = document.getElementById("saveStatus");
  if (!el) return;
  el.className = "save-status save-" + kind;
  el.textContent = text;
  el.title = kind === "error" && saveState.lastError ? saveState.lastError : "";
}

// 모든 변경은 "해당 월 목록 전체 저장"으로 통일합니다.
// (개별 행 CRUD는 서버에 없는 행을 수정할 때 404로 조용히 실패하는 문제가 있었습니다)
async function persistTasks(month, tasks) {
  // 1) 항상 로컬에 먼저 저장 — 서버 저장이 실패해도 입력 내용이 사라지지 않도록
  try {
    localStorage.setItem(localTasksKey(month), JSON.stringify(tasks));
  } catch (e) { /* 용량 초과 등 무시 */ }

  if (!API_BASE) return;

  // 2) 서버 저장은 디바운스해서 한 번에 (연속 입력 시 과도한 요청 방지)
  saveState.pending = { month, tasks: JSON.parse(JSON.stringify(tasks)) };
  setSaveStatus("saving", "저장 중...");
  if (saveState.timer) clearTimeout(saveState.timer);
  saveState.timer = setTimeout(flushSave, 600);
}

async function flushSave() {
  if (saveState.inFlight || !saveState.pending) return;
  const job = saveState.pending;
  saveState.pending = null;
  saveState.inFlight = true;
  try {
    await apiFetchJson("/api/tasks", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ month: job.month, tasks: job.tasks })
    });
    saveState.lastError = null;
    const t = new Date();
    setSaveStatus("ok", `저장됨 ${String(t.getHours()).padStart(2, "0")}:${String(t.getMinutes()).padStart(2, "0")}`);
  } catch (err) {
    const msg = (err && err.message) || String(err);
    let hint = "";
    if (msg.includes("405")) {
      hint = "\n\n[원인] 서버의 api/tasks.js 가 예전 버전입니다. PUT(월 전체 저장) 처리가 없습니다." +
             "\n[해결] api/tasks.js 를 최신 파일로 올리고 Vercel에서 Redeploy 하세요.";
    } else if (msg.includes("404")) {
      hint = "\n\n[원인] /api/tasks 주소를 찾을 수 없습니다." +
             "\n[해결] api 폴더가 배포됐는지, Root Directory 설정이 맞는지 확인하세요.";
    } else if (msg.includes("500")) {
      hint = "\n\n[원인] 서버에서 오류가 났습니다. 보통 KV(데이터 저장소) 미연결입니다." +
             "\n[해결] Vercel > Storage 에서 KV 연결 후 Redeploy 하세요.";
    } else if (msg.includes("Failed to fetch")) {
      hint = "\n\n[원인] 서버에 요청이 닿지 않았습니다." +
             "\n[해결] Vercel > Settings > Deployment Protection 을 끄거나, 배포 상태를 확인하세요.";
    }
    saveState.lastError = msg + hint;
    console.error("[저장 실패]", err);
    setSaveStatus("error", "저장 실패 (클릭)");
  } finally {
    saveState.inFlight = false;
    if (saveState.pending) flushSave(); // 저장 중 들어온 변경 처리
  }
}

// 저장이 끝나기 전에 창을 닫으려 하면 경고
window.addEventListener("beforeunload", (e) => {
  if (saveState.pending || saveState.inFlight) {
    e.preventDefault();
    e.returnValue = "";
  }
});

async function loadSettings(month) {
  if (!API_BASE) {
    const raw = localStorage.getItem(localSettingsKey(month));
    return raw ? JSON.parse(raw) : { targetMM: { ...DEFAULT_TARGET_MM }, workDays: 20 };
  }
  const data = await apiFetchJson(`/api/settings?month=${encodeURIComponent(month)}`);
  return data.settings || { targetMM: { ...DEFAULT_TARGET_MM }, workDays: 20 };
}

async function saveSettings(month, settings) {
  if (!API_BASE) {
    localStorage.setItem(localSettingsKey(month), JSON.stringify(settings));
    return;
  }
  await apiFetchJson("/api/settings", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ month, settings })
  });
}

// ---------------- Derived calculations ----------------

function num(v) { const n = parseFloat(v); return isNaN(n) ? 0 : n; }

// ---------------- 날짜 표기 (MM/DD 입력 ↔ ISO 저장) ----------------

// 시트 연도: 월 탭은 연도를 갖지 않으므로 올해를 기준 연도로 사용합니다.
function sheetYear() { return new Date().getFullYear(); }

function isoToMMDD(iso) {
  if (!iso) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  return `${m[2]}/${m[3]}`;
}

// "9/4", "09/04", "0904", "9-4" 등을 YYYY-MM-DD 로 변환
function mmddToIso(text, year) {
  const raw = (text || "").trim();
  if (!raw) return "";
  let mm, dd;
  let m = /^(\d{1,2})\s*[\/\-.]\s*(\d{1,2})$/.exec(raw);
  if (m) { mm = +m[1]; dd = +m[2]; }
  else if (/^\d{4}$/.test(raw)) { mm = +raw.slice(0, 2); dd = +raw.slice(2); }
  else if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  else return "";
  if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return "";
  return `${year}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
}

function recomputeHours(task) {
  const total = num(task.hPlanner) + num(task.hDesigner) + num(task.hPublisher) + num(task.hGa) + num(task.hPm);
  task.hTotal = total;
  // SI 분류는 MM 계산에서 제외
  task.mm = task.major === "SI" ? 0 : +(total / MM_HOURS).toFixed(6);
}

// ---------------- Bootstrapping ----------------

async function init() {
  document.getElementById("apiModeLabel").textContent = API_BASE ? `Vercel API 연동 (${API_BASE})` : "로컬 데모 모드 (localStorage) — 아직 Vercel과 연결되지 않았습니다";
  state.months = await loadMonths();
  if (state.months.length === 0) {
    const now = new Date();
    state.months = [`${now.getMonth() + 1}월`];
    await saveMonths(state.months);
  }
  const savedAssignees = await loadAssignees();
  if (savedAssignees) {
    Object.keys(ASSIGNEE_OPTIONS).forEach(role => {
      if (Array.isArray(savedAssignees[role])) {
        ASSIGNEE_OPTIONS[role].splice(0, ASSIGNEE_OPTIONS[role].length, ...savedAssignees[role]);
      }
    });
  }
  applyCategories(await loadCategories());
  // 휴일 관리 (holiday.js): 서버 응답을 기다리느라 화면 전체가 멈추지 않도록 따로 불러오고, 도착하면 다시 그립니다.
  if (typeof loadHolidayData === "function") {
    loadHolidayData().then(() => {
      if (state.view === "holiday" && typeof renderHolidayView === "function") renderHolidayView();
      if (state.view === "summary") renderSummary();
    });
  }
  state.currentMonth = state.months[state.months.length - 1];
  await switchMonth(state.currentMonth);
  renderMonthTabs();
  bindGlobalControls();
}

async function switchMonth(month) {
  state.currentMonth = month;
  state.tasks = await loadTasks(month);
  state.settings = await loadSettings(month);
  state.tasks.forEach(recomputeHours);
  renumber();
  renderAll();
}

function renumber() {
  state.tasks.forEach((t, i) => { t.no = i + 1; });
}

// ---------------- Rendering: month tabs & top controls ----------------

function renderMonthTabs() {
  const wrap = document.getElementById("monthTabs");
  wrap.innerHTML = "";
  state.months.forEach(m => {
    const tabWrap = document.createElement("span");
    tabWrap.className = "month-tab-wrap";

    const btn = document.createElement("button");
    btn.className = "month-tab" + (m === state.currentMonth ? " active" : "");
    btn.textContent = `업무현황_${m}`;
    btn.onclick = () => switchMonth(m);
    tabWrap.appendChild(btn);

    const delBtn = document.createElement("button");
    delBtn.className = "month-tab-del";
    delBtn.textContent = "✕";
    delBtn.title = "이 월 시트 삭제";
    delBtn.onclick = (e) => { e.stopPropagation(); deleteMonth(m); };
    tabWrap.appendChild(delBtn);

    wrap.appendChild(tabWrap);
  });

  const addBtn = document.createElement("button");
  addBtn.className = "month-tab add";
  addBtn.textContent = "+ 새 월 시트";
  addBtn.onclick = addMonth;
  wrap.appendChild(addBtn);

  const spacer = document.createElement("span");
  spacer.className = "month-tabs-spacer";
  wrap.appendChild(spacer);

  const assigneeBtn = document.createElement("button");
  assigneeBtn.className = "month-tab assignee-settings-btn";
  assigneeBtn.textContent = "담당자 설정";
  assigneeBtn.onclick = openAssigneeSettings;
  wrap.appendChild(assigneeBtn);

  if (typeof openHolidaySettings === "function") {
    const holidayBtn = document.createElement("button");
    holidayBtn.className = "month-tab assignee-settings-btn";
    holidayBtn.textContent = "휴일 설정";
    holidayBtn.onclick = openHolidaySettings;
    wrap.appendChild(holidayBtn);
  }
}

async function addMonth() {
  const label = prompt("추가할 월을 입력하세요 (예: 10월)");
  if (!label) return;
  const clean = label.trim().endsWith("월") ? label.trim() : `${label.trim()}월`;
  if (state.months.includes(clean)) { alert("이미 존재하는 월입니다."); return; }
  state.months.push(clean);
  await saveMonths(state.months);
  renderMonthTabs();
  await switchMonth(clean);
}

async function deleteMonth(month) {
  const ok = confirm("입력된 정보가 모두 삭제됩니다. 삭제하시겠습니까?");
  if (!ok) return; // N: 삭제하지 않고 닫기

  state.months = state.months.filter(m => m !== month);
  await saveMonths(state.months);

  // 로컬 데모 모드일 때는 저장된 업무/설정 데이터도 함께 정리합니다.
  if (!API_BASE) {
    localStorage.removeItem(localTasksKey(month));
    localStorage.removeItem(localSettingsKey(month));
  }

  if (state.months.length === 0) {
    const now = new Date();
    const fallback = `${now.getMonth() + 1}월`;
    state.months = [fallback];
    await saveMonths(state.months);
  }

  if (state.currentMonth === month) {
    await switchMonth(state.months[state.months.length - 1]);
  } else {
    renderMonthTabs();
  }
}

function bindGlobalControls() {
  document.getElementById("btnAddRow").onclick = addRow;
  document.getElementById("btnDashboardView").onclick = () => setView("dashboard");
  document.getElementById("btnSummaryView").onclick = () => setView("summary");
  document.getElementById("btnSheetView").onclick = () => setView("sheet");
  const holidayViewBtn = document.getElementById("btnHolidayView");
  if (holidayViewBtn) holidayViewBtn.onclick = () => setView("holiday");
  document.getElementById("btnSettings").onclick = openSettings;
  document.getElementById("searchInput").oninput = (e) => { state.searchText = e.target.value; renderSheet(); };
  buildStatusFilter();
  document.getElementById("btnExport").onclick = exportExcel;
  document.getElementById("btnImport").onclick = triggerCsvImport;
  document.getElementById("csvFileInput").onchange = handleCsvFile;
  document.getElementById("btnCsvTemplate").onclick = exportCsvTemplate;
  document.getElementById("btnCategorySettings").onclick = openCategorySettings;
  document.getElementById("btnHealth").onclick = checkConnection;
  window.addEventListener("resize", () => requestAnimationFrame(applyFreezeOffsets));
  const saveEl = document.getElementById("saveStatus");
  if (saveEl) saveEl.onclick = () => {
    if (!saveState.lastError) return;
    if (confirm(`마지막 저장/불러오기 오류:\n\n${saveState.lastError}\n\n다시 저장을 시도할까요?`)) {
      persistTasks(state.currentMonth, state.tasks);
    }
  };
  document.getElementById("btnDashRefresh").onclick = renderDashboard;
  document.getElementById("brandHome").onclick = () => setView("dashboard");
  document.getElementById("btnWeeklyReport").onclick = generateWeeklyReport;
  document.getElementById("btnWeeklyReportCopy").onclick = copyWeeklyReport;
  document.getElementById("btnWeeklyReportDelete").onclick = deleteWeeklyReport;
}

function setView(view) {
  state.view = view;
  document.getElementById("btnDashboardView").classList.toggle("active", view === "dashboard");
  document.getElementById("btnSheetView").classList.toggle("active", view === "sheet");
  document.getElementById("btnSummaryView").classList.toggle("active", view === "summary");
  document.getElementById("dashboardPanel").style.display = view === "dashboard" ? "block" : "none";
  document.getElementById("sheetPanel").style.display = view === "sheet" ? "block" : "none";
  document.getElementById("summaryPanel").style.display = view === "summary" ? "block" : "none";
  const holidayViewBtn = document.getElementById("btnHolidayView");
  const holidayPanel = document.getElementById("holidayPanel");
  if (holidayViewBtn) holidayViewBtn.classList.toggle("active", view === "holiday");
  if (holidayPanel) holidayPanel.style.display = view === "holiday" ? "block" : "none";
  document.getElementById("sheetToolsGroup").style.display = view === "sheet" ? "flex" : "none";
  if (view === "summary") renderSummary();
  if (view === "holiday" && typeof renderHolidayView === "function") renderHolidayView();
  if (view === "dashboard") renderDashboard();
}

function renderAll() {
  renderMonthTabs();
  renderSheet();
  if (state.view === "summary") renderSummary();
  if (state.view === "dashboard") renderDashboard();
  if (state.view === "holiday" && typeof renderHolidayView === "function") renderHolidayView();
}

// ---------------- Row CRUD ----------------

async function addRow() {
  const t = emptyTask();
  t.id = uid();
  state.tasks.push(t);
  renumber();
  await persistTasks(state.currentMonth, state.tasks);
  renderSheet();
  renderDashboard();
}

// "완료" 버튼: 완료 ↔ 진행 전환. 완료로 바꿀 때 완료일이 비어있으면 오늘 날짜를 채웁니다.
async function toggleDone(id) {
  const t = state.tasks.find(x => x.id === id);
  if (!t) return;
  if (t.status === "완료") {
    t.status = "진행";
  } else {
    t.status = "완료";
    if (!t.doneDate) t.doneDate = todayStr();
  }
  await persistTasks(state.currentMonth, state.tasks);
  renderSheet();
  renderDashboard();
}

async function deleteRow(id) {
  if (!confirm("이 업무 행을 삭제할까요?")) return;
  state.tasks = state.tasks.filter(t => t.id !== id);
  renumber();
  await persistTasks(state.currentMonth, state.tasks);
  renderSheet();
  renderDashboard();
}

async function updateField(id, key, value) {
  const t = state.tasks.find(x => x.id === id);
  if (!t) return;
  t[key] = value;
  if (key === "major") {
    const opts = MINOR_CATEGORY_MAP[value] || [];
    if (!opts.includes(t.minor)) t.minor = "";
  }
  if (["hPlanner", "hDesigner", "hPublisher", "hGa", "hPm", "major"].includes(key)) {
    recomputeHours(t);
  }
  await persistTasks(state.currentMonth, state.tasks);
  // 대분류 변경(중분류 옵션 갱신) · 시간 입력(총합/MM 갱신) 등은 화면을 다시 그려야 반영됩니다.
  renderSheet();
  renderDashboard();
}

// ---------------- Sheet (업무현황) rendering ----------------

function groupLabel(group) {
  return ({
    meta: "관리", classify: "업무 분류", content: "업무 내용", requester: "요청",
    assignee: "업무 담당자", schedule: "일정", hours: "업무투입", note: "비고"
  })[group] || group;
}

// ---------------- 틀고정 (업무명까지 왼쪽 고정) ----------------

// 이 열까지 왼쪽에 고정하고, 오른쪽은 가로 스크롤합니다.
const FREEZE_UNTIL_KEY = "title";

function freezeIndex() {
  const i = COLUMNS.findIndex(c => c.key === FREEZE_UNTIL_KEY);
  return i === -1 ? -1 : i;
}

// 셀에 고정 표시만 해둡니다. 실제 left 값은 렌더 후 실측해서 넣습니다.
function markFrozen(cell, colIdx) {
  const f = freezeIndex();
  if (f < 0 || colIdx > f) return;
  cell.classList.add("sticky-col");
  cell.dataset.freezeIdx = String(colIdx);
  if (colIdx === f) cell.classList.add("sticky-edge");
}

// 열 너비는 내용에 따라 달라지므로, 선언값이 아닌 실제 렌더된 너비로 누적 위치를 계산합니다.
function applyFreezeOffsets() {
  const f = freezeIndex();
  if (f < 0) return;
  const headRow = document.getElementById("theadCols");
  if (!headRow || !headRow.children.length) return;

  const lefts = [];
  let acc = 0;
  for (let i = 0; i <= f && i < headRow.children.length; i++) {
    lefts[i] = acc;
    acc += headRow.children[i].getBoundingClientRect().width;
  }

  document.querySelectorAll("#sheetTable .sticky-col").forEach(cell => {
    const idx = Number(cell.dataset.freezeIdx);
    if (!Number.isNaN(idx) && lefts[idx] !== undefined) {
      cell.style.left = lefts[idx] + "px";
    }
  });
  // 그룹 헤더는 자신이 덮는 첫 열의 위치에 맞춥니다.
  document.querySelectorAll("#theadGroup th[data-freeze-start]").forEach(th => {
    const start = Number(th.dataset.freezeStart);
    th.classList.add("sticky-col");
    if (lefts[start] !== undefined) th.style.left = lefts[start] + "px";
  });
}

// ---------------- 진행현황 필터 ----------------

// 진행현황 항목별로 업무 목록만 추려 보는 드롭다운
function buildStatusFilter() {
  const sel = document.getElementById("statusFilter");
  if (!sel) return;
  const counts = {};
  state.tasks.forEach(t => {
    const k = t.status || "__blank__";
    counts[k] = (counts[k] || 0) + 1;
  });
  sel.innerHTML = "";
  sel.appendChild(new Option(`진행현황 전체 (${state.tasks.length})`, ""));
  OPTIONS.진행현황.forEach(st => {
    if (!counts[st]) return;                       // 해당 상태 업무가 없으면 숨김
    sel.appendChild(new Option(`${st} (${counts[st]})`, st));
  });
  if (counts.__blank__) sel.appendChild(new Option(`미지정 (${counts.__blank__})`, "__blank__"));
  sel.value = state.statusFilter;
  if (sel.value !== state.statusFilter) { state.statusFilter = ""; sel.value = ""; }
  sel.classList.toggle("is-active", Boolean(state.statusFilter));
  sel.onchange = () => { state.statusFilter = sel.value; renderSheet(); };
}

// ---------------- 셀 이동 (Enter / Shift+Enter) ----------------

// 값을 수정하면 표 전체가 다시 그려지므로, 이동할 위치를 기억해 두었다가
// 다시 그린 뒤에 그 칸으로 포커스를 돌려줍니다.
let pendingFocus = null;

function editableKeys() {
  return COLUMNS.filter(c => c.type !== "readonly").map(c => c.key);
}

function nextCellTarget(rowId, colKey, dir) {
  const keys = editableKeys();
  const ids = state.visibleRowIds || [];
  let ci = keys.indexOf(colKey);
  let ri = ids.indexOf(rowId);
  if (ci === -1 || ri === -1) return null;
  ci += dir;
  if (ci >= keys.length) { ci = 0; ri += 1; }      // 행 끝 → 다음 행 첫 칸
  if (ci < 0) { ci = keys.length - 1; ri -= 1; }   // 행 처음 → 이전 행 끝 칸
  if (ri < 0 || ri >= ids.length) return null;
  return { rowId: ids[ri], colKey: keys[ci] };
}

function applyPendingFocus() {
  if (!pendingFocus) return;
  const { rowId, colKey } = pendingFocus;
  pendingFocus = null;
  const el = document.querySelector(`[data-row-id="${rowId}"][data-col-key="${colKey}"]`);
  if (!el) return;
  el.focus();
  if (typeof el.select === "function") { try { el.select(); } catch (e) {} }
  el.scrollIntoView({ block: "nearest", inline: "nearest" });
}

function cellKeydown(e) {
  if (e.key !== "Enter") return;
  const el = e.currentTarget;
  // 여러 줄 입력칸(업무상세·비고)은 Enter를 줄바꿈으로 두고, Ctrl+Enter로 이동합니다.
  if (el.tagName === "TEXTAREA" && !e.ctrlKey) return;
  e.preventDefault();
  pendingFocus = nextCellTarget(el.dataset.rowId, el.dataset.colKey, e.shiftKey ? -1 : 1);
  if (!pendingFocus) { el.blur(); return; }
  el.blur();                      // change 이벤트 발생 → 저장 → 표 다시 그림
  setTimeout(applyPendingFocus, 0); // 값이 그대로여서 다시 그리지 않은 경우의 대비
}

// ---------------- 정렬 / 행 색상 ----------------

// 진행현황에 따른 행 배경색 클래스
function rowStatusClass(status) {
  if (status === "진행") return "row-progress";                // 하늘색
  if (status === "완료") return "row-done";                    // 회색
  if (["보류", "취소"].includes(status)) return "row-closed";  // 회색
  return "";
}

// 헤더 클릭: 오름차순 → 내림차순 → 정렬 해제(원래 순서)
function toggleSort(key) {
  if (state.sortKey !== key) {
    state.sortKey = key;
    state.sortDir = "asc";
  } else if (state.sortDir === "asc") {
    state.sortDir = "desc";
  } else {
    state.sortKey = null;
    state.sortDir = null;
  }
  renderSheet();
}

const NUMERIC_KEYS = ["no", "ticket", "hPlanner", "hDesigner", "hPublisher", "hGa", "hPm", "hTotal", "mm"];

function applySort(rows) {
  if (!state.sortKey) return rows;
  const key = state.sortKey;
  const dir = state.sortDir === "desc" ? -1 : 1;
  const isNum = NUMERIC_KEYS.includes(key);

  return [...rows].sort((a, b) => {
    const av = a[key], bv = b[key];
    const aEmpty = av === "" || av === null || av === undefined;
    const bEmpty = bv === "" || bv === null || bv === undefined;
    if (aEmpty && bEmpty) return 0;
    if (aEmpty) return 1;   // 빈 값은 방향과 무관하게 항상 아래로
    if (bEmpty) return -1;
    if (isNum) return (num(av) - num(bv)) * dir;
    return String(av).localeCompare(String(bv), "ko") * dir;
  });
}

function renderSheet() {
  const theadGroup = document.getElementById("theadGroup");
  const theadCols = document.getElementById("theadCols");
  const tbody = document.getElementById("tbody");
  theadGroup.innerHTML = ""; theadCols.innerHTML = ""; tbody.innerHTML = "";

  // grouped header row
  // 틀고정 경계(업무명)에 걸친 그룹은 두 칸으로 나눠야 고정/스크롤이 어긋나지 않습니다.
  const fIdx = freezeIndex();
  let i = 0;
  while (i < COLUMNS.length) {
    const g = COLUMNS[i].group;
    let span = 0;
    while (i + span < COLUMNS.length && COLUMNS[i + span].group === g) span++;

    const crosses = i <= fIdx && i + span - 1 > fIdx;
    const parts = crosses
      ? [{ start: i, span: fIdx - i + 1, label: groupLabel(g) },
         { start: fIdx + 1, span: i + span - fIdx - 1, label: "" }]
      : [{ start: i, span, label: groupLabel(g) }];

    parts.forEach(part => {
      const th = document.createElement("th");
      th.colSpan = part.span;
      th.textContent = part.label;
      th.className = "group-" + g;
      if (part.start + part.span - 1 <= fIdx) th.dataset.freezeStart = String(part.start);
      theadGroup.appendChild(th);
    });
    i += span;
  }
  const actionsTh = document.createElement("th");
  actionsTh.colSpan = 2;
  actionsTh.textContent = "";
  theadGroup.appendChild(actionsTh);

  // column header row (클릭 시 정렬: 오름차순 → 내림차순 → 원래 순서)
  COLUMNS.forEach(col => {
    const th = document.createElement("th");
    th.className = "sortable";
    th.style.minWidth = col.width + "px";
    const arrow = state.sortKey === col.key ? (state.sortDir === "asc" ? " ▲" : " ▼") : "";
    th.textContent = col.label + arrow;
    markFrozen(th, COLUMNS.indexOf(col));
    if (state.sortKey === col.key) th.classList.add("sorted");
    th.title = "클릭하면 정렬됩니다";
    th.onclick = () => toggleSort(col.key);
    theadCols.appendChild(th);
  });
  const thDone = document.createElement("th");
  thDone.textContent = "완료";
  theadCols.appendChild(thDone);
  const th2 = document.createElement("th");
  th2.textContent = "삭제";
  theadCols.appendChild(th2);

  const q = state.searchText.trim().toLowerCase();
  const sf = state.statusFilter;
  let rows = state.tasks.filter(t => {
    if (sf === "__blank__") { if (t.status) return false; }
    else if (sf && t.status !== sf) return false;
    if (!q) return true;
    return (t.title || "").toLowerCase().includes(q) || (t.detail || "").toLowerCase().includes(q) || (t.ticket || "").toLowerCase().includes(q);
  });
  rows = applySort(rows);

  rows.forEach(task => {
    const tr = document.createElement("tr");
    tr.className = rowStatusClass(task.status);
    COLUMNS.forEach((col, colIdx) => {
      const td = document.createElement("td");
      markFrozen(td, colIdx);
      td.appendChild(renderCell(task, col));
      // Enter 이동을 위해 각 입력 요소에 위치 정보를 붙입니다.
      td.querySelectorAll("input, select, textarea").forEach(el => {
        if (el.classList.contains("date-picker")) return; // 숨겨진 달력 입력은 제외
        el.dataset.rowId = task.id;
        el.dataset.colKey = col.key;
        el.addEventListener("keydown", cellKeydown);
      });
      tr.appendChild(td);
    });
    const doneTd = document.createElement("td");
    const doneBtn = document.createElement("button");
    const isDone = task.status === "완료";
    doneBtn.className = "row-done-btn" + (isDone ? " is-done" : "");
    doneBtn.textContent = isDone ? "완료됨" : "완료";
    doneBtn.title = isDone ? "클릭하면 '진행'으로 되돌립니다" : "클릭하면 '완료'로 변경하고 완료일을 오늘로 채웁니다";
    doneBtn.onclick = () => toggleDone(task.id);
    doneTd.appendChild(doneBtn);
    tr.appendChild(doneTd);

    const delTd = document.createElement("td");
    const delBtn = document.createElement("button");
    delBtn.className = "row-del";
    delBtn.textContent = "✕";
    delBtn.onclick = () => deleteRow(task.id);
    delTd.appendChild(delBtn);
    tr.appendChild(delTd);
    tbody.appendChild(tr);
  });

  document.getElementById("rowCount").textContent = `${rows.length} / ${state.tasks.length}건`;

  // Enter 이동이 현재 화면에 보이는 순서(정렬·검색 반영)를 따르도록 기록
  state.visibleRowIds = rows.map(t => t.id);
  buildStatusFilter();
  applyPendingFocus();
  // 레이아웃이 끝난 뒤 실제 열 너비로 고정 위치 계산
  requestAnimationFrame(applyFreezeOffsets);
}

function renderCell(task, col) {
  if (col.type === "readonly") {
    const span = document.createElement("span");
    span.className = "readonly-cell";
    span.textContent = col.key === "mm" ? num(task.mm).toFixed(2) : (task[col.key] ?? "");
    return span;
  }
  if (col.type === "ticket") {
    const wrap = document.createElement("div");
    wrap.className = "ticket-cell";
    const inp = document.createElement("input");
    inp.type = "text";
    inp.inputMode = "numeric";
    inp.placeholder = "번호";
    inp.value = task.ticket || "";
    inp.oninput = () => { inp.value = inp.value.replace(/[^0-9]/g, ""); };
    inp.onchange = () => updateField(task.id, "ticket", inp.value);
    const link = document.createElement("a");
    link.className = "ticket-link";
    link.textContent = "↗";
    link.title = "Redmine 이슈로 이동";
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    if (task.ticket) {
      link.href = redmineUrl(task.ticket);
    } else {
      link.classList.add("disabled");
      link.href = "javascript:void(0)";
    }
    wrap.appendChild(inp);
    wrap.appendChild(link);
    return wrap;
  }
  if (col.type === "select") {
    const sel = document.createElement("select");
    sel.appendChild(new Option("", ""));
    col.options.forEach(o => sel.appendChild(new Option(o, o, false, task[col.key] === o)));
    // 목록에서 사라진 값(담당자 삭제·분류 변경 등)도 데이터가 지워지지 않도록 그대로 표시
    const cur = task[col.key];
    if (cur && !col.options.includes(cur)) {
      sel.appendChild(new Option(`${cur} (목록에 없음)`, cur, false, true));
      sel.classList.add("value-missing");
    }
    sel.value = cur || "";
    sel.onchange = () => updateField(task.id, col.key, sel.value);
    return sel;
  }
  if (col.type === "select-dependent") {
    const sel = document.createElement("select");
    const opts = col.map[task[col.dependsOn]] || [];
    sel.appendChild(new Option("", ""));
    opts.forEach(o => sel.appendChild(new Option(o, o, false, task[col.key] === o)));
    const cur = task[col.key];
    if (cur && !opts.includes(cur)) {
      sel.appendChild(new Option(`${cur} (목록에 없음)`, cur, false, true));
      sel.classList.add("value-missing");
    }
    sel.value = cur || "";
    sel.disabled = opts.length === 0 && !cur;
    sel.onchange = () => updateField(task.id, col.key, sel.value);
    return sel;
  }
  if (col.type === "textarea") {
    const ta = document.createElement("textarea");
    ta.rows = 2;
    ta.value = task[col.key] || "";
    ta.onchange = () => updateField(task.id, col.key, ta.value);
    return ta;
  }
  if (col.type === "date") {
    const inp = document.createElement("input");
    inp.type = "date";
    inp.value = task[col.key] || "";
    inp.onchange = () => updateField(task.id, col.key, inp.value);
    return inp;
  }
  if (col.type === "datepick") {
    // MM/DD 직접 입력 + 달력 아이콘 클릭 시 네이티브 캘린더로 선택
    const wrap = document.createElement("div");
    wrap.className = "date-cell";

    const text = document.createElement("input");
    text.type = "text";
    text.className = "shortdate-input";
    text.placeholder = "MM/DD";
    text.maxLength = 5;
    text.value = isoToMMDD(task[col.key]);
    text.title = task[col.key] || "";

    const picker = document.createElement("input");
    picker.type = "date";
    picker.className = "date-picker";
    picker.value = task[col.key] || "";
    picker.tabIndex = -1;

    text.onchange = () => {
      const iso = mmddToIso(text.value, sheetYear());
      picker.value = iso;
      updateField(task.id, col.key, iso);
    };
    picker.onchange = () => {
      text.value = isoToMMDD(picker.value);
      updateField(task.id, col.key, picker.value);
    };

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "date-btn";
    btn.textContent = "📅";
    btn.title = "달력에서 선택";
    btn.onclick = () => {
      if (typeof picker.showPicker === "function") {
        try { picker.showPicker(); return; } catch (e) { /* 미지원 시 아래로 */ }
      }
      picker.focus();
      picker.click();
    };

    wrap.appendChild(text);
    wrap.appendChild(picker);
    wrap.appendChild(btn);
    return wrap;
  }
  if (col.type === "shortdate") {
    const inp = document.createElement("input");
    inp.type = "text";
    inp.className = "shortdate-input";
    inp.placeholder = "MM/DD";
    inp.maxLength = 5;
    inp.value = isoToMMDD(task[col.key]);
    inp.title = task[col.key] || "";
    inp.onchange = () => {
      const iso = mmddToIso(inp.value, sheetYear());
      updateField(task.id, col.key, iso);
    };
    return inp;
  }
  if (col.type === "number") {
    const inp = document.createElement("input");
    inp.type = "number";
    inp.step = "0.25";
    inp.value = task[col.key] ?? "";
    inp.onchange = () => updateField(task.id, col.key, inp.value);
    return inp;
  }
  const inp = document.createElement("input");
  inp.type = "text";
  inp.value = task[col.key] || "";
  if (col.maxLength) inp.maxLength = col.maxLength;
  inp.onchange = () => updateField(task.id, col.key, inp.value);
  return inp;
}

// ---------------- Summary (요약) rendering ----------------

function activeTasks() {
  // 건수 집계는 모든 상태 포함(원본 요약 시트와 동일), MM 집계는 major=SI만 제외
  return state.tasks;
}

// MM 표시: 소수점 둘째 자리까지 (0.00)
function fmtMM(v) { return num(v).toFixed(2); }

function renderSummary() {
  renderCountTable();
  renderMMTable();
  renderDetailMMTable();
}

function renderCountTable() {
  const el = document.getElementById("countTable");
  const majors = [...MAJOR_CATEGORIES];
  const statuses = OPTIONS.진행현황;
  const rows = majors.map(major => {
    const tasksInMajor = state.tasks.filter(t => t.major === major);
    const counts = statuses.map(s => tasksInMajor.filter(t => t.status === s).length);
    const total = tasksInMajor.length;
    return { major, total, counts };
  }).filter(r => r.total > 0 || true); // 모든 대분류 행 표시

  const grandTotal = rows.reduce((a, r) => a + r.total, 0);
  const grandCounts = statuses.map((_, i) => rows.reduce((a, r) => a + r.counts[i], 0));

  let html = `<h3>업무 건 수</h3><table class="summary-table"><thead><tr><th>구분</th><th>계</th>${statuses.map(s => `<th>${s}</th>`).join("")}</tr></thead><tbody>`;
  rows.forEach(r => {
    html += `<tr><td class="cell-label">${r.major}</td><td>${r.total}</td>${r.counts.map(c => `<td>${c || ""}</td>`).join("")}</tr>`;
  });
  html += `<tr class="total-row"><td class="cell-label">계</td><td>${grandTotal}</td>${grandCounts.map(c => `<td>${c || ""}</td>`).join("")}</tr>`;
  html += "</tbody></table>";
  el.innerHTML = html;
}

const ROLE_HOUR_KEYS = { 기획: "hPlanner", 디자인: "hDesigner", 퍼블: "hPublisher", GA: "hGa", PM: "hPm" };
const ROLES = ["기획", "디자인", "퍼블", "GA", "PM"];

function sumHoursByRole(tasks) {
  const sums = {};
  ROLES.forEach(r => { sums[r] = tasks.reduce((a, t) => a + num(t[ROLE_HOUR_KEYS[r]]), 0); });
  return sums;
}

function renderMMTable() {
  const el = document.getElementById("mmTable");
  const tasks = state.tasks.filter(t => t.major !== "SI");
  const hourSums = sumHoursByRole(tasks);
  // 휴일 관리에 등록된 담당자별 휴가 시간(해당 월)을 투입 MM에 더합니다.
  const leaveHours = typeof leaveHoursByRoleForMonth === "function" ? leaveHoursByRoleForMonth(state.currentMonth) : {};
  const mmByRole = {};
  const leaveMM = {};
  ROLES.forEach(r => {
    leaveMM[r] = (leaveHours[r] || 0) / MM_HOURS;
    mmByRole[r] = hourSums[r] / MM_HOURS + leaveMM[r];
  });
  const leaveMMTotal = ROLES.reduce((a, r) => a + leaveMM[r], 0);
  const target = state.settings.targetMM;

  let html = `<h3>${state.currentMonth} 업무별 투입 MM</h3><table class="summary-table"><thead><tr><th>구분</th>${ROLES.map(r => `<th>${r}</th>`).join("")}<th>계</th></tr></thead><tbody>`;
  html += `<tr><td class="cell-label">기준 MM</td>${ROLES.map(r => `<td>${target[r] != null && target[r] !== "" ? fmtMM(target[r]) : ""}</td>`).join("")}<td>${fmtMM(ROLES.reduce((a, r) => a + num(target[r]), 0))}</td></tr>`;
  const mmTotal = ROLES.reduce((a, r) => a + mmByRole[r], 0);
  html += `<tr><td class="cell-label">투입 MM</td>${ROLES.map(r => `<td>${fmtMM(mmByRole[r])}</td>`).join("")}<td>${fmtMM(mmTotal)}</td></tr>`;
  html += `<tr class="leave-mm-row"><td class="cell-label">ㄴ 휴가 포함</td>${ROLES.map(r => `<td title="${leaveHours[r] || 0}H">${leaveMM[r] ? fmtMM(leaveMM[r]) : "-"}</td>`).join("")}<td>${leaveMMTotal ? fmtMM(leaveMMTotal) : "-"}</td></tr>`;
  html += `<tr><td class="cell-label">투입률</td>${ROLES.map(r => `<td>${target[r] ? (mmByRole[r] / target[r] * 100).toFixed(1) + "%" : "-"}</td>`).join("")}<td>${(mmTotal / ROLES.reduce((a, r) => a + num(target[r]), 0) * 100 || 0).toFixed(1)}%</td></tr>`;
  html += "</tbody></table>";
  el.innerHTML = html;
}

function renderDetailMMTable() {
  const el = document.getElementById("detailMMTable");
  // 분류 설정에 등록된 대분류 순서대로 표시 (대분류명을 바꾸거나 삭제해도 오류 없이 동작)
  const majorGroups = MAJOR_CATEGORIES
    .map(major => ({ major, minors: MINOR_CATEGORY_MAP[major] || [] }))
    .filter(g => g.minors.length);
  let html = `<h3>대분류 · 중분류별 투입 MM</h3><table class="summary-table"><thead><tr><th>대분류</th><th>중분류</th>${ROLES.map(r => `<th>${r}</th>`).join("")}<th>계</th></tr></thead><tbody>`;
  majorGroups.forEach(g => {
    let subtotal = ROLES.reduce((acc, r) => ({ ...acc, [r]: 0 }), {});
    g.minors.forEach((minor, idx) => {
      const tasks = state.tasks.filter(t => t.major === g.major && t.minor === minor);
      const sums = sumHoursByRole(tasks);
      const mm = {}; ROLES.forEach(r => { mm[r] = sums[r] / MM_HOURS; subtotal[r] += mm[r]; });
      const rowTotal = ROLES.reduce((a, r) => a + mm[r], 0);
      html += `<tr>${idx === 0 ? `<td class="cell-label" rowspan="${g.minors.length + 1}">${g.major}</td>` : ""}<td class="cell-label">${minor}</td>${ROLES.map(r => `<td>${mm[r] ? fmtMM(mm[r]) : ""}</td>`).join("")}<td>${rowTotal ? fmtMM(rowTotal) : ""}</td></tr>`;
    });
    const subTotalSum = ROLES.reduce((a, r) => a + subtotal[r], 0);
    html += `<tr class="subtotal-row"><td class="cell-label">소계</td>${ROLES.map(r => `<td>${fmtMM(subtotal[r])}</td>`).join("")}<td>${fmtMM(subTotalSum)}</td></tr>`;
  });
  html += "</tbody></table>";
  el.innerHTML = html;
}

// ---------------- Dashboard rendering ----------------

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function daysBetween(fromStr, toStr) {
  const a = new Date(fromStr + "T00:00:00");
  const b = new Date(toStr + "T00:00:00");
  return Math.round((b - a) / 86400000);
}

function ddayLabel(dueDate) {
  const diff = daysBetween(todayStr(), dueDate); // 오늘 -> 마감일
  if (diff === 0) return "D-DAY";
  if (diff > 0) return `D-${diff}`;
  return `D+${Math.abs(diff)}`; // 지연
}

const WEEKDAY_KOR = ["일", "월", "화", "수", "목", "금", "토"];

function addDays(dateStr, n) {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// 차주(다음 주 월요일~일요일) 범위 계산
function nextWeekRange() {
  const today = todayStr();
  const dow = new Date(today + "T00:00:00").getDay(); // 0=일 ... 6=토
  const daysUntilNextMonday = ((8 - dow) % 7) || 7;
  const start = addDays(today, daysUntilNextMonday);
  const end = addDays(start, 6);
  return { start, end };
}

function formatDateWithWeekday(dateStr) {
  const dow = new Date(dateStr + "T00:00:00").getDay();
  const md = dateStr.slice(5).replace("-", "/");
  return `${md}(${WEEKDAY_KOR[dow]})`;
}

function pillHtml(text, tone) {
  return `<span class="pill pill-${tone || "neutral"}">${text}</span>`;
}

function statusTone(status) {
  if (status === "완료") return "done";
  if (status === "취소") return "muted";
  if (status === "진행" || status === "개발" || status === "검수") return "active";
  if (status === "보류") return "muted";
  return "wait";
}

function priorityTone(p) {
  if (p === "긴급") return "urgent";
  if (p === "상") return "warn";
  return "neutral";
}

function barRow(label, value, max, opts) {
  opts = opts || {};
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  const valueText = opts.format ? opts.format(value) : value;
  return `
    <div class="bar-row">
      <span class="bar-label">${label}</span>
      <div class="bar-track"><div class="bar-fill" style="width:${pct}%"></div></div>
      <span class="bar-value">${valueText}</span>
    </div>`;
}

function renderDashboard() {
  const tasks = state.tasks;
  const today = todayStr();

  const total = tasks.length;
  const inProgress = tasks.filter(t => t.status === "진행").length;
  const done = tasks.filter(t => t.status === "완료").length;
  const cancelled = tasks.filter(t => t.status === "취소").length;
  const overdue = tasks.filter(t => t.dueDate && t.dueDate < today && !["완료", "취소"].includes(t.status)).length;

  const mmTasks = tasks.filter(t => t.major !== "SI");
  const hourSums = sumHoursByRole(mmTasks);
  const mmByRole = {}; ROLES.forEach(r => { mmByRole[r] = hourSums[r] / MM_HOURS; });
  const mmTotal = ROLES.reduce((a, r) => a + mmByRole[r], 0);
  const targetTotal = ROLES.reduce((a, r) => a + num(state.settings.targetMM[r]), 0);
  const utilRate = targetTotal ? (mmTotal / targetTotal * 100) : 0;

  document.getElementById("dashTitle").textContent = `대시보드 · 업무현황_${state.currentMonth}`;

  // KPI 카드
  const kpis = [
    { label: "전체 업무", value: `${total}건` },
    { label: "진행중", value: `${inProgress}건` },
    { label: "완료", value: `${done}건` },
    { label: "취소", value: `${cancelled}건` },
    { label: "지연(마감 초과)", value: `${overdue}건`, warn: overdue > 0 },
    { label: "이번 달 투입 MM", value: `${mmTotal.toFixed(2)} / ${targetTotal.toFixed(2)}`, sub: `투입률 ${utilRate.toFixed(0)}%` }
  ];
  document.getElementById("dashKpis").innerHTML = kpis.map(k => `
    <div class="kpi-card ${k.warn ? "kpi-warn" : ""}">
      <div class="kpi-value">${k.value}</div>
      <div class="kpi-label">${k.label}</div>
      ${k.sub ? `<div class="kpi-sub">${k.sub}</div>` : ""}
    </div>`).join("");

  // 상태별 현황
  const statuses = OPTIONS.진행현황;
  const statusCounts = statuses.map(s => tasks.filter(t => t.status === s).length);
  const maxStatus = Math.max(1, ...statusCounts);
  document.getElementById("dashStatusCard").innerHTML =
    `<h3>진행현황별 업무</h3>` + statuses.map((s, i) => barRow(s, statusCounts[i], maxStatus)).join("");

  // 직무별 투입 MM (기준 대비 %)
  document.getElementById("dashMMCard").innerHTML =
    `<h3>직무별 투입 MM (기준 대비)</h3>` + ROLES.map(r => {
      const target = num(state.settings.targetMM[r]);
      const rate = target ? (mmByRole[r] / target * 100) : 0;
      return barRow(r, rate, 100, { format: () => `${mmByRole[r].toFixed(2)} / ${target} MM (${rate.toFixed(0)}%)` });
    }).join("");

  // 요청자별 업무현황 (요청자(U+) 기준, 미입력 제외, 건수 상위 8명)
  const reqCounts = {};
  tasks.forEach(t => {
    const name = (t.reqPerson || "").trim();
    if (!name) return;
    reqCounts[name] = (reqCounts[name] || 0) + 1;
  });
  const reqEntries = Object.entries(reqCounts).sort((a, b) => b[1] - a[1]).slice(0, 8);
  const maxReq = Math.max(1, ...reqEntries.map(e => e[1]));
  document.getElementById("dashRequesterCard").innerHTML =
    `<h3>요청자별 업무현황</h3>` + (reqEntries.length
      ? reqEntries.map(([name, cnt]) => barRow(escapeHtml(name), cnt, maxReq, { format: v => `${v}건` })).join("")
      : `<p class="dash-empty">요청자 정보가 입력된 업무가 없습니다.</p>`);

  renderAssigneeWorkload(tasks);

  // 마감임박 · 지연 업무 (완료/취소 제외, 마감일 있는 건 중 오늘 이후 3일 이내 또는 이미 지난 건)
  const dueSoon = tasks
    .filter(t => t.dueDate && !["완료", "취소"].includes(t.status))
    .filter(t => daysBetween(today, t.dueDate) <= 3)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
    .slice(0, 8);
  document.getElementById("dashDueCard").innerHTML =
    `<h3>마감임박 · 지연 업무</h3>` + (dueSoon.length ? `<div class="dash-list">${dueSoon.map(t => `
      <div class="dash-list-row">
        <span class="dday ${t.dueDate < today ? "dday-over" : ""}">${ddayLabel(t.dueDate)}</span>
        <span class="dash-list-title">${escapeHtml(t.title) || "(업무명 미입력)"}</span>
        ${pillHtml(t.status || "-", statusTone(t.status))}
      </div>`).join("")}</div>` : `<p class="dash-empty">임박한 마감 업무가 없습니다.</p>`);

  // 긴급/상 중요도 미해결 업무
  const urgent = tasks
    .filter(t => ["긴급", "상"].includes(t.priority) && !["완료", "취소"].includes(t.status))
    .sort((a, b) => (a.priority === b.priority ? 0 : a.priority === "긴급" ? -1 : 1))
    .slice(0, 8);
  document.getElementById("dashUrgentCard").innerHTML =
    `<h3>긴급 · 상 미해결 업무</h3>` + (urgent.length ? `<div class="dash-list">${urgent.map(t => `
      <div class="dash-list-row">
        ${pillHtml(t.priority, priorityTone(t.priority))}
        <span class="dash-list-title">${escapeHtml(t.title) || "(업무명 미입력)"}</span>
        ${pillHtml(t.status || "-", statusTone(t.status))}
      </div>`).join("")}</div>` : `<p class="dash-empty">긴급·상 미해결 업무가 없습니다.</p>`);

  // 차주(다음 주 월~일) 예정업무 — 완료예정일이 다음 주 범위에 들어오는 업무
  const { start: nwStart, end: nwEnd } = nextWeekRange();
  const nextWeekTasks = tasks
    .filter(t => t.dueDate && t.dueDate >= nwStart && t.dueDate <= nwEnd && !["완료", "취소"].includes(t.status))
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  document.getElementById("dashNextWeekCard").innerHTML =
    `<h3>차주 예정업무 (${formatDateWithWeekday(nwStart)} ~ ${formatDateWithWeekday(nwEnd)})</h3>` +
    (nextWeekTasks.length ? `<div class="dash-list">${nextWeekTasks.map(t => `
      <div class="dash-list-row">
        <span class="dday">${formatDateWithWeekday(t.dueDate)}</span>
        <span class="dash-list-title">${escapeHtml(t.title) || "(업무명 미입력)"}</span>
        ${t.priority ? pillHtml(t.priority, priorityTone(t.priority)) : ""}
        ${pillHtml(t.status || "-", statusTone(t.status))}
      </div>`).join("")}</div>` : `<p class="dash-empty">차주로 예정된 업무가 없습니다.</p>`);
}

// ---------- 담당자별 진행 중인 업무 건 수 ----------

// 담당자 역할 ↔ 업무현황 시트의 담당자 열 매핑
const ASSIGNEE_ROLE_KEYS = { 기획: "planner", 디자인: "designer", 퍼블: "publisher", GA: "ga" };

function renderAssigneeWorkload(tasks) {
  const el = document.getElementById("dashAssigneeCard");
  if (!el) return;

  // "진행 중"으로 볼 상태 (완료·취소·보류 제외)
  const ONGOING = ["진행", "개발", "검수", "대기", "검토", "접수", "예정"];
  const ongoing = tasks.filter(t => ONGOING.includes(t.status));

  const roles = Object.keys(ASSIGNEE_ROLE_KEYS).filter(r => (ASSIGNEE_OPTIONS[r] || []).length);
  let rows = [];
  roles.forEach(role => {
    const key = ASSIGNEE_ROLE_KEYS[role];
    (ASSIGNEE_OPTIONS[role] || []).forEach(name => {
      const mine = ongoing.filter(t => t[key] === name);
      rows.push({
        role, name,
        total: mine.length,
        active: mine.filter(t => t.status === "진행").length,
        waiting: mine.filter(t => ["대기", "검토", "접수", "예정"].includes(t.status)).length
      });
    });
  });

  // 담당자가 지정되지 않은 진행 중 업무
  const unassigned = ongoing.filter(t =>
    !Object.values(ASSIGNEE_ROLE_KEYS).some(k => (t[k] || "").trim())
  ).length;

  if (!rows.length) {
    el.innerHTML = `<h3>담당자별 진행 중인 업무</h3><p class="dash-empty">등록된 담당자가 없습니다. '담당자 설정'에서 추가하세요.</p>`;
    return;
  }

  const grand = rows.reduce((a, r) => a + r.total, 0);

  let html = `<h3>담당자별 진행 중인 업무</h3>
    <table class="summary-table assignee-load">
      <thead><tr><th>구분</th><th>담당자</th><th>진행</th><th>대기·예정</th><th>합계</th></tr></thead>
      <tbody>`;
  roles.forEach(role => {
    const group = rows.filter(r => r.role === role);
    if (!group.length) return;
    group.forEach((r, i) => {
      html += `<tr>
        ${i === 0 ? `<td class="cell-label" rowspan="${group.length}">${role}</td>` : ""}
        <td class="cell-label">${escapeHtml(r.name)}</td>
        <td>${r.active ? `<span class="count-hl">${r.active}</span>` : "-"}</td>
        <td>${r.waiting ? `<span class="count-sub">${r.waiting}</span>` : "-"}</td>
        <td>${r.total ? `<span class="count-hl">${r.total}</span>` : "-"}</td>
      </tr>`;
    });
  });
  html += `<tr class="total-row"><td class="cell-label" colspan="4">전체 진행 중</td><td><span class="count-hl">${grand}</span></td></tr>`;
  html += `</tbody></table>`;
  if (unassigned) {
    html += `<p class="dash-empty">※ 담당자 미지정 진행 중 업무 ${unassigned}건</p>`;
  }
  el.innerHTML = html;
}

// ---------------- Settings modal ----------------

function openSettings() {
  const modal = document.getElementById("settingsModal");
  modal.style.display = "flex";
  const form = document.getElementById("settingsForm");
  form.innerHTML = "";
  ROLES.forEach(r => {
    const row = document.createElement("div");
    row.className = "settings-row";
    row.innerHTML = `<label>${r} 기준 MM</label>`;
    const inp = document.createElement("input");
    inp.type = "number"; inp.step = "0.1";
    inp.value = state.settings.targetMM[r] ?? DEFAULT_TARGET_MM[r] ?? 0;
    inp.oninput = () => { state.settings.targetMM[r] = parseFloat(inp.value) || 0; };
    row.appendChild(inp);
    form.appendChild(row);
  });
  const wdRow = document.createElement("div");
  wdRow.className = "settings-row";
  wdRow.innerHTML = `<label>업무일수</label>`;
  const wdInp = document.createElement("input");
  wdInp.type = "number"; wdInp.value = state.settings.workDays || 20;
  wdInp.oninput = () => { state.settings.workDays = parseInt(wdInp.value) || 20; };
  wdRow.appendChild(wdInp);
  form.appendChild(wdRow);

  document.getElementById("btnSettingsClose").onclick = () => { modal.style.display = "none"; };
  document.getElementById("btnSettingsSave").onclick = async () => {
    await saveSettings(state.currentMonth, state.settings);
    modal.style.display = "none";
    renderSummary();
    renderDashboard();
  };
}

// ---------------- Assignee settings modal (담당자 설정) ----------------

let assigneeDraft = null;

function openAssigneeSettings() {
  assigneeDraft = {};
  Object.keys(ASSIGNEE_OPTIONS).forEach(role => {
    assigneeDraft[role] = [...ASSIGNEE_OPTIONS[role]];
  });
  const modal = document.getElementById("assigneeModal");
  modal.style.display = "flex";
  renderAssigneeForm();

  document.getElementById("btnAssigneeClose").onclick = () => {
    modal.style.display = "none";
    assigneeDraft = null;
  };
  document.getElementById("btnAssigneeSave").onclick = async () => {
    const btn = document.getElementById("btnAssigneeSave");
    btn.disabled = true;
    const label = btn.textContent;
    btn.textContent = "저장 중...";
    try {
      // 1) 이름이 바뀐 항목을 찾아, 이미 입력된 업무의 담당자 값도 함께 바꿔줍니다.
      const roleToKey = { 기획: "planner", 디자인: "designer", 퍼블: "publisher", GA: "ga" };
      const renames = [];
      Object.keys(ASSIGNEE_OPTIONS).forEach(role => {
        const before = ASSIGNEE_OPTIONS[role];
        const after = assigneeDraft[role];
        before.forEach((oldName, i) => {
          const newName = (after[i] || "").trim();
          if (newName && oldName !== newName) renames.push({ key: roleToKey[role], role, oldName, newName });
        });
      });

      // 2) 드롭다운 옵션 반영 (COLUMNS가 같은 배열을 참조하므로 제자리 교체)
      Object.keys(ASSIGNEE_OPTIONS).forEach(role => {
        const cleaned = assigneeDraft[role].map(v => v.trim()).filter(Boolean);
        ASSIGNEE_OPTIONS[role].splice(0, ASSIGNEE_OPTIONS[role].length, ...cleaned);
      });

      // 3) 기존 업무의 담당자 값 치환 후 저장
      if (renames.length) {
        let changed = false;
        state.tasks.forEach(t => {
          renames.forEach(({ key, oldName, newName }) => {
            if (t[key] === oldName) { t[key] = newName; changed = true; }
          });
        });
        if (changed) {
          await persistTasks(state.currentMonth, state.tasks);
        }
      }

      if (renames.length && typeof holidayApplyRenames === "function") await holidayApplyRenames(renames);

      await saveAssignees(ASSIGNEE_OPTIONS);

      modal.style.display = "none";
      assigneeDraft = null;
      renderSheet();   // 담당자 드롭다운 옵션 갱신
      renderDashboard();
    } catch (err) {
      console.error("담당자 설정 저장 실패:", err);
      alert(
        "담당자 설정을 서버에 저장하지 못했습니다.\n" +
        "이 브라우저에는 저장되었으니 화면에는 반영됩니다.\n\n" +
        "Vercel에 연결해 쓰시는 경우 api/assignees.js 파일을 올린 뒤 다시 배포(Redeploy)했는지 확인해주세요.\n\n" +
        `오류: ${err && err.message ? err.message : err}`
      );
      modal.style.display = "none";
      assigneeDraft = null;
      renderSheet();
    } finally {
      btn.disabled = false;
      btn.textContent = label;
    }
  };
}

function renderAssigneeForm() {
  const container = document.getElementById("assigneeForm");
  const roles = Object.keys(assigneeDraft);
  container.innerHTML = roles.map(role => `
    <div class="assignee-col">
      <h4>${role}</h4>
      <div class="assignee-list" data-role="${role}">
        ${assigneeDraft[role].map((name, i) => `
          <div class="assignee-row">
            <input type="text" value="${escapeHtml(name)}" data-role="${role}" data-idx="${i}" />
            <button type="button" class="assignee-del" data-role="${role}" data-idx="${i}">✕</button>
          </div>`).join("")}
      </div>
      <button type="button" class="btn btn-ghost btn-sm assignee-add" data-role="${role}">+ 추가</button>
    </div>`).join("");

  container.querySelectorAll(".assignee-row input").forEach(inp => {
    inp.oninput = () => { assigneeDraft[inp.dataset.role][+inp.dataset.idx] = inp.value; };
  });
  container.querySelectorAll(".assignee-del").forEach(btn => {
    btn.onclick = () => {
      assigneeDraft[btn.dataset.role].splice(+btn.dataset.idx, 1);
      renderAssigneeForm();
    };
  });
  container.querySelectorAll(".assignee-add").forEach(btn => {
    btn.onclick = () => {
      const role = btn.dataset.role;
      assigneeDraft[role].push(`${role}${assigneeDraft[role].length + 1}`);
      renderAssigneeForm();
    };
  });
}

// ---------------- 분류 설정 모달 (대분류 / 중분류) ----------------

let categoryDraft = null;
let categoryActiveMajor = null;

async function loadCategories() {
  if (!API_BASE) {
    const raw = localStorage.getItem(LOCAL_CATEGORIES_KEY);
    return raw ? JSON.parse(raw) : null;
  }
  try {
    const data = await apiFetchJson("/api/categories");
    return data.categories || null;
  } catch (e) {
    const raw = localStorage.getItem(LOCAL_CATEGORIES_KEY);
    return raw ? JSON.parse(raw) : null;
  }
}

async function saveCategories(categories) {
  try { localStorage.setItem(LOCAL_CATEGORIES_KEY, JSON.stringify(categories)); } catch (e) { /* 무시 */ }
  if (!API_BASE) return;
  await apiFetchJson("/api/categories", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ categories })
  });
}

function applyCategories(categories) {
  if (!categories) return;
  if (Array.isArray(categories.majors)) {
    MAJOR_CATEGORIES.splice(0, MAJOR_CATEGORIES.length, ...categories.majors);
  }
  if (categories.minors && typeof categories.minors === "object") {
    Object.keys(MINOR_CATEGORY_MAP).forEach(k => { delete MINOR_CATEGORY_MAP[k]; });
    Object.entries(categories.minors).forEach(([k, v]) => {
      MINOR_CATEGORY_MAP[k] = Array.isArray(v) ? [...v] : [];
    });
  }
}

function openCategorySettings() {
  categoryDraft = {
    majors: [...MAJOR_CATEGORIES],
    minors: JSON.parse(JSON.stringify(MINOR_CATEGORY_MAP))
  };
  categoryActiveMajor = categoryDraft.majors[0] || null;
  document.getElementById("categoryModal").style.display = "flex";
  renderCategoryForm();

  document.getElementById("btnCategoryClose").onclick = () => {
    document.getElementById("categoryModal").style.display = "none";
    categoryDraft = null;
  };
  document.getElementById("btnCategorySave").onclick = async () => {
    const btn = document.getElementById("btnCategorySave");
    btn.disabled = true;
    const label = btn.textContent;
    btn.textContent = "저장 중...";
    try {
      const majors = categoryDraft.majors.map(m => m.trim()).filter(Boolean);
      const minors = {};
      majors.forEach(m => {
        minors[m] = (categoryDraft.minors[m] || []).map(v => v.trim()).filter(Boolean);
      });
      applyCategories({ majors, minors });
      await saveCategories({ majors, minors });
      document.getElementById("categoryModal").style.display = "none";
      categoryDraft = null;
      // 서버 저장은 끝났으므로 화면 갱신 오류는 저장 실패로 안내하지 않음
      try { renderSheet(); renderSummary(); renderDashboard(); }
      catch (renderErr) { console.error("분류 변경 후 화면 갱신 오류:", renderErr); }
    } catch (err) {
      console.error("분류 설정 저장 실패:", err);
      alert(
        "분류 설정을 서버에 저장하지 못했습니다.\n" +
        "이 브라우저에는 저장되었으니 화면에는 반영됩니다.\n\n" +
        "Vercel에 연결해 쓰시는 경우 api/categories.js 파일을 올린 뒤 다시 배포(Redeploy)했는지 확인해주세요.\n\n" +
        `오류: ${err && err.message ? err.message : err}`
      );
      document.getElementById("categoryModal").style.display = "none";
      categoryDraft = null;
      renderSheet();
    } finally {
      btn.disabled = false;
      btn.textContent = label;
    }
  };
}

function renderCategoryForm() {
  const el = document.getElementById("categoryForm");
  const majors = categoryDraft.majors;
  if (!majors.includes(categoryActiveMajor)) categoryActiveMajor = majors[0] || null;
  const minors = categoryActiveMajor ? (categoryDraft.minors[categoryActiveMajor] || []) : [];

  el.innerHTML = `
    <div class="category-pane">
      <h4>대분류</h4>
      <div class="category-list">
        ${majors.map((m, i) => `
          <div class="category-row ${m === categoryActiveMajor ? "is-active" : ""}">
            <button type="button" class="category-pick" data-idx="${i}" title="중분류 편집">${m === categoryActiveMajor ? "▸" : "　"}</button>
            <input type="text" value="${escapeHtml(m)}" data-major-idx="${i}" />
            <button type="button" class="assignee-del" data-major-del="${i}">✕</button>
          </div>`).join("")}
      </div>
      <button type="button" class="btn btn-ghost btn-sm" id="btnAddMajor">+ 대분류 추가</button>
    </div>
    <div class="category-pane">
      <h4>중분류 ${categoryActiveMajor ? `· <span class="category-active-name">${escapeHtml(categoryActiveMajor)}</span>` : ""}</h4>
      ${categoryActiveMajor ? `
        <div class="category-list">
          ${minors.map((v, i) => `
            <div class="category-row">
              <input type="text" value="${escapeHtml(v)}" data-minor-idx="${i}" />
              <button type="button" class="assignee-del" data-minor-del="${i}">✕</button>
            </div>`).join("")}
        </div>
        <button type="button" class="btn btn-ghost btn-sm" id="btnAddMinor">+ 중분류 추가</button>
      ` : `<p class="dash-empty">왼쪽에서 대분류를 선택하세요.</p>`}
    </div>`;

  el.querySelectorAll("[data-major-idx]").forEach(inp => {
    inp.oninput = () => {
      const i = +inp.dataset.majorIdx;
      const oldName = categoryDraft.majors[i];
      const newName = inp.value;
      categoryDraft.majors[i] = newName;
      if (oldName !== newName) {
        categoryDraft.minors[newName] = categoryDraft.minors[oldName] || [];
        delete categoryDraft.minors[oldName];
        if (categoryActiveMajor === oldName) categoryActiveMajor = newName;
      }
    };
  });
  el.querySelectorAll(".category-pick").forEach(btn => {
    btn.onclick = () => { categoryActiveMajor = categoryDraft.majors[+btn.dataset.idx]; renderCategoryForm(); };
  });
  el.querySelectorAll("[data-major-del]").forEach(btn => {
    btn.onclick = () => {
      const i = +btn.dataset.majorDel;
      const name = categoryDraft.majors[i];
      if (!confirm(`'${name}' 대분류와 하위 중분류를 모두 삭제할까요?`)) return;
      categoryDraft.majors.splice(i, 1);
      delete categoryDraft.minors[name];
      renderCategoryForm();
    };
  });
  el.querySelectorAll("[data-minor-idx]").forEach(inp => {
    inp.oninput = () => { categoryDraft.minors[categoryActiveMajor][+inp.dataset.minorIdx] = inp.value; };
  });
  el.querySelectorAll("[data-minor-del]").forEach(btn => {
    btn.onclick = () => {
      categoryDraft.minors[categoryActiveMajor].splice(+btn.dataset.minorDel, 1);
      renderCategoryForm();
    };
  });
  const addMajor = el.querySelector("#btnAddMajor");
  if (addMajor) addMajor.onclick = () => {
    const name = `새 대분류${categoryDraft.majors.length + 1}`;
    categoryDraft.majors.push(name);
    categoryDraft.minors[name] = [];
    categoryActiveMajor = name;
    renderCategoryForm();
  };
  const addMinor = el.querySelector("#btnAddMinor");
  if (addMinor) addMinor.onclick = () => {
    categoryDraft.minors[categoryActiveMajor] = categoryDraft.minors[categoryActiveMajor] || [];
    categoryDraft.minors[categoryActiveMajor].push("");
    renderCategoryForm();
  };
}

// ---------------- CSV 내보내기 / 가져오기 ----------------

// 다운로드/업로드 공통 양식: 아래 열 순서·헤더 이름을 그대로 사용합니다.
// (업무현황 시트에 보이는 열과 동일하며, 자동계산 열인 총합/MM은 참고용으로만 내보냅니다.)
const CSV_COLUMNS = COLUMNS.filter(c => c.key !== "no");
const CSV_READONLY_KEYS = ["hTotal", "mm"];
const CSV_DATE_KEYS = COLUMNS.filter(c => c.type === "shortdate").map(c => c.key);

function csvEscape(v) {
  return `"${(v ?? "").toString().replace(/"/g, '""')}"`;
}

function exportCsv() {
  const header = ["NO", ...CSV_COLUMNS.map(c => c.label)].map(csvEscape).join(",");
  const lines = state.tasks.map(t => {
    const cells = CSV_COLUMNS.map(c => {
      let v = t[c.key] ?? "";
      if (CSV_DATE_KEYS.includes(c.key)) {
        // 일정은 MM/DD 로 내보내되, 엑셀이 날짜로 자동 변환해 "#######" 으로
        // 표시하지 않도록 ="10/08" 형태(텍스트 강제)로 기록합니다.
        const md = isoToMMDD(v);
        return md ? `"=""${md}"""` : `""`;
      }
      return csvEscape(v);
    });
    return [csvEscape(t.no), ...cells].join(",");
  });
  const csv = [header, ...lines].join("\r\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = `업무현황_${state.currentMonth}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// 빈 양식(헤더만) 다운로드 — 처음 업로드용 틀로 사용
function exportCsvTemplate() {
  const header = ["NO", ...CSV_COLUMNS.map(c => c.label)].map(csvEscape).join(",");
  const blob = new Blob(["\uFEFF" + header + "\r\n"], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = "업무현황_업로드양식.csv";
  a.click();
  URL.revokeObjectURL(url);
}

// ---------------- 엑셀 내보내기 (업무현황 엑셀 양식) ----------------
// "CSV 내보내기" 버튼 → 업무현황 엑셀 양식(.xlsx)으로 저장합니다. (xlsx.js 사용)
// 양식: 제목/기간·업무일/기준 MM 머리글, 그룹 머리글(업무 분류·업무 내용·업무 담당자·일정·업무투입),
//       검정 헤더, 상태별 색상, 하단 직무별 투입 H · M/M · 투입률 합계 행
const XL_COLS = [
  // [열, 머리글, task key, 폭, 종류]
  ["B", "NO", "no", 4.71, "no"],
  ["C", "배포", "deploy", 6.5, "center"],
  ["D", "대분류", "major", 8.5, "center"],
  ["E", "중분류", "minor", 10.86, "text"],
  ["F", "요청구분", "kind", 8, "center"],
  ["G", "중요도", "priority", 7.57, "center"],
  ["H", "업무명", "title", 58.86, "wrap"],
  ["I", "업무상세", "detail", 26.29, "wrap"],
  ["J", "요청팀\n(U+)", "reqTeam", 9.71, "wrap"],
  ["K", "요청자\n(U+)", "reqPerson", 8.5, "center"],
  ["L", "접수자\n(ML)", "pm", 8.5, "center"],
  ["M", "접수일", "receivedDate", 6.86, "date"],
  ["N", "시작일", "startDate", 6.86, "date"],
  ["O", "완료\n예정일", "dueDate", 6.86, "date"],
  ["P", "완료일", "doneDate", 6.86, "date"],
  ["Q", "진행\n현황", "status", 6.43, "status"],
  ["R", "검수\n(U+)", "reviewed", 6.5, "center"],
  ["S", "기획\n(H)", "hPlanner", 7, "hour"],
  ["T", "디자인\n(H)", "hDesigner", 7, "hour"],
  ["U", "퍼블\n(H)", "hPublisher", 7, "hour"],
  ["V", "GA\n(H)", "hGa", 7, "hour"],
  ["W", "PM\n(H)", "hPm", 7, "hour"],
  ["X", "총합\n(H)", "hTotal", 7.5, "total"],
  ["Y", "MM", "mm", 8.29, "mm"],
  ["Z", "비고", "note", 37.71, "wrap"]
];
const XL_ROLE_KEYS = ["기획", "디자인", "퍼블", "GA", "PM"];   // S~W 열 순서 (기준 MM)
const XL_ROLE_LABELS = ["기획", "디자인", "퍼블", "분석", "관리"];

// 셀 안 글자 길이로 행 높이 추정 (한글은 2칸으로 계산)
function xlEstimateLines(text, width) {
  const cap = Math.max(4, Math.floor(width * 1.15));
  return String(text || "").split(/\r?\n/).reduce((sum, line) => {
    let len = 0;
    for (const ch of line) len += /[ᄀ-ᇿ㄰-㆏가-힯　-鿿＀-￯]/.test(ch) ? 2 : 1;
    return sum + Math.max(1, Math.ceil(len / cap));
  }, 0);
}

// 순수 함수: 업무 목록 → 엑셀 통합문서 정의 (XlsxLite.build 에 전달)
function buildTaskWorkbookDef(tasks, opts) {
  const { year, month, title, sheetName, targetMM = {}, holidayCount = 0 } = opts;
  const FONT = "맑은 고딕";
  const GRID = "FF999999";
  const thin = ["thin", GRID];
  const box = { l: thin, r: thin, t: thin, b: thin };
  const st = (o) => Object.assign({ font: { name: FONT, sz: 9 } }, o);
  const cells = [];
  const put = (addr, v, s, extra) => {
    const m = /^([A-Z]+)(\d+)$/.exec(addr);
    let c = 0; for (const ch of m[1]) c = c * 26 + (ch.charCodeAt(0) - 64);
    cells.push(Object.assign({ r: +m[2], c, v, s }, extra || {}));
  };

  const FIRST = 7;
  const LAST = FIRST + tasks.length - 1;
  const H_ROW = LAST + 1, MM_ROW = LAST + 2, RATE_ROW = LAST + 3;
  const rng = (col) => `${col}${FIRST}:${col}${LAST}`;
  const pad = (n) => String(n).padStart(2, "0");
  const lastDay = new Date(year, month, 0).getDate();

  // ---- 1~3행: 제목 · 기간/업무일 · 기준 MM / 투입률 ----
  const roleHead = st({ align: { h: "center", v: "center" } });
  ["S", "T", "U", "V", "W"].forEach((col, i) => put(col + "1", XL_ROLE_LABELS[i], roleHead));
  put("X1", "총", roleHead);
  put("B2", title, st({ font: { name: FONT, sz: 16, b: true }, align: { v: "center" } }));
  const lab = st({ align: { h: "center", v: "center" } });
  put("M2", "시작일", lab); put("N2", "종료일", lab); put("O2", "휴일", lab); put("P2", "업무일", lab);
  ["S", "T", "U", "V", "W"].forEach((col, i) => put(col + "2", num(targetMM[XL_ROLE_KEYS[i]]), lab));
  put("X2", null, lab, { f: "SUM(S2:W2)" });

  const q = rng("Q");
  put("B3", null, st({ font: { name: FONT, sz: 10, b: true }, fill: "FFEFEFEF", align: { v: "center" } }), {
    f: `"ㄴ 총 "&COUNTA(${q})&"건 - 접수 "&COUNTIF(${q},"접수")&"건, 검토 "&COUNTIF(${q},"검토")&"건, 진행 "&COUNTIF(${q},"진행")&"건, 완료 "&COUNTIF(${q},"완료")&"건 / 예정 "&COUNTIF(${q},"예정")&"건, 대기 "&COUNTIF(${q},"대기")&"건, 보류 "&COUNTIF(${q},"보류")&"건, 취소 "&COUNTIF(${q},"취소")&"건"`
  });
  const gray = st({ fill: "FFEFEFEF", align: { h: "center", v: "center" } });
  put("M3", null, Object.assign({}, gray, { numFmt: 'm"/"d' }), { date: `${year}-${pad(month)}-01` });
  put("N3", null, Object.assign({}, gray, { numFmt: 'm"/"d' }), { date: `${year}-${pad(month)}-${pad(lastDay)}` });
  put("O3", holidayCount, gray);
  put("P3", null, gray, { f: "NETWORKDAYS(M3,N3)-O3" });
  const rateTop = st({ font: { name: FONT, sz: 9, color: "FF9900FF" }, fill: "FFF3F3F3", align: { h: "center", v: "center" }, numFmt: "0.00%" });
  ["S", "T", "U", "V", "W"].forEach(col => put(col + "3", null, rateTop, { f: `${col}${RATE_ROW}` }));
  put("X3", null, rateTop, { f: `Y${RATE_ROW}` });

  // ---- 5행: 그룹 머리글 / 6행: 열 머리글 ----
  const grp = st({ align: { h: "left", v: "center" }, border: box });
  const groups = [["B", "G", "업무 분류"], ["H", "I", "업무 내용"], ["J", "K", "요청"], ["L", "L", "업무 담당자"], ["M", "R", "일정"], ["S", "Y", "업무투입"], ["Z", "Z", ""]];
  const merges = ["B3:I3"];
  groups.forEach(([a, b, label]) => {
    const from = a.charCodeAt(0), to = b.charCodeAt(0);
    for (let c = from; c <= to; c++) put(String.fromCharCode(c) + "5", c === from ? label : null, grp);
    if (a !== b) merges.push(`${a}5:${b}5`);
  });
  const head = st({ font: { name: FONT, sz: 9, color: "FFFFFFFF" }, fill: "FF000000", align: { h: "center", v: "center", wrap: true }, border: box });
  XL_COLS.forEach(([col, label]) => put(col + "6", label, head));

  // ---- 7행~: 업무 ----
  const rowHeights = { 1: 19.5, 2: 23.25, 3: 19.5, 4: 9, 5: 16.5, 6: 34.5 };
  tasks.forEach((t, i) => {
    const r = FIRST + i;
    let lines = 1;
    XL_COLS.forEach(([col, , key, width, kind]) => {
      const addr = col + r;
      const border = col === "M" ? { l: ["medium", GRID], r: thin, t: thin, b: thin } : box;
      const base = { border, align: { h: "center", v: "center" } };
      const v = t[key];
      switch (kind) {
        case "no": put(addr, num(t.no) || i + 1, st(base)); break;
        case "date": put(addr, null, st(Object.assign(base, { numFmt: 'm"/"d' })), { date: v || "" }); break;
        case "hour": {
          const n = parseFloat(v);
          put(addr, isNaN(n) ? null : n, st(Object.assign(base, { fill: "FFFFF2CC", numFmt: "0.0_ " })));
          break;
        }
        case "total": put(addr, null, st(Object.assign(base, { align: { h: "right", v: "center" }, numFmt: "0.0_ ;[Red]\\-0.0\\ " })), { f: `SUM(S${r}:W${r})` }); break;
        case "mm": put(addr, null, st(Object.assign(base, { align: { h: "right", v: "center" }, numFmt: "0.00_ ;[Red]\\-0.00\\ " })), { f: `IF($D${r}="SI",0,X${r}/${MM_HOURS})` }); break;
        case "wrap":
          put(addr, v ?? "", st({ border: col === "H" ? { l: thin, r: thin, t: thin, b: ["thin", "FFB7B7B7"] } : box, align: { h: "left", v: "center", wrap: true } }));
          lines = Math.max(lines, xlEstimateLines(v, width));
          break;
        case "text": put(addr, v ?? "", st({ border: box, align: { h: "left", v: "center" } })); break;
        default: put(addr, v ?? "", st(base));
      }
    });
    rowHeights[r] = Math.min(180, Math.max(18, lines * 13.5 + 5));
  });

  // ---- 하단 합계: 직무별 투입 H / M/M / 투입률 ----
  const foot = (o) => st(Object.assign({ fill: "FFFFFFCC", border: box, align: { h: "center", v: "center" } }, o));
  const footRows = [[H_ROW, "직무별 투입 H"], [MM_ROW, "직무별 투입 M/M"], [RATE_ROW, "직무별 투입률"]];
  footRows.forEach(([r, label]) => {
    XL_COLS.forEach(([col]) => {
      const addr = col + r;
      const lastRow = r === RATE_ROW;
      const border = lastRow ? { l: col === "M" ? ["medium", GRID] : thin, r: thin, t: thin, b: ["medium", "FF000000"] }
        : (col === "M" ? { l: ["medium", GRID], r: thin, t: thin, b: thin } : box);
      if (col === "B") put(addr, "#2", foot({ font: { name: FONT, sz: 9, b: true }, border }));
      else if (col === "H") put(addr, label, foot({ align: { h: "left", v: "center" }, border }));
      else put(addr, null, foot({ border }));
    });
    rowHeights[r] = 18;
  });
  // 위에서 빈 셀로 깔아 둔 S~Y 합계 셀을 수식으로 교체
  const setF = (addr, f, style) => {
    const idx = cells.findIndex(c => XlsxLite.ref(c.r, c.c) === addr);
    if (idx >= 0) cells[idx] = Object.assign({}, cells[idx], { f, v: null, s: style || cells[idx].s });
  };
  const red = (fmt, border) => foot({ font: { name: FONT, sz: 9, b: true, color: "FFFF0000" }, align: { h: "right", v: "center" }, numFmt: fmt, border });
  ["S", "T", "U", "V", "W", "X"].forEach(col => {
    setF(`${col}${H_ROW}`, `SUM(${rng(col)})`, foot({ numFmt: "0.0" }));
    if (col !== "X") {
      setF(`${col}${MM_ROW}`, `SUMIFS(${rng(col)},${rng("D")},"<>SI")/${MM_HOURS}`, red("0.00_ ", box));
      setF(`${col}${RATE_ROW}`, `IFERROR(${col}${MM_ROW}/${col}2,0)`,
        foot({ numFmt: "0.00%", border: { l: thin, r: thin, t: thin, b: ["medium", "FF000000"] } }));
    }
  });
  setF(`Y${H_ROW}`, `SUM(${rng("Y")})`, foot({ align: { h: "right", v: "center" }, numFmt: "0.00" }));
  setF(`Y${MM_ROW}`, `Y${H_ROW}`, red("0.00_ ", box));
  setF(`Y${RATE_ROW}`, `IFERROR(Y${MM_ROW}/X2,0)`, foot({ numFmt: "0.00%", border: { l: thin, r: thin, t: thin, b: ["medium", "FF000000"] } }));

  // ---- 조건부 서식 (업무현황 양식과 동일한 색) ----
  const cf = [
    { sqref: `Q${FIRST}:Q${LAST}`, rules: [
      { type: "cellIs", formula: '"완료"', dxf: { fill: "FFFFC6C6", color: "FF000000" } },
      { type: "cellIs", formula: '"취소"', dxf: { fill: "FFB6D7A8", color: "FF000000" } },
      { type: "cellIs", formula: '"진행"', dxf: { fill: "FFC5DAFF", color: "FF000000" } }
    ] },
    { sqref: `G${FIRST}:G${LAST}`, rules: [
      { type: "cellIs", formula: '"긴급"', dxf: { color: "FFFF0000" } },
      { type: "cellIs", formula: '"상"', dxf: { color: "FFFF0000" } },
      { type: "cellIs", formula: '"중"', dxf: { color: "FF0066FF" } }
    ] },
    { sqref: `B${FIRST}:Z${LAST}`, rules: [
      { type: "expression", formula: `$Q${FIRST}="완료"`, dxf: { fill: "FFD9D9D9", color: "FF000000" } },
      { type: "expression", formula: `$Q${FIRST}="취소"`, dxf: { fill: "FFD9D9D9", color: "FF000000" } },
      { type: "expression", formula: `$Q${FIRST}="보류"`, dxf: { fill: "FFD9D9D9" } }
    ] },
    { sqref: `H${FIRST}:I${LAST} Z${FIRST}:Z${LAST}`, rules: [
      { type: "expression", formula: `$Q${FIRST}="진행"`, dxf: { fill: "FFEAF2FF" } }
    ] }
  ];

  return {
    sheets: [{
      name: sheetName,
      cols: [{ c: 1, width: 2.43 }].concat(XL_COLS.map(([col, , , width]) => ({ c: col.charCodeAt(0) - 64, width }))),
      rowHeights, cells, merges,
      freeze: { row: 6 },
      autoFilter: `B6:Z${LAST}`,
      landscapeFit: true,
      cf
    }]
  };
}

function exportExcel() {
  if (typeof XlsxLite === "undefined") { exportCsv(); return; } // xlsx.js 를 못 불러온 경우 기존 CSV로 저장
  if (!state.tasks.length) { alert("내보낼 업무가 없습니다."); return; }
  const year = sheetYear();
  const month = parseInt(state.currentMonth, 10) || (new Date().getMonth() + 1);
  // 해당 월 평일 중 공휴일 수 (휴일관리 데이터 기준)
  let holidayCount = 0;
  try {
    if (typeof hdHolidayMap === "function") {
      const map = hdHolidayMap();
      const prefix = `${year}-${String(month).padStart(2, "0")}-`;
      holidayCount = Object.keys(map).filter(d => {
        if (!d.startsWith(prefix)) return false;
        const dow = new Date(d + "T00:00:00").getDay();
        return dow !== 0 && dow !== 6;
      }).length;
    }
  } catch (e) { holidayCount = 0; }

  const biz = !!window.APP_NS;
  const def = buildTaskWorkbookDef(state.tasks, {
    year, month,
    title: `${biz ? "디지털사업 " : ""}업무현황_${String(year).slice(2)}년 ${month}월`,
    sheetName: `업무현황_${month}월`,
    targetMM: (state.settings && state.settings.targetMM) || DEFAULT_TARGET_MM,
    holidayCount
  });
  const blob = XlsxLite.build(def);
  const now = new Date();
  const stamp = `${String(now.getFullYear()).slice(2)}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `업무현황_${state.currentMonth}${biz ? "_" + window.APP_NS : ""}_${stamp}.xlsx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// 따옴표/줄바꿈을 포함한 CSV를 안전하게 파싱
function parseCsv(text) {
  const rows = [];
  let row = [], field = "", inQuotes = false;
  const s = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (inQuotes) {
      if (ch === '"') {
        if (s[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += ch;
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(field); field = "";
    } else if (ch === "\n") {
      row.push(field); field = "";
      rows.push(row); row = [];
    } else if (ch === "\r") {
      // 무시 (\r\n 처리)
    } else {
      field += ch;
    }
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows.filter(r => r.some(c => (c || "").trim() !== ""));
}

function triggerCsvImport() {
  document.getElementById("csvFileInput").click();
}

async function handleCsvFile(e) {
  const file = e.target.files && e.target.files[0];
  e.target.value = ""; // 같은 파일 재선택 허용
  if (!file) return;

  const text = await file.text();
  const rows = parseCsv(text);
  if (rows.length < 2) { alert("데이터 행이 없습니다. 헤더 아래에 업무를 입력한 뒤 다시 올려주세요."); return; }

  const headers = rows[0].map(h => (h || "").trim());
  // 헤더 이름 -> 컬럼 key 매핑 (양식 열이 일부 빠지거나 순서가 달라도 동작)
  const labelToKey = {};
  CSV_COLUMNS.forEach(c => { labelToKey[c.label] = c.key; });
  const colIndex = {};
  headers.forEach((h, i) => { if (labelToKey[h]) colIndex[labelToKey[h]] = i; });

  const mappedCount = Object.keys(colIndex).length;
  if (mappedCount === 0) {
    alert("양식의 헤더를 인식하지 못했습니다.\n'양식 받기'로 받은 CSV 파일의 첫 줄(헤더)을 그대로 유지한 채 올려주세요.");
    return;
  }

  const mode = confirm(
    `CSV에서 ${rows.length - 1}건을 읽었습니다.\n\n` +
    `[확인] 기존 ${state.tasks.length}건을 모두 지우고 교체\n` +
    `[취소] 기존 목록 뒤에 추가`
  ) ? "replace" : "append";

  const year = sheetYear();
  const imported = [];
  const skipped = [];
  rows.slice(1).forEach((r, idx) => {
    const t = emptyTask();
    t.id = uid();
    Object.entries(colIndex).forEach(([key, i]) => {
      if (CSV_READONLY_KEYS.includes(key)) return; // 총합/MM은 다시 계산
      let v = (r[i] ?? "").trim();
      // 내보내기에서 쓴 텍스트 강제 형식( ="10/08" )을 되돌립니다.
      const m = /^="(.*)"$/.exec(v);
      if (m) v = m[1];
      if (CSV_DATE_KEYS.includes(key)) v = mmddToIso(v, year);
      t[key] = v;
    });
    if (!(t.title || "").trim() && !(t.ticket || "").trim()) { skipped.push(idx + 2); return; }
    recomputeHours(t);
    imported.push(t);
  });

  if (!imported.length) { alert("업로드할 유효한 행이 없습니다. (업무명 또는 티켓번호가 비어있는 행은 건너뜁니다)"); return; }

  state.tasks = mode === "replace" ? imported : [...state.tasks, ...imported];
  renumber();
  await persistTasks(state.currentMonth, state.tasks);

  renderSheet();
  renderDashboard();
  alert(`${imported.length}건을 불러왔습니다.${skipped.length ? `\n(건너뛴 행: ${skipped.length}개)` : ""}`);
}

// ---------------- 연결 확인 (진단) ----------------

async function checkConnection() {
  if (!API_BASE) {
    alert("현재 로컬 데모 모드입니다.\nconfig.js의 API_BASE에 Vercel 주소를 넣으면 서버와 연결됩니다.");
    return;
  }
  const btn = document.getElementById("btnHealth");
  btn.disabled = true;
  const label = btn.textContent;
  btn.textContent = "확인 중...";

  const lines = [];
  let readOk = false, writeOk = false, readErr = "", writeErr = "";

  // 1단계: 읽기 테스트 (단순 GET — CORS 사전확인 없음)
  try {
    const res = await fetch(`${API_BASE}/api/health`);
    if (res.ok) {
      const d = await res.json();
      readOk = true;
      lines.push(`① 읽기(GET)      : 정상  [Node ${d.node} / KV ${d.kv}]`);
      if (!d.kvEnvDetected) lines.push("   ※ KV 환경변수 미감지 — Vercel > Storage 에서 KV 연결 필요");
    } else {
      readErr = `HTTP ${res.status}`;
      lines.push(`① 읽기(GET)      : 실패  [${readErr}]`);
    }
  } catch (e) {
    readErr = (e && e.message) || String(e);
    lines.push(`① 읽기(GET)      : 실패  [${readErr}]`);
  }

  // 2단계: 쓰기 테스트 (PUT — CORS 사전확인 OPTIONS 발생. 실제 데이터는 건드리지 않음)
  try {
    const res = await fetch(`${API_BASE}${withNs("/api/tasks")}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ month: "__연결테스트__", tasks: [] })
    });
    if (res.ok) {
      writeOk = true;
      lines.push("② 쓰기(PUT)      : 정상");
    } else {
      let detail = "";
      try { const b = await res.json(); detail = b.error ? ` - ${b.error}` : ""; } catch (e) {}
      writeErr = `HTTP ${res.status}${detail}`;
      lines.push(`② 쓰기(PUT)      : 실패  [${writeErr}]`);
    }
  } catch (e) {
    writeErr = (e && e.message) || String(e);
    lines.push(`② 쓰기(PUT)      : 실패  [${writeErr}]`);
  }

  // 진단 결과
  lines.push("");
  if (readOk && writeOk) {
    lines.push("▶ 모두 정상입니다. 입력한 값이 서버에 저장됩니다.");
  } else if (readOk && !writeOk) {
    if (writeErr.includes("405")) {
      lines.push("▶ 서버의 api/tasks.js 가 구버전입니다 (PUT 처리 없음).");
      lines.push("   api/tasks.js 를 최신 파일로 올리고 Redeploy 하세요.");
    } else if (writeErr.includes("Failed to fetch")) {
      lines.push("▶ 읽기는 되는데 쓰기만 막혔습니다. CORS 사전확인(OPTIONS) 차단입니다.");
      lines.push("   확인 1) api/_cors.js 가 배포됐는지 (OPTIONS 응답 담당)");
      lines.push("   확인 2) api/tasks.js 가 withApi 를 쓰는 최신 버전인지");
      lines.push("   확인 3) Vercel > Settings > Deployment Protection 끄기");
      lines.push("   확인 4) Vercel > Firewall 의 Attack Challenge Mode 끄기");
    } else {
      lines.push("▶ 쓰기 요청이 서버에서 거부됐습니다. 위 오류 코드를 확인하세요.");
    }
  } else {
    lines.push("▶ 서버에 요청 자체가 닿지 않습니다.");
    lines.push(`   주소창에 ${API_BASE}/api/health 를 직접 열어보세요.`);
    lines.push("   JSON이 보이면 config.js 의 API_BASE 주소 문제입니다.");
  }

  alert(`연결 진단 결과\n${"-".repeat(34)}\n` + lines.join("\n"));
  btn.disabled = false;
  btn.textContent = label;
}

// ---------------- 주간보고 작성 (주간보고_자동화_정책 기준) ----------------

function toDateStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function reportDateRange() {
  const end = new Date(); end.setHours(0, 0, 0, 0);
  const start = new Date(end);
  while (start.getDay() !== 4) start.setDate(start.getDate() - 1); // 4 = 목요일, 작성일 직전(당일 포함) 목요일까지 거슬러 올라감
  return { start, end };
}

function mdShort(dateStr) {
  return dateStr ? dateStr.slice(5).replace("-", "/") : "";
}

// 업무 한 줄 만들기 — [대분류, 중분류] 업무명(날짜)_비고
function reportLine(t, dateStr) {
  const major = (t.major || "").trim();
  const minor = (t.minor || "").trim();
  let head = "";
  if (major && minor) head = `[${major}, ${minor}] `;
  else if (major) head = `[${major}] `;

  const date = dateStr ? `(${dateStr})` : "";
  const note = (t.note || "").trim() ? `_${(t.note || "").trim()}` : "";
  return `${head}${t.title}${date}${note}`;
}

// 업무상세를 하위 항목으로 붙입니다 (줄 단위).
function reportSubLines(t) {
  const detail = (t.detail || "").trim();
  if (!detail) return [];
  return detail.split(/\r?\n/)
    .map(l => l.trim())
    .filter(Boolean)
    .map(l => (/^([-•└]|\d+\))/.test(l) ? `  ${l}` : `  - ${l}`));
}

// 한 섹션(제목 + 업무 목록) 출력
function pushSection(lines, title, items, datePicker) {
  lines.push(title);
  lines.push("");
  if (!items.length) { lines.push(""); return; }
  items.forEach(t => {
    lines.push(reportLine(t, datePicker(t)));
    reportSubLines(t).forEach(l => lines.push(l));
    lines.push("");
  });
  lines.push("");
}

async function generateWeeklyReport() {
  const btn = document.getElementById("btnWeeklyReport");
  btn.disabled = true;
  const originalLabel = btn.textContent;
  btn.textContent = "작성 중...";
  try {
    const { start, end } = reportDateRange();
    const startStr = toDateStr(start), endStr = toDateStr(end);

    // 정책: 작성일이 속한 월의 "업무현황_N월" 시트를 참고
    const targetMonth = `${end.getMonth() + 1}월`;
    const monthExists = state.months.includes(targetMonth);
    const refMonth = monthExists ? targetMonth : state.currentMonth;
    const tasks = (refMonth === state.currentMonth) ? state.tasks : await loadTasks(refMonth);

    // 공통 규칙: 취소 제외, 업무명 공란 제외
    const valid = tasks.filter(t => t.status !== "취소" && (t.title || "").trim());

    // GA는 별도 섹션으로 빼고, 나머지를 완료/진행/접수로 나눕니다.
    const gaList = valid.filter(t => t.major === "GA");
    const rest = valid.filter(t => t.major !== "GA");

    // 완료: 완료일이 대상 기간 내
    const doneList = rest
      .filter(t => t.status === "완료" && t.doneDate && t.doneDate >= startStr && t.doneDate <= endStr)
      .sort((a, b) => a.doneDate.localeCompare(b.doneDate));
    const deployCount = doneList.filter(t => t.deploy === "O").length;

    // 진행: 진행/대기/공란(접수일 기재) — 완료예정일 오름차순, 미정은 뒤로
    const progressList = rest
      .filter(t => t.status === "진행" || t.status === "대기" || (!t.status && t.receivedDate))
      .map((t, idx) => ({ t, idx }))
      .sort((a, b) => {
        const ad = a.t.dueDate, bd = b.t.dueDate;
        if (ad && bd) return ad.localeCompare(bd);
        if (ad && !bd) return -1;
        if (!ad && bd) return 1;
        return a.idx - b.idx;
      })
      .map(x => x.t);

    // 접수(검토 중)
    const receivedList = rest
      .filter(t => ["접수", "검토"].includes(t.status))
      .sort((a, b) => (a.receivedDate || "").localeCompare(b.receivedDate || ""));

    // 완료일을 특정할 수 없는 완료 건
    const needCheck = rest.filter(t => t.status === "완료" && !t.doneDate);

    const lines = [];

    pushSection(lines,
      `▧ 완료 ${doneList.length}건${deployCount ? `(배포 ${deployCount}건)` : ""}`,
      doneList, t => mdShort(t.doneDate));

    pushSection(lines, `▧ 진행 ${progressList.length}건`,
      progressList, t => t.dueDate ? mdShort(t.dueDate) : "일정 협의 중");

    pushSection(lines, `▧ 접수(검토 중) ${receivedList.length}건`,
      receivedList, t => t.receivedDate ? mdShort(t.receivedDate) : "");

    pushSection(lines, `▧ GA ${gaList.length}건`,
      gaList, t => t.dueDate ? mdShort(t.dueDate) : (t.doneDate ? mdShort(t.doneDate) : ""));

    lines.push("----------");
    lines.push("• 기업 중점 과제");
    lines.push("");

    if (needCheck.length) {
      lines.push("----------");
      lines.push("※ 확인 필요 (완료 상태이나 완료일이 없어 집계에서 제외)");
      lines.push("");
      needCheck.forEach(t => {
        const recv = t.receivedDate ? `(접수일 ${mdShort(t.receivedDate)})` : "(접수일 미상)";
        lines.push(`${reportLine(t, "")} ${recv}`);
      });
    }

    showWeeklyReport(lines.join("\n"));
  } finally {
    btn.disabled = false;
    btn.textContent = originalLabel;
  }
}

function showWeeklyReport(text) {
  document.getElementById("weeklyReportBox").style.display = "block";
  document.getElementById("weeklyReportText").textContent = text;
  document.getElementById("weeklyReportBox").scrollIntoView({ behavior: "smooth", block: "nearest" });
}

async function copyWeeklyReport() {
  const text = document.getElementById("weeklyReportText").textContent;
  try {
    await navigator.clipboard.writeText(text);
    const btn = document.getElementById("btnWeeklyReportCopy");
    const original = btn.textContent;
    btn.textContent = "복사됨!";
    setTimeout(() => { btn.textContent = original; }, 1200);
  } catch (e) {
    alert("클립보드 복사에 실패했습니다. 직접 선택해 복사해주세요.");
  }
}

function deleteWeeklyReport() {
  document.getElementById("weeklyReportBox").style.display = "none";
  document.getElementById("weeklyReportText").textContent = "";
}

window.addEventListener("DOMContentLoaded", init);
