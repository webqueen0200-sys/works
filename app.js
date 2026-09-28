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
    const btn = document.createElement("button");
    btn.className = "month-tab" + (m === state.currentMonth ? " active" : "");
    btn.textContent = `업무현황_${m}`;
    btn.onclick = () => switchMonth(m);
    wrap.appendChild(btn);
  });
  const addBtn = document.createElement("button");
  addBtn.className = "month-tab add";
  addBtn.textContent = "+ 새 월 시트";
  addBtn.onclick = addMonth;
  wrap.appendChild(addBtn);
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

function bindGlobalControls() {
  document.getElementById("btnAddRow").onclick = addRow;
  document.getElementById("btnDashboardView").onclick = () => setView("dashboard");
  document.getElementById("btnSummaryView").onclick = () => setView("summary");
  document.getElementById("btnSheetView").onclick = () => setView("sheet");
  document.getElementById("btnSettings").onclick = openSettings;
  document.getElementById("searchInput").oninput = (e) => { state.searchText = e.target.value; renderSheet(); };
  document.getElementById("btnExport").onclick = exportCsv;
  document.getElementById("btnDashRefresh").onclick = renderDashboard;
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

// ---------------- CSV export ----------------

function exportCsv() {
  const header = COLUMNS.map(c => c.label).join(",");
  const lines = state.tasks.map(t => COLUMNS.map(c => {
    const v = (t[c.key] ?? "").toString().replace(/"/g, '""');
    return `"${v}"`;
  }).join(","));
  const csv = [header, ...lines].join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = `업무현황_${state.currentMonth}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

window.addEventListener("DOMContentLoaded", init);
