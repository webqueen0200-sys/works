// ============================================================
// app.js — 업무관리 시트 프론트엔드 로직
// ============================================================

const state = {
  months: [],          // ["8월","9월",...]
  currentMonth: null,
  tasks: [],           // 현재 월의 업무 배열
  settings: { targetMM: { ...DEFAULT_TARGET_MM }, workDays: 20 },
  view: "sheet",        // "sheet" | "summary"
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
  document.getElementById("btnSummaryView").onclick = () => setView("summary");
  document.getElementById("btnSheetView").onclick = () => setView("sheet");
  document.getElementById("btnSettings").onclick = openSettings;
  document.getElementById("searchInput").oninput = (e) => { state.searchText = e.target.value; renderSheet(); };
  document.getElementById("btnExport").onclick = exportCsv;
}

function setView(view) {
  state.view = view;
  document.getElementById("btnSheetView").classList.toggle("active", view === "sheet");
  document.getElementById("btnSummaryView").classList.toggle("active", view === "summary");
  document.getElementById("sheetPanel").style.display = view === "sheet" ? "block" : "none";
  document.getElementById("summaryPanel").style.display = view === "summary" ? "block" : "none";
  if (view === "summary") renderSummary();
}

function renderAll() {
  renderMonthTabs();
  renderSheet();
  if (state.view === "summary") renderSummary();
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
}

async function deleteRow(id) {
  if (!confirm("이 업무 행을 삭제할까요?")) return;
  state.tasks = state.tasks.filter(t => t.id !== id);
  renumber();
  await persistTasks(state.currentMonth, state.tasks);
  await apiDeleteTask(state.currentMonth, id);
  renderSheet();
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
}

// ---------------- Sheet (업무현황) rendering ----------------

function groupLabel(group) {
  return ({
    meta: "관리", classify: "업무 분류", content: "업무 내용", requester: "요청",
    assignee: "업무 담당자", schedule: "일정", hours: "업무투입", note: "비고", sla: "SLA 평가"
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
  renderSlaTable();
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

const SLA_SCORE = { "매우만족": 5, "만족": 4, "보통": 3, "미흡": 2, "매우미흡": 1 };
const SLA_KEYS = { 일정준수: "slaSchedule", 품질만족: "slaQuality", 의사소통: "slaCommunication", 업무태도: "slaAttitude", 업무능력: "slaCompetence" };

function renderSlaTable() {
  const el = document.getElementById("slaTable");
  const items = Object.keys(SLA_KEYS);
  let html = `<h3>업무별 SLA 평가</h3><table class="summary-table"><thead><tr><th>평가항목</th><th>건수(월)</th><th>평가 결과(평균)</th><th>평가 등급</th></tr></thead><tbody>`;
  items.forEach(item => {
    const key = SLA_KEYS[item];
    const rated = state.tasks.filter(t => t[key]);
    const avg = rated.length ? rated.reduce((a, t) => a + (SLA_SCORE[t[key]] || 0), 0) / rated.length : null;
    const grade = avg === null ? "-" : avg >= 4.5 ? "매우만족" : avg >= 3.5 ? "만족" : avg >= 2.5 ? "보통" : avg >= 1.5 ? "미흡" : "매우미흡";
    html += `<tr><td>${item}</td><td>${rated.length}</td><td>${avg === null ? "-" : avg.toFixed(2)}</td><td>${grade}</td></tr>`;
  });
  html += "</tbody></table>";
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
