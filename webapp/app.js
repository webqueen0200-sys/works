// ============================================================
// app.js — 업무관리 시트 프론트엔드 로직
// ============================================================

const state = {
  months: [],          // ["8월","9월",...]
  currentMonth: null,
  tasks: [],           // 현재 월의 업무 배열
  settings: { targetMM: { ...DEFAULT_TARGET_MM }, workDays: 20 },
  view: "dashboard",    // "dashboard" | "sheet" | "summary"
  searchText: ""
};

// ---------------- Storage layer (Vercel API 또는 localStorage) ----------------

const LOCAL_MONTHS_KEY = "wm_months_v1";
const LOCAL_ASSIGNEES_KEY = "wm_assignees_v1";
function localMonthsKey() { return LOCAL_MONTHS_KEY; }
function localTasksKey(month) { return `wm_tasks_v1_${month}`; }
function localSettingsKey(month) { return `wm_settings_v1_${month}`; }

function uid() {
  return (crypto.randomUUID ? crypto.randomUUID() : "id_" + Date.now() + "_" + Math.random().toString(16).slice(2));
}

async function apiFetchJson(path, options) {
  const res = await fetch(API_BASE + path, options);
  if (!res.ok) throw new Error("API 오류: " + res.status);
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
    return null;
  }
}

async function saveAssignees(assignees) {
  if (!API_BASE) {
    localStorage.setItem(LOCAL_ASSIGNEES_KEY, JSON.stringify(assignees));
    return;
  }
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
  const data = await apiFetchJson(`/api/tasks?month=${encodeURIComponent(month)}`);
  return data.tasks || [];
}

async function persistTasks(month, tasks) {
  if (!API_BASE) {
    localStorage.setItem(localTasksKey(month), JSON.stringify(tasks));
    return;
  }
  // Vercel 모드: 서버가 개별 CRUD를 담당하므로 여기서는 아무것도 하지 않음
}

async function apiCreateTask(month, task) {
  if (!API_BASE) return task;
  return apiFetchJson("/api/tasks", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ month, task })
  });
}

async function apiUpdateTask(month, id, patch) {
  if (!API_BASE) return;
  await apiFetchJson(`/api/tasks/${encodeURIComponent(id)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ month, patch })
  });
}

async function apiDeleteTask(month, id) {
  if (!API_BASE) return;
  await apiFetchJson(`/api/tasks/${encodeURIComponent(id)}?month=${encodeURIComponent(month)}`, { method: "DELETE" });
}

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
  document.getElementById("btnSettings").onclick = openSettings;
  document.getElementById("searchInput").oninput = (e) => { state.searchText = e.target.value; renderSheet(); };
  document.getElementById("btnExport").onclick = exportCsv;
  document.getElementById("btnImport").onclick = triggerCsvImport;
  document.getElementById("csvFileInput").onchange = handleCsvFile;
  document.getElementById("btnCsvTemplate").onclick = exportCsvTemplate;
  document.getElementById("btnCategorySettings").onclick = openCategorySettings;
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
  document.getElementById("sheetToolsGroup").style.display = view === "sheet" ? "flex" : "none";
  if (view === "summary") renderSummary();
  if (view === "dashboard") renderDashboard();
}

function renderAll() {
  renderMonthTabs();
  renderSheet();
  if (state.view === "summary") renderSummary();
  if (state.view === "dashboard") renderDashboard();
}

// ---------------- Row CRUD ----------------

async function addRow() {
  const t = emptyTask();
  t.id = uid();
  state.tasks.push(t);
  renumber();
  await persistTasks(state.currentMonth, state.tasks);
  await apiCreateTask(state.currentMonth, t);
  renderSheet();
  renderDashboard();
}

async function deleteRow(id) {
  if (!confirm("이 업무 행을 삭제할까요?")) return;
  state.tasks = state.tasks.filter(t => t.id !== id);
  renumber();
  await persistTasks(state.currentMonth, state.tasks);
  await apiDeleteTask(state.currentMonth, id);
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
  await apiUpdateTask(state.currentMonth, id, t);
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

function renderSheet() {
  const theadGroup = document.getElementById("theadGroup");
  const theadCols = document.getElementById("theadCols");
  const tbody = document.getElementById("tbody");
  theadGroup.innerHTML = ""; theadCols.innerHTML = ""; tbody.innerHTML = "";

  // grouped header row
  let i = 0;
  while (i < COLUMNS.length) {
    const g = COLUMNS[i].group;
    let span = 0;
    while (i + span < COLUMNS.length && COLUMNS[i + span].group === g) span++;
    const th = document.createElement("th");
    th.colSpan = span;
    th.textContent = groupLabel(g);
    th.className = "group-" + g;
    theadGroup.appendChild(th);
    i += span;
  }
  const actionsTh = document.createElement("th");
  actionsTh.textContent = "";
  theadGroup.appendChild(actionsTh);

  // column header row
  COLUMNS.forEach(col => {
    const th = document.createElement("th");
    th.textContent = col.label;
    th.style.minWidth = col.width + "px";
    theadCols.appendChild(th);
  });
  const th2 = document.createElement("th");
  th2.textContent = "삭제";
  theadCols.appendChild(th2);

  const q = state.searchText.trim().toLowerCase();
  const rows = state.tasks.filter(t => {
    if (!q) return true;
    return (t.title || "").toLowerCase().includes(q) || (t.detail || "").toLowerCase().includes(q) || (t.ticket || "").toLowerCase().includes(q);
  });

  rows.forEach(task => {
    const tr = document.createElement("tr");
    COLUMNS.forEach(col => {
      const td = document.createElement("td");
      td.appendChild(renderCell(task, col));
      tr.appendChild(td);
    });
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
}

function renderCell(task, col) {
  if (col.type === "readonly") {
    const span = document.createElement("span");
    span.className = "readonly-cell";
    span.textContent = col.key === "mm" ? (task.mm ?? 0) : (task[col.key] ?? "");
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
    sel.value = task[col.key] || "";
    sel.onchange = () => updateField(task.id, col.key, sel.value);
    return sel;
  }
  if (col.type === "select-dependent") {
    const sel = document.createElement("select");
    const opts = col.map[task[col.dependsOn]] || [];
    sel.appendChild(new Option("", ""));
    opts.forEach(o => sel.appendChild(new Option(o, o, false, task[col.key] === o)));
    sel.value = task[col.key] || "";
    sel.disabled = opts.length === 0;
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
    html += `<tr><td>${r.major}</td><td>${r.total}</td>${r.counts.map(c => `<td>${c || ""}</td>`).join("")}</tr>`;
  });
  html += `<tr class="total-row"><td>계</td><td>${grandTotal}</td>${grandCounts.map(c => `<td>${c || ""}</td>`).join("")}</tr>`;
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
  const mmByRole = {};
  ROLES.forEach(r => { mmByRole[r] = hourSums[r] / MM_HOURS; });
  const target = state.settings.targetMM;

  let html = `<h3>${state.currentMonth} 업무별 투입 MM</h3><table class="summary-table"><thead><tr><th>구분</th>${ROLES.map(r => `<th>${r}</th>`).join("")}<th>계</th></tr></thead><tbody>`;
  html += `<tr><td>기준 MM</td>${ROLES.map(r => `<td>${target[r] ?? ""}</td>`).join("")}<td>${ROLES.reduce((a, r) => a + num(target[r]), 0)}</td></tr>`;
  const mmTotal = ROLES.reduce((a, r) => a + mmByRole[r], 0);
  html += `<tr><td>투입 MM</td>${ROLES.map(r => `<td>${mmByRole[r].toFixed(3)}</td>`).join("")}<td>${mmTotal.toFixed(3)}</td></tr>`;
  html += `<tr><td>투입률</td>${ROLES.map(r => `<td>${target[r] ? (mmByRole[r] / target[r] * 100).toFixed(1) + "%" : "-"}</td>`).join("")}<td>${(mmTotal / ROLES.reduce((a, r) => a + num(target[r]), 0) * 100 || 0).toFixed(1)}%</td></tr>`;
  html += "</tbody></table>";
  el.innerHTML = html;
}

function renderDetailMMTable() {
  const el = document.getElementById("detailMMTable");
  const majorGroups = [
    { major: "기업", minors: MINOR_CATEGORY_MAP["기업"] },
    { major: "소상공인", minors: MINOR_CATEGORY_MAP["소상공인"] },
    { major: "GA", minors: MINOR_CATEGORY_MAP["GA"] },
    { major: "공통", minors: MINOR_CATEGORY_MAP["공통"] }
  ];
  let html = `<h3>대분류 · 중분류별 투입 MM</h3><table class="summary-table"><thead><tr><th>대분류</th><th>중분류</th>${ROLES.map(r => `<th>${r}</th>`).join("")}<th>계</th></tr></thead><tbody>`;
  majorGroups.forEach(g => {
    let subtotal = ROLES.reduce((acc, r) => ({ ...acc, [r]: 0 }), {});
    g.minors.forEach((minor, idx) => {
      const tasks = state.tasks.filter(t => t.major === g.major && t.minor === minor);
      const sums = sumHoursByRole(tasks);
      const mm = {}; ROLES.forEach(r => { mm[r] = sums[r] / MM_HOURS; subtotal[r] += mm[r]; });
      const rowTotal = ROLES.reduce((a, r) => a + mm[r], 0);
      html += `<tr>${idx === 0 ? `<td rowspan="${g.minors.length + 1}">${g.major}</td>` : ""}<td>${minor}</td>${ROLES.map(r => `<td>${mm[r] ? mm[r].toFixed(3) : ""}</td>`).join("")}<td>${rowTotal ? rowTotal.toFixed(3) : ""}</td></tr>`;
    });
    const subTotalSum = ROLES.reduce((a, r) => a + subtotal[r], 0);
    html += `<tr class="subtotal-row"><td>소계</td>${ROLES.map(r => `<td>${subtotal[r].toFixed(3)}</td>`).join("")}<td>${subTotalSum.toFixed(3)}</td></tr>`;
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

  // 대분류별 현황
  const majorCounts = MAJOR_CATEGORIES.map(m => tasks.filter(t => t.major === m).length);
  const maxMajor = Math.max(1, ...majorCounts);
  document.getElementById("dashCategoryCard").innerHTML =
    `<h3>대분류별 업무</h3>` + MAJOR_CATEGORIES.map((m, i) => barRow(m, majorCounts[i], maxMajor)).join("");

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

  renderCapacityCard(tasks);
  renderThroughputCard(tasks);
  renderBlockerCard(tasks);
  renderOptionsCard(tasks);
}

// ---------- Capacity (인력 대비 처리 능력) ----------

function capacityConfig() {
  const headcount = state.settings.headcount || DEFAULT_HEADCOUNT;
  const weekDays = state.settings.weekDays || DEFAULT_WEEK_DAYS;
  return { headcount, weekDays };
}

function renderCapacityCard(tasks) {
  const { headcount, weekDays } = capacityConfig();
  const rows = ROLES.map(r => {
    const heads = num(headcount[r]);
    const capacity = heads * weekDays;                       // 주당 인일
    const usedDays = sumHoursByRole(tasks)[r] / HOURS_PER_DAY; // 이번 달 누적 투입 인일
    return { role: r, heads, capacity, usedDays };
  });
  const totalHeads = rows.reduce((a, x) => a + x.heads, 0);
  const totalCapacity = rows.reduce((a, x) => a + x.capacity, 0);

  const staffingLine = ROLES.filter(r => num(headcount[r]) > 0)
    .map(r => `${r} ${num(headcount[r])}`).join(" / ");

  document.getElementById("dashCapacityCard").innerHTML = `
    <h3>투입 인력 대비 처리 능력(Capacity)</h3>
    <p class="card-lead">현재 <strong>${totalHeads}명</strong>(${escapeHtml(staffingLine)})의 전담 인력으로
      주당 <strong>${totalCapacity}인일</strong>의 처리 능력을 확보하고 있으며,
      기획 → 디자인 → 퍼블리싱 연계 순서에 따라 우선순위 기준으로 순차 진행하고 있습니다.</p>
    <table class="summary-table">
      <thead><tr><th>구분</th><th>인원</th><th>주당 Capacity</th><th>월 누적 투입</th></tr></thead>
      <tbody>
        ${rows.map(x => `<tr>
          <td>${x.role}</td>
          <td>${x.heads}명</td>
          <td>${x.capacity}인일 (${x.heads}×${weekDays}일)</td>
          <td>${x.usedDays.toFixed(1)}인일</td>
        </tr>`).join("")}
        <tr class="total-row">
          <td>계</td><td>${totalHeads}명</td><td>${totalCapacity}인일/주</td>
          <td>${rows.reduce((a, x) => a + x.usedDays, 0).toFixed(1)}인일</td>
        </tr>
      </tbody>
    </table>`;
}

// ---------- 주간 처리량 / 다음 주 예상 ----------

function weekRangeOf(offsetWeeks) {
  const base = new Date(); base.setHours(0, 0, 0, 0);
  const dow = base.getDay();
  const monday = new Date(base);
  monday.setDate(base.getDate() - ((dow + 6) % 7) + offsetWeeks * 7);
  const sunday = new Date(monday); sunday.setDate(monday.getDate() + 6);
  return { start: toDateStr(monday), end: toDateStr(sunday) };
}

function inRange(d, r) { return d && d >= r.start && d <= r.end; }

function renderThroughputCard(tasks) {
  const thisWeek = weekRangeOf(0);
  const active = tasks.filter(t => t.status !== "취소");

  const requested = active.filter(t => inRange(t.receivedDate, thisWeek)).length;
  const completed = active.filter(t => t.status === "완료" && inRange(t.doneDate, thisWeek)).length;
  const working = active.filter(t => ["진행", "개발", "검수"].includes(t.status)).length;
  const isNew = active.filter(t => inRange(t.receivedDate, thisWeek) && t.kind === "신규").length;
  const isFix = active.filter(t => inRange(t.receivedDate, thisWeek) && t.kind === "수정").length;

  // 최근 4주 완료 실적으로 다음 주 예상 처리량 산출
  const weekly = [0, -1, -2, -3].map(off => {
    const r = weekRangeOf(off);
    return active.filter(t => t.status === "완료" && inRange(t.doneDate, r)).length;
  });
  const past = weekly.slice(1).filter(v => v > 0);
  const avg = past.length ? past.reduce((a, b) => a + b, 0) / past.length : completed;
  const lo = Math.max(0, Math.floor(avg * 0.85));
  const hi = Math.ceil(avg * 1.15);

  document.getElementById("dashThroughputCard").innerHTML = `
    <h3>이번 주 처리량 (${thisWeek.start.slice(5).replace("-", "/")} ~ ${thisWeek.end.slice(5).replace("-", "/")})</h3>
    <div class="throughput-grid">
      <div class="throughput-item"><span class="tp-value">${requested}</span><span class="tp-label">요청 업무</span></div>
      <div class="throughput-item"><span class="tp-value">${completed}</span><span class="tp-label">완료</span></div>
      <div class="throughput-item"><span class="tp-value">${working}</span><span class="tp-label">진행 중</span></div>
      <div class="throughput-item"><span class="tp-value">${isNew}</span><span class="tp-label">신규 요청</span></div>
      <div class="throughput-item"><span class="tp-value">${isFix}</span><span class="tp-label">수정 반영</span></div>
    </div>
    <p class="card-lead">최근 4주 주 평균 처리량은 <strong>${avg.toFixed(1)}건</strong>이며,
      다음 주 예상 처리 가능량은 <strong>약 ${lo}~${hi}건</strong>입니다.</p>`;
}

// ---------- 병목 구분 ----------

function renderBlockerCard(tasks) {
  const open = tasks.filter(t => !["완료", "취소"].includes(t.status));
  const buckets = OPTIONS.병목.map(label => ({
    label,
    meta: BLOCKER_META[label],
    items: open.filter(t => t.blocker === label)
  }));
  const unset = open.filter(t => !t.blocker);

  const waitingCount = buckets.find(b => b.label === "고객 자료/의사결정 대기").items.length;
  const riskCount = buckets.find(b => b.label === "일정 영향 가능").items.length;

  document.getElementById("dashBlockerCard").innerHTML = `
    <h3>진행 상태 / 병목 구분</h3>
    <p class="card-lead">미완료 ${open.length}건 중 <strong>${waitingCount}건</strong>은 고객사 자료·의사결정 대기 상태이며,
      <strong>${riskCount}건</strong>은 일정에 영향을 줄 수 있는 항목입니다.
      내부 작업 지연과 외부 대기 요인을 구분해 관리하고 있습니다.</p>
    <div class="blocker-grid">
      ${buckets.map(b => `
        <div class="blocker-box blocker-${b.meta.tone}">
          <div class="blocker-head"><span>${b.meta.dot}</span><span>${b.label}</span></div>
          <div class="blocker-count">${b.items.length}건</div>
          <ul class="blocker-items">
            ${b.items.slice(0, 4).map(t => `<li>${escapeHtml(t.title) || "(업무명 미입력)"}</li>`).join("")
              || `<li class="blocker-none">해당 없음</li>`}
            ${b.items.length > 4 ? `<li class="blocker-more">외 ${b.items.length - 4}건</li>` : ""}
          </ul>
        </div>`).join("")}
    </div>
    ${unset.length ? `<p class="dash-empty">※ 병목구분 미지정 ${unset.length}건 — 업무현황 탭의 '병목구분' 열에서 지정하면 위 분류에 반영됩니다.</p>` : ""}`;
}

// ---------- 선택지 제시 ----------

function renderOptionsCard(tasks) {
  const open = tasks.filter(t => !["완료", "취소"].includes(t.status)).length;
  const { headcount, weekDays } = capacityConfig();
  const totalHeads = ROLES.reduce((a, r) => a + num(headcount[r]), 0);

  document.getElementById("dashOptionsCard").innerHTML = `
    <h3>일정 운영 선택지</h3>
    <p class="card-lead">현재 인력 기준으로 일정 내 최대한 완료할 수 있도록 우선순위와 투입량을 관리하고 있습니다.
      잔여 <strong>${open}건</strong>의 처리 방식은 아래 세 가지 중에서 선택할 수 있습니다.</p>
    <div class="option-grid">
      <div class="option-box">
        <div class="option-num">①</div>
        <div class="option-title">현재 인력 유지</div>
        <div class="option-desc">우선순위 기준 순차 완료. 후순위 업무의 완료 시점은 조정됩니다.</div>
      </div>
      <div class="option-box">
        <div class="option-num">②</div>
        <div class="option-title">일정 유지 + 전체 동시 진행</div>
        <div class="option-desc">현재 ${totalHeads}명(주 ${totalHeads * weekDays}인일) 기준 Capacity를 초과하므로 추가 인력이 필요합니다.</div>
      </div>
      <div class="option-box">
        <div class="option-num">③</div>
        <div class="option-title">인력 유지 + 전체 완료</div>
        <div class="option-desc">현재 처리 속도 기준으로 완료 일정 조정이 필요합니다.</div>
      </div>
    </div>
    <p class="card-note">협조사항 : 원활한 일정 준수를 위해 자료 및 검토 의견은 우선순위에 따라 순차적으로 전달 부탁드립니다.</p>`;
}

// ---------------- Settings modal ----------------

function openSettings() {
  const modal = document.getElementById("settingsModal");
  modal.style.display = "flex";
  const form = document.getElementById("settingsForm");
  form.innerHTML = "";

  if (!state.settings.headcount) state.settings.headcount = { ...DEFAULT_HEADCOUNT };
  if (!state.settings.weekDays) state.settings.weekDays = DEFAULT_WEEK_DAYS;

  const sec1 = document.createElement("div");
  sec1.innerHTML = `<h4 class="settings-section">투입 인력 (명)</h4>`;
  form.appendChild(sec1);
  ROLES.forEach(r => {
    const row = document.createElement("div");
    row.className = "settings-row";
    row.innerHTML = `<label>${r}</label>`;
    const inp = document.createElement("input");
    inp.type = "number"; inp.step = "1"; inp.min = "0";
    inp.value = state.settings.headcount[r] ?? DEFAULT_HEADCOUNT[r] ?? 0;
    inp.oninput = () => { state.settings.headcount[r] = parseFloat(inp.value) || 0; };
    row.appendChild(inp);
    form.appendChild(row);
  });

  const wdRow = document.createElement("div");
  wdRow.className = "settings-row";
  wdRow.innerHTML = `<label>주 근무일</label>`;
  const wdInp = document.createElement("input");
  wdInp.type = "number"; wdInp.value = state.settings.weekDays || DEFAULT_WEEK_DAYS;
  wdInp.oninput = () => { state.settings.weekDays = parseInt(wdInp.value) || DEFAULT_WEEK_DAYS; };
  wdRow.appendChild(wdInp);
  form.appendChild(wdRow);

  const sec2 = document.createElement("div");
  sec2.innerHTML = `<h4 class="settings-section">월 기준 MM</h4>`;
  form.appendChild(sec2);
  ROLES.forEach(r => {
    const row = document.createElement("div");
    row.className = "settings-row";
    row.innerHTML = `<label>${r}</label>`;
    const inp = document.createElement("input");
    inp.type = "number"; inp.step = "0.1";
    inp.value = state.settings.targetMM[r] ?? DEFAULT_TARGET_MM[r] ?? 0;
    inp.oninput = () => { state.settings.targetMM[r] = parseFloat(inp.value) || 0; };
    row.appendChild(inp);
    form.appendChild(row);
  });

  const mdRow = document.createElement("div");
  mdRow.className = "settings-row";
  mdRow.innerHTML = `<label>월 업무일수</label>`;
  const mdInp = document.createElement("input");
  mdInp.type = "number"; mdInp.value = state.settings.workDays || 20;
  mdInp.oninput = () => { state.settings.workDays = parseInt(mdInp.value) || 20; };
  mdRow.appendChild(mdInp);
  form.appendChild(mdRow);

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
  assigneeDraft = {
    기획: [...ASSIGNEE_OPTIONS.기획],
    디자인: [...ASSIGNEE_OPTIONS.디자인],
    퍼블: [...ASSIGNEE_OPTIONS.퍼블]
  };
  const modal = document.getElementById("assigneeModal");
  modal.style.display = "flex";
  renderAssigneeForm();

  document.getElementById("btnAssigneeClose").onclick = () => {
    modal.style.display = "none";
    assigneeDraft = null;
  };
  document.getElementById("btnAssigneeSave").onclick = async () => {
    Object.keys(ASSIGNEE_OPTIONS).forEach(role => {
      const cleaned = assigneeDraft[role].map(v => v.trim()).filter(Boolean);
      ASSIGNEE_OPTIONS[role].splice(0, ASSIGNEE_OPTIONS[role].length, ...cleaned);
    });
    await saveAssignees(ASSIGNEE_OPTIONS);
    modal.style.display = "none";
    assigneeDraft = null;
    renderSheet(); // 담당자 드롭다운 옵션 갱신
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
    const raw = localStorage.getItem("wm_categories_v1");
    return raw ? JSON.parse(raw) : null;
  }
  try {
    const data = await apiFetchJson("/api/categories");
    return data.categories || null;
  } catch (e) { return null; }
}

async function saveCategories(categories) {
  if (!API_BASE) {
    localStorage.setItem("wm_categories_v1", JSON.stringify(categories));
    return;
  }
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
    const majors = categoryDraft.majors.map(m => m.trim()).filter(Boolean);
    const minors = {};
    majors.forEach(m => {
      minors[m] = (categoryDraft.minors[m] || []).map(v => v.trim()).filter(Boolean);
    });
    applyCategories({ majors, minors });
    await saveCategories({ majors, minors });
    document.getElementById("categoryModal").style.display = "none";
    categoryDraft = null;
    renderSheet();
    renderSummary();
    renderDashboard();
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
      if (CSV_DATE_KEYS.includes(c.key)) v = isoToMMDD(v); // 일정은 MM/DD 로 내보냄
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
    alert("양식의 헤더를 인식하지 못했습니다.\n'CSV 내보내기'로 받은 파일의 첫 줄(헤더)을 그대로 유지한 채 올려주세요.");
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
  if (API_BASE) await replaceTasksOnServer(state.currentMonth, state.tasks);

  renderSheet();
  renderDashboard();
  alert(`${imported.length}건을 불러왔습니다.${skipped.length ? `\n(건너뛴 행: ${skipped.length}개)` : ""}`);
}

// Vercel 모드에서 월 전체 목록을 한 번에 저장
async function replaceTasksOnServer(month, tasks) {
  await apiFetchJson("/api/tasks", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ month, tasks })
  });
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

function majorBracket(t) {
  return t.major ? `[${t.major}]` : "";
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

    // 5.1 건수 집계
    const inProgressCount = valid.filter(t => t.status === "진행").length;
    const doneInRange = valid.filter(t => t.status === "완료" && t.doneDate && t.doneDate >= startStr && t.doneDate <= endStr);
    const receivedCount = valid.filter(t => t.receivedDate && t.receivedDate >= startStr && t.receivedDate <= endStr).length;

    // 완료일 특정 불가(확인 필요)
    const needCheck = valid.filter(t => t.status === "완료" && !t.doneDate);

    // 5.2 진행중 업무 목록: 진행/대기/공란(접수일 있음)
    const progressList = valid
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

    // 5.3 완료 업무 목록
    const doneList = [...doneInRange].sort((a, b) => a.doneDate.localeCompare(b.doneDate));

    const weekdayFull = WEEKDAY_KOR[end.getDay()] + "요일";
    const lines = [];
    lines.push(`# 주간보고 (${endStr} ${weekdayFull} 작성)`);
    lines.push("");
    lines.push(`- 참고 시트: 업무현황_${refMonth}${monthExists ? "" : " (해당 월 시트가 없어 현재 열려있는 탭 기준으로 작성)"}`);
    lines.push(`- 대상 기간: ${startStr}(목) ~ ${endStr}(${WEEKDAY_KOR[end.getDay()]})`);
    lines.push("");
    lines.push("## 건수 집계");
    lines.push("");
    lines.push(`- 진행 : ${inProgressCount}건`);
    lines.push(`- 완료 : ${doneInRange.length}건`);
    lines.push(`- 접수 : ${receivedCount}건`);
    lines.push("");
    lines.push("## 진행중 업무 목록");
    lines.push("");
    if (progressList.length) {
      progressList.forEach(t => {
        const due = t.dueDate ? `(${mdShort(t.dueDate)})` : "(일정 협의 중)";
        lines.push(`- ${majorBracket(t)}${t.title}${due}`);
      });
    } else {
      lines.push("- (해당 없음)");
    }
    lines.push("");
    lines.push("## 완료 업무 목록");
    lines.push("");
    if (doneList.length) {
      doneList.forEach(t => lines.push(`- ${majorBracket(t)}${t.title}(${mdShort(t.doneDate)})`));
    } else {
      lines.push("- (해당 없음)");
    }
    if (needCheck.length) {
      lines.push("");
      lines.push("## 확인 필요");
      lines.push("");
      lines.push("> 완료 상태이나 완료일을 특정할 수 없어 집계에서 제외된 항목입니다.");
      lines.push("");
      needCheck.forEach(t => {
        const recv = t.receivedDate ? `(접수일 ${mdShort(t.receivedDate)})` : "(접수일 미상)";
        lines.push(`- ${majorBracket(t)} ${t.title} ${recv}`);
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
