// ============================================================
// holiday.js — 휴일 관리 (공휴일 설정 · 월별 달력 · 휴가 등록 · 월 통계)
// app.js 다음에 불러옵니다. (escapeHtml, API_BASE, ASSIGNEE_OPTIONS 등 사용)
// ============================================================

// 근태 종류: 하루당 시간 / 하루당 일수
const LEAVE_TYPES = {
  연차: { hours: 8, days: 1 },
  반차: { hours: 4, days: 0.5 },
  반반차: { hours: 2, days: 0.25 },
  검진: { hours: 8, days: 1 }
};

// 담당자 그룹별 색상 (기획 푸른색 · 디자인 보라색 · 퍼블 녹색 · GA 주황색)
const LEAVE_ROLE_COLORS = {
  기획: "role-plan",
  디자인: "role-design",
  퍼블: "role-pub",
  GA: "role-ga"
};

// 기본 공휴일 (불러오기 버튼용 · 대체공휴일 포함) — 불러온 뒤 확인·수정하세요.
const HOLIDAY_PRESETS = {
  2026: [
    ["2026-01-01", "신정"],
    ["2026-02-16", "설날 연휴"], ["2026-02-17", "설날"], ["2026-02-18", "설날 연휴"],
    ["2026-03-01", "삼일절"], ["2026-03-02", "대체공휴일(삼일절)"],
    ["2026-05-05", "어린이날"],
    ["2026-05-24", "부처님오신날"], ["2026-05-25", "대체공휴일(부처님오신날)"],
    ["2026-06-03", "전국동시지방선거"],
    ["2026-06-06", "현충일"],
    ["2026-08-15", "광복절"], ["2026-08-17", "대체공휴일(광복절)"],
    ["2026-09-24", "추석 연휴"], ["2026-09-25", "추석"], ["2026-09-26", "추석 연휴"],
    ["2026-10-03", "개천절"], ["2026-10-05", "대체공휴일(개천절)"],
    ["2026-10-09", "한글날"],
    ["2026-12-25", "성탄절"]
  ]
};

const holidayState = {
  holidays: {},   // { "2026": [{ id, name, date }] }
  leaves: [],     // [{ id, start, end, type, assignee, role, hours, days }]
  year: new Date().getFullYear(),
  month: new Date().getMonth() + 1,
  loaded: false
};

// ---------------- 저장소 (Vercel API 또는 localStorage) ----------------

function hdNsQuery() { return window.APP_NS ? `?ns=${encodeURIComponent(window.APP_NS)}` : ""; }
function hdLocalKey() { return "wm_holidays_v1" + (window.APP_NS ? `_${window.APP_NS}` : ""); }

function hdSaveLocal() {
  try {
    localStorage.setItem(hdLocalKey(), JSON.stringify({ holidays: holidayState.holidays, leaves: holidayState.leaves }));
  } catch (e) { /* 용량 초과 등 무시 */ }
}

function hdApplyData(data) {
  holidayState.holidays = (data && data.holidays && typeof data.holidays === "object") ? data.holidays : {};
  holidayState.leaves = (data && Array.isArray(data.leaves)) ? data.leaves : [];
}

async function loadHolidayData() {
  let local = null;
  try { local = JSON.parse(localStorage.getItem(hdLocalKey()) || "null"); } catch (e) { local = null; }
  if (!API_BASE) {
    hdApplyData(local);
    holidayState.loaded = true;
    return;
  }
  try {
    const data = await apiFetchJson("/api/holidays" + hdNsQuery());
    hdApplyData(data);
    hdSaveLocal();
  } catch (err) {
    console.error("[휴일 데이터 불러오기 실패]", err);
    hdApplyData(local);
  }
  holidayState.loaded = true;
}

// part: "holidays" | "leaves"
async function saveHolidayData(part) {
  hdSaveLocal();
  if (!API_BASE) return;
  setSaveStatus("saving", "저장 중...");
  try {
    await apiFetchJson("/api/holidays" + hdNsQuery(), {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [part]: holidayState[part] })
    });
    const t = new Date();
    setSaveStatus("ok", `저장됨 ${String(t.getHours()).padStart(2, "0")}:${String(t.getMinutes()).padStart(2, "0")}`);
  } catch (err) {
    saveState.lastError = ((err && err.message) || String(err)) +
      "\n\n[확인] api/holidays.js 파일을 올리고 Vercel 에서 Redeploy 했는지 확인하세요. (이 브라우저에는 저장되어 있습니다)";
    setSaveStatus("error", "저장 실패 (클릭)");
    throw err;
  }
}

// ---------------- 날짜 유틸 ----------------

function hdYmd(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function hdDate(ymd) {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(y, m - 1, d);
}
function hdIsValidYmd(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s || "")) return false;
  return hdYmd(hdDate(s)) === s;
}

// "2026-10-23", "20261023", "2026.10.23", "10/23", "1023" → "YYYY-MM-DD" (실패 시 "")
function hdParseDateText(text, fallbackYear) {
  const raw = String(text || "").trim();
  if (!raw) return "";
  let m = /^(\d{4})\s*[-./]\s*(\d{1,2})\s*[-./]\s*(\d{1,2})$/.exec(raw) || /^(\d{4})(\d{2})(\d{2})$/.exec(raw);
  let iso = "";
  if (m) iso = `${m[1]}-${String(+m[2]).padStart(2, "0")}-${String(+m[3]).padStart(2, "0")}`;
  else iso = mmddToIso(raw, fallbackYear);
  return hdIsValidYmd(iso) ? iso : "";
}

// 전체 연도의 공휴일 { "YYYY-MM-DD": "휴일명" }
function hdHolidayMap() {
  const map = {};
  Object.values(holidayState.holidays).forEach(list => {
    (list || []).forEach(h => {
      if (!h.date) return;
      map[h.date] = map[h.date] ? `${map[h.date]} · ${h.name}` : (h.name || "휴일");
    });
  });
  return map;
}

function hdIsWorkday(ymd, holidayMap) {
  const dow = hdDate(ymd).getDay();
  return dow !== 0 && dow !== 6 && !holidayMap[ymd];
}

// 기간 안의 근무일(주말·공휴일 제외) 목록
function hdWorkdays(start, end, holidayMap) {
  const out = [];
  if (!hdIsValidYmd(start) || !hdIsValidYmd(end) || start > end) return out;
  const map = holidayMap || hdHolidayMap();
  const d = hdDate(start);
  const last = hdDate(end);
  while (d <= last) {
    const ymd = hdYmd(d);
    if (hdIsWorkday(ymd, map)) out.push(ymd);
    d.setDate(d.getDate() + 1);
  }
  return out;
}

function hdCalcLeave(type, start, end, holidayMap) {
  const t = LEAVE_TYPES[type] || LEAVE_TYPES.연차;
  const n = hdWorkdays(start, end, holidayMap).length;
  return { workdays: n, hours: n * t.hours, days: n * t.days };
}

// 담당자가 현재 속한 그룹 (담당자 설정 기준, 없으면 등록 당시 그룹)
function hdRoleOf(name, fallback) {
  for (const role of Object.keys(ASSIGNEE_OPTIONS)) {
    if (ASSIGNEE_OPTIONS[role].includes(name)) return role;
  }
  return fallback || "";
}

// 특정 연/월에 걸친 휴가를 담당자별로 집계 { name: { role, days, hours } }
function hdMonthStats(year, month) {
  const map = hdHolidayMap();
  const prefix = `${year}-${String(month).padStart(2, "0")}-`;
  const stats = {};
  holidayState.leaves.forEach(lv => {
    const t = LEAVE_TYPES[lv.type] || LEAVE_TYPES.연차;
    const n = hdWorkdays(lv.start, lv.end, map).filter(d => d.startsWith(prefix)).length;
    if (!n) return;
    const s = stats[lv.assignee] || (stats[lv.assignee] = { role: hdRoleOf(lv.assignee, lv.role), days: 0, hours: 0 });
    s.days += n * t.days;
    s.hours += n * t.hours;
  });
  return stats;
}

// 요약 탭 "투입 MM"용: 월 탭(예: "10월")의 직무별 휴가 시간 합계
function leaveHoursByRoleForMonth(monthLabel) {
  const month = parseInt(monthLabel, 10);
  const sums = {};
  if (!month) return sums;
  const stats = hdMonthStats(sheetYear(), month);
  Object.values(stats).forEach(s => { if (s.role) sums[s.role] = (sums[s.role] || 0) + s.hours; });
  return sums;
}

function hdFmtNum(n) { return Number.isInteger(n) ? String(n) : String(+n.toFixed(2)); }

// ---------------- 달력 화면 ----------------

function renderHolidayView() {
  const panel = document.getElementById("holidayPanel");
  if (!panel) return;
  const { year, month } = holidayState;

  // 연도 선택 범위: 올해 -2 ~ +2 + 데이터가 있는 연도
  const thisYear = new Date().getFullYear();
  const years = new Set();
  for (let y = thisYear - 2; y <= thisYear + 2; y++) years.add(y);
  Object.keys(holidayState.holidays).forEach(y => years.add(+y));
  years.add(year);
  const yearOpts = [...years].sort((a, b) => a - b)
    .map(y => `<option value="${y}" ${y === year ? "selected" : ""}>${y}년</option>`).join("");
  const monthOpts = Array.from({ length: 12 }, (_, i) => i + 1)
    .map(m => `<option value="${m}" ${m === month ? "selected" : ""}>${m}월</option>`).join("");

  const legend = Object.keys(LEAVE_ROLE_COLORS)
    .map(r => `<span class="hd-legend-item"><i class="hd-dot ${LEAVE_ROLE_COLORS[r]}"></i>${r}</span>`).join("");

  panel.innerHTML = `
    <div class="hd-layout">
      <div class="summary-card hd-cal-card">
        <div class="hd-cal-head">
          <div class="hd-nav">
            <button type="button" class="hd-nav-btn" id="hdPrev" title="이전 달">‹</button>
            <select id="hdYear" class="status-filter">${yearOpts}</select>
            <select id="hdMonth" class="status-filter">${monthOpts}</select>
            <button type="button" class="hd-nav-btn" id="hdNext" title="다음 달">›</button>
            <button type="button" class="btn btn-ghost hd-today" id="hdToday">오늘</button>
            <button type="button" class="btn btn-ghost hd-today" id="hdExportCsv" title="이 달의 휴가 목록을 CSV로 저장">CSV 내보내기</button>
          </div>
          <div class="hd-legend">${legend}<span class="hd-legend-hint">날짜를 누르면 휴가를 등록합니다</span></div>
        </div>
        <div id="hdCalendar" class="hd-calendar"></div>
      </div>
    </div>`;

  document.getElementById("hdPrev").onclick = () => hdMoveMonth(-1);
  document.getElementById("hdNext").onclick = () => hdMoveMonth(1);
  document.getElementById("hdYear").onchange = (e) => { holidayState.year = +e.target.value; renderHolidayView(); };
  document.getElementById("hdMonth").onchange = (e) => { holidayState.month = +e.target.value; renderHolidayView(); };
  document.getElementById("hdToday").onclick = () => {
    const now = new Date();
    holidayState.year = now.getFullYear();
    holidayState.month = now.getMonth() + 1;
    renderHolidayView();
  };

  document.getElementById("hdExportCsv").onclick = exportLeaveCsv;

  renderHolidayCalendar();
}

// ---------------- 휴가 CSV 내보내기 (보고 있는 연/월 기준) ----------------
// 해당 월에 걸친 휴가를 한 줄씩 내보냅니다. 근무일수·일수·시간은 그 달에 해당하는 만큼만 계산합니다.
function exportLeaveCsv() {
  const { year, month } = holidayState;
  const map = hdHolidayMap();
  const prefix = `${year}-${String(month).padStart(2, "0")}-`;
  const q = (v) => `"${(v ?? "").toString().replace(/"/g, '""')}"`;

  const rows = holidayState.leaves
    .map(lv => {
      const t = LEAVE_TYPES[lv.type] || LEAVE_TYPES.연차;
      const n = hdWorkdays(lv.start, lv.end, map).filter(d => d.startsWith(prefix)).length;
      return { lv, role: hdRoleOf(lv.assignee, lv.role), n, days: n * t.days, hours: n * t.hours };
    })
    .filter(r => r.n > 0)
    .sort((a, b) => a.lv.start.localeCompare(b.lv.start) || hdRoleOrder(a.role) - hdRoleOrder(b.role) || a.lv.assignee.localeCompare(b.lv.assignee));

  if (!rows.length) { alert(`${year}년 ${month}월에 등록된 휴가가 없습니다.`); return; }

  const header = ["시작일", "종료일", "근태명", "그룹", "담당자", "근무일수", "일수", "시간(H)"];
  const lines = rows.map(r => [r.lv.start, r.lv.end, r.lv.type, r.role || "-", r.lv.assignee, r.n, hdFmtNum(r.days), hdFmtNum(r.hours)].map(q).join(","));
  const totalDays = rows.reduce((a, r) => a + r.days, 0);
  const totalHours = rows.reduce((a, r) => a + r.hours, 0);
  lines.push(["계", "", "", "", "", rows.reduce((a, r) => a + r.n, 0), hdFmtNum(totalDays), hdFmtNum(totalHours)].map(q).join(","));

  const csv = [header.map(q).join(","), ...lines].join("\r\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `휴가공유_${year}년${String(month).padStart(2, "0")}월${window.APP_NS ? "_" + window.APP_NS : ""}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function hdMoveMonth(delta) {
  const d = new Date(holidayState.year, holidayState.month - 1 + delta, 1);
  holidayState.year = d.getFullYear();
  holidayState.month = d.getMonth() + 1;
  renderHolidayView();
}

function renderHolidayCalendar() {
  const el = document.getElementById("hdCalendar");
  const { year, month } = holidayState;
  const map = hdHolidayMap();
  const today = hdYmd(new Date());

  // 근무일별 휴가 목록
  const byDate = {};
  holidayState.leaves.forEach(lv => {
    hdWorkdays(lv.start, lv.end, map).forEach(d => { (byDate[d] = byDate[d] || []).push(lv); });
  });

  const first = new Date(year, month - 1, 1);
  const cursor = new Date(first);
  cursor.setDate(1 - first.getDay()); // 일요일 시작
  const lastDay = new Date(year, month, 0);
  const weeks = Math.ceil((first.getDay() + lastDay.getDate()) / 7);

  const dows = ["일", "월", "화", "수", "목", "금", "토"];
  let html = `<div class="hd-dow-row">${dows.map((d, i) => `<div class="hd-dow ${i === 0 ? "is-sun" : i === 6 ? "is-sat" : ""}">${d}</div>`).join("")}</div>`;
  html += `<div class="hd-grid">`;
  for (let i = 0; i < weeks * 7; i++) {
    const ymd = hdYmd(cursor);
    const dow = cursor.getDay();
    const holidayName = map[ymd];
    const cls = ["hd-cell"];
    if (cursor.getMonth() !== month - 1) cls.push("is-other");
    if (dow === 6) cls.push("is-sat");
    if (dow === 0 || holidayName) cls.push("is-red");
    if (ymd === today) cls.push("is-today");

    const chips = (byDate[ymd] || [])
      .slice()
      .sort((a, b) => hdRoleOrder(hdRoleOf(a.assignee, a.role)) - hdRoleOrder(hdRoleOf(b.assignee, b.role)) || a.assignee.localeCompare(b.assignee))
      .map(lv => {
        const role = hdRoleOf(lv.assignee, lv.role);
        return `<button type="button" class="hd-chip ${LEAVE_ROLE_COLORS[role] || "role-etc"}" data-leave="${escapeHtml(lv.id)}" title="${escapeHtml(`${lv.assignee} ${lv.type} (${lv.start}${lv.end !== lv.start ? " ~ " + lv.end : ""})`)}">${escapeHtml(lv.assignee)} ${escapeHtml(lv.type)}</button>`;
      }).join("");

    html += `<div class="${cls.join(" ")}" data-date="${ymd}">
      <div class="hd-cell-top"><span class="hd-num">${cursor.getDate()}</span>${holidayName ? `<span class="hd-hname" title="${escapeHtml(holidayName)}">${escapeHtml(holidayName)}</span>` : ""}</div>
      <div class="hd-chips">${chips}</div>
    </div>`;
    cursor.setDate(cursor.getDate() + 1);
  }
  html += `</div>`;
  el.innerHTML = html;

  el.querySelectorAll(".hd-cell").forEach(cell => {
    cell.onclick = () => openLeaveModal({ date: cell.dataset.date });
  });
  el.querySelectorAll(".hd-chip").forEach(chip => {
    chip.onclick = (e) => {
      e.stopPropagation();
      const lv = holidayState.leaves.find(l => l.id === chip.dataset.leave);
      if (lv) openLeaveModal({ leave: lv });
    };
  });
}

function hdRoleOrder(role) {
  const order = Object.keys(LEAVE_ROLE_COLORS);
  const i = order.indexOf(role);
  return i < 0 ? 99 : i;
}

function renderHolidayStats() {
  const el = document.getElementById("hdStats");
  const { year, month } = holidayState;
  const stats = hdMonthStats(year, month);

  // 담당자 설정의 모든 담당자 + 설정에서 빠졌지만 이번 달 기록이 있는 담당자
  const rows = [];
  Object.keys(ASSIGNEE_OPTIONS).forEach(role => {
    ASSIGNEE_OPTIONS[role].forEach(name => rows.push({ name, role, ...(stats[name] || { days: 0, hours: 0 }) }));
  });
  Object.keys(stats).forEach(name => {
    if (!rows.some(r => r.name === name)) rows.push({ name, ...stats[name] });
  });

  const totalDays = rows.reduce((a, r) => a + r.days, 0);
  const totalHours = rows.reduce((a, r) => a + r.hours, 0);

  let html = `<h3>${year}년 ${month}월 휴가 통계</h3>
    <table class="summary-table hd-stats-table"><thead><tr><th>그룹</th><th>담당자</th><th>일수</th><th>시간</th></tr></thead><tbody>`;
  rows.forEach(r => {
    const dot = `<i class="hd-dot ${LEAVE_ROLE_COLORS[r.role] || "role-etc"}"></i>`;
    html += `<tr class="${r.hours ? "" : "is-zero"}"><td>${dot}${escapeHtml(r.role || "-")}</td><td>${escapeHtml(r.name)}</td><td>${r.days ? hdFmtNum(r.days) + "일" : "-"}</td><td>${r.hours ? hdFmtNum(r.hours) + "H" : "-"}</td></tr>`;
  });
  html += `<tr class="total-row"><td colspan="2">계</td><td>${hdFmtNum(totalDays)}일</td><td>${hdFmtNum(totalHours)}H</td></tr>`;
  html += `</tbody></table>
    <p class="hd-stats-note">주말·공휴일은 제외하고 계산합니다. (연차·검진 8H/일, 반차 4H/0.5일, 반반차 2H/0.25일)</p>`;
  el.innerHTML = html;
}

// ---------------- 휴가 등록 / 수정 팝업 ----------------

let leaveEditing = null; // 수정 중인 휴가 id (null = 신규)

function hdDateField(id, value) {
  return `<span class="date-cell hd-date-field">
    <input type="text" id="${id}" class="hd-input shortdate-input" placeholder="YYYY-MM-DD" maxlength="10" value="${value}" />
    <input type="date" id="${id}Picker" class="date-picker" tabindex="-1" value="${value}" />
    <button type="button" class="date-btn" data-picker="${id}Picker" title="달력에서 선택">📅</button>
  </span>`;
}

function openLeaveModal({ date, leave }) {
  leaveEditing = leave ? leave.id : null;
  const modal = document.getElementById("leaveModal");
  const start = leave ? leave.start : date;
  const end = leave ? leave.end : date;
  const type = leave ? leave.type : "연차";
  const assignee = leave ? leave.assignee : "";

  const assigneeOpts = Object.keys(ASSIGNEE_OPTIONS).map(role =>
    `<optgroup label="${escapeHtml(role)}">${ASSIGNEE_OPTIONS[role].map(n =>
      `<option value="${escapeHtml(n)}" ${n === assignee ? "selected" : ""}>${escapeHtml(n)}</option>`).join("")}</optgroup>`
  ).join("");
  const missing = assignee && !hdRoleOf(assignee) ? `<option value="${escapeHtml(assignee)}" selected>${escapeHtml(assignee)} (설정에 없음)</option>` : "";

  document.getElementById("leaveModalTitle").textContent = leave ? "휴가 수정" : "휴가 등록";
  document.getElementById("leaveForm").innerHTML = `
    <div class="hd-form-row">
      <label>기간</label>
      <div class="hd-range">${hdDateField("leaveStart", start)}<span class="hd-tilde">~</span>${hdDateField("leaveEnd", end)}</div>
    </div>
    <div class="hd-form-row">
      <label>근태명</label>
      <div class="hd-type-group">${Object.keys(LEAVE_TYPES).map(t =>
        `<label class="hd-type"><input type="radio" name="leaveType" value="${t}" ${t === type ? "checked" : ""} /><span>${t}</span></label>`).join("")}</div>
    </div>
    <div class="hd-form-row">
      <label>근태시간</label>
      <div id="leaveHours" class="hd-hours"></div>
    </div>
    <div class="hd-form-row">
      <label>담당자명</label>
      <select id="leaveAssignee" class="hd-input"><option value="">담당자 선택</option>${missing}${assigneeOpts}</select>
    </div>`;

  const year = +start.slice(0, 4) || holidayState.year;
  ["leaveStart", "leaveEnd"].forEach(id => {
    const text = document.getElementById(id);
    const picker = document.getElementById(id + "Picker");
    text.onchange = () => {
      const iso = hdParseDateText(text.value, year);
      if (!iso) { text.classList.add("is-invalid"); updateLeaveHours(); return; }
      text.classList.remove("is-invalid");
      text.value = iso; picker.value = iso;
      hdSyncRange(id);
      updateLeaveHours();
    };
    text.oninput = () => { text.classList.remove("is-invalid"); };
    picker.onchange = () => {
      if (!picker.value) return;
      text.value = picker.value;
      text.classList.remove("is-invalid");
      hdSyncRange(id);
      updateLeaveHours();
    };
  });
  modal.querySelectorAll(".hd-date-field .date-btn").forEach(btn => {
    btn.onclick = () => {
      const picker = document.getElementById(btn.dataset.picker);
      if (typeof picker.showPicker === "function") {
        try { picker.showPicker(); return; } catch (e) { /* 미지원 시 아래로 */ }
      }
      picker.focus(); picker.click();
    };
  });
  modal.querySelectorAll("input[name=leaveType]").forEach(r => { r.onchange = updateLeaveHours; });

  const delBtn = document.getElementById("btnLeaveDelete");
  delBtn.style.display = leave ? "" : "none";
  delBtn.onclick = deleteLeave;
  document.getElementById("btnLeaveClose").onclick = () => { modal.style.display = "none"; leaveEditing = null; };
  document.getElementById("btnLeaveSave").onclick = saveLeave;

  modal.style.display = "flex";
  updateLeaveHours();
}

// 시작일이 종료일보다 늦어지면 반대쪽을 맞춰줍니다.
function hdSyncRange(changedId) {
  const s = document.getElementById("leaveStart");
  const e = document.getElementById("leaveEnd");
  if (!hdIsValidYmd(s.value) || !hdIsValidYmd(e.value) || s.value <= e.value) return;
  if (changedId === "leaveStart") { e.value = s.value; document.getElementById("leaveEndPicker").value = s.value; }
  else { s.value = e.value; document.getElementById("leaveStartPicker").value = e.value; }
}

function hdReadLeaveForm() {
  const start = document.getElementById("leaveStart").value.trim();
  const end = document.getElementById("leaveEnd").value.trim();
  const typeEl = document.querySelector("input[name=leaveType]:checked");
  const type = typeEl ? typeEl.value : "연차";
  const assignee = document.getElementById("leaveAssignee").value;
  return { start, end, type, assignee };
}

function updateLeaveHours() {
  const { start, end, type } = hdReadLeaveForm();
  const el = document.getElementById("leaveHours");
  if (!hdIsValidYmd(start) || !hdIsValidYmd(end)) { el.innerHTML = `<span class="hd-warn">날짜를 확인하세요</span>`; return; }
  const c = hdCalcLeave(type, start, end);
  const per = LEAVE_TYPES[type].hours;
  if (!c.workdays) { el.innerHTML = `<b>0시간</b> <span class="hd-warn">선택한 기간에 근무일이 없습니다 (주말·공휴일)</span>`; return; }
  el.innerHTML = `<b>${hdFmtNum(c.hours)}시간</b> <span class="hd-sub">(${hdFmtNum(c.days)}일 · 근무일 ${c.workdays}일 × ${per}H)</span>`;
}

async function saveLeave() {
  const f = hdReadLeaveForm();
  if (!hdIsValidYmd(f.start) || !hdIsValidYmd(f.end)) { alert("기간을 YYYY-MM-DD 형식으로 입력하세요."); return; }
  if (f.start > f.end) { alert("종료일이 시작일보다 빠릅니다."); return; }
  if (!f.assignee) { alert("담당자를 선택하세요."); return; }
  const c = hdCalcLeave(f.type, f.start, f.end);
  if (!c.workdays) { alert("선택한 기간에 근무일이 없습니다. (주말·공휴일 제외)"); return; }

  const overlap = holidayState.leaves.find(l => l.id !== leaveEditing && l.assignee === f.assignee && l.start <= f.end && l.end >= f.start);
  if (overlap && !confirm(`${f.assignee} 님은 ${overlap.start}${overlap.end !== overlap.start ? " ~ " + overlap.end : ""} 에 이미 '${overlap.type}'이(가) 등록되어 있습니다.\n그래도 저장할까요?`)) return;

  const record = {
    id: leaveEditing || uid(),
    start: f.start, end: f.end, type: f.type,
    assignee: f.assignee, role: hdRoleOf(f.assignee),
    hours: c.hours, days: c.days
  };
  if (leaveEditing) {
    const i = holidayState.leaves.findIndex(l => l.id === leaveEditing);
    if (i >= 0) holidayState.leaves[i] = record; else holidayState.leaves.push(record);
  } else {
    holidayState.leaves.push(record);
  }
  holidayState.leaves.sort((a, b) => a.start.localeCompare(b.start));

  document.getElementById("leaveModal").style.display = "none";
  leaveEditing = null;
  hdRefreshViews();
  try { await saveHolidayData("leaves"); } catch (e) { /* 상태 표시에 안내 */ }
}

async function deleteLeave() {
  if (!leaveEditing) return;
  if (!confirm("이 휴가를 삭제하시겠습니까?")) return;
  holidayState.leaves = holidayState.leaves.filter(l => l.id !== leaveEditing);
  document.getElementById("leaveModal").style.display = "none";
  leaveEditing = null;
  hdRefreshViews();
  try { await saveHolidayData("leaves"); } catch (e) { /* 상태 표시에 안내 */ }
}

function hdRefreshViews() {
  if (state.view === "holiday") renderHolidayView();
  if (state.view === "summary") renderSummary();
}

// 담당자 설정에서 이름이 바뀌면 휴가 기록의 담당자명도 함께 변경
async function holidayApplyRenames(renames) {
  let changed = false;
  holidayState.leaves.forEach(lv => {
    renames.forEach(({ role, oldName, newName }) => {
      if (lv.assignee === oldName && (!lv.role || lv.role === role)) { lv.assignee = newName; lv.role = role; changed = true; }
    });
  });
  if (changed) {
    try { await saveHolidayData("leaves"); } catch (e) { /* 상태 표시에 안내 */ }
  }
}

// ---------------- 휴일 설정 팝업 (연 단위 공휴일 등록/수정/삭제) ----------------

let holidayDraft = null;
let holidayDraftYear = null;

function openHolidaySettings() {
  holidayDraft = JSON.parse(JSON.stringify(holidayState.holidays || {}));
  holidayDraftYear = holidayState.year;
  document.getElementById("holidayModal").style.display = "flex";
  renderHolidayForm();

  document.getElementById("btnHolidayClose").onclick = () => {
    document.getElementById("holidayModal").style.display = "none";
    holidayDraft = null;
  };
  document.getElementById("btnHolidaySave").onclick = saveHolidaySettings;
}

function renderHolidayForm() {
  const el = document.getElementById("holidayForm");
  const y = String(holidayDraftYear);
  const list = holidayDraft[y] || (holidayDraft[y] = []);
  const hasPreset = !!HOLIDAY_PRESETS[y];

  el.innerHTML = `
    <div class="hd-year-bar">
      <button type="button" class="hd-nav-btn" id="hdfPrev">‹</button>
      <strong>${y}년</strong>
      <button type="button" class="hd-nav-btn" id="hdfNext">›</button>
      <span class="hd-year-count">${list.length}건</span>
      ${hasPreset ? `<button type="button" class="btn btn-ghost hd-preset" id="hdfPreset">기본 공휴일 불러오기</button>` : ""}
    </div>
    <div class="hd-holiday-list">
      ${list.length ? "" : `<p class="hd-empty">등록된 휴일이 없습니다. '+ 휴일 추가'를 눌러 등록하세요.</p>`}
      ${list.map((h, i) => `
        <div class="hd-holiday-row">
          <input type="date" class="hd-input" data-idx="${i}" data-field="date" value="${escapeHtml(h.date)}" min="${y}-01-01" max="${y}-12-31" />
          <input type="text" class="hd-input" data-idx="${i}" data-field="name" value="${escapeHtml(h.name)}" placeholder="휴일명" maxlength="30" />
          <button type="button" class="assignee-del" data-del="${i}" title="삭제">✕</button>
        </div>`).join("")}
    </div>
    <button type="button" class="btn btn-ghost btn-sm" id="hdfAdd">+ 휴일 추가</button>`;

  document.getElementById("hdfPrev").onclick = () => { holidayDraftYear--; renderHolidayForm(); };
  document.getElementById("hdfNext").onclick = () => { holidayDraftYear++; renderHolidayForm(); };
  document.getElementById("hdfAdd").onclick = () => {
    list.push({ id: uid(), name: "", date: "" });
    renderHolidayForm();
    const inputs = el.querySelectorAll('.hd-holiday-row input[data-field="date"]');
    if (inputs.length) inputs[inputs.length - 1].focus();
  };
  const presetBtn = document.getElementById("hdfPreset");
  if (presetBtn) presetBtn.onclick = () => {
    const existing = new Set(list.map(h => h.date));
    let added = 0;
    HOLIDAY_PRESETS[y].forEach(([date, name]) => {
      if (!existing.has(date)) { list.push({ id: uid(), name, date }); added++; }
    });
    list.sort((a, b) => (a.date || "9").localeCompare(b.date || "9"));
    renderHolidayForm();
    alert(added ? `${added}건을 추가했습니다. 확인 후 저장을 눌러주세요.` : "이미 모두 등록되어 있습니다.");
  };
  el.querySelectorAll(".hd-holiday-row input").forEach(inp => {
    inp.oninput = () => { list[+inp.dataset.idx][inp.dataset.field] = inp.value; };
    inp.onchange = inp.oninput;
  });
  el.querySelectorAll("[data-del]").forEach(btn => {
    btn.onclick = () => { list.splice(+btn.dataset.del, 1); renderHolidayForm(); };
  });
}

async function saveHolidaySettings() {
  // 검증 + 연도별 재정리 (날짜의 연도 기준) + 날짜순 정렬
  const next = {};
  for (const y of Object.keys(holidayDraft)) {
    for (const h of holidayDraft[y]) {
      const name = (h.name || "").trim();
      if (!h.date && !name) continue; // 빈 행은 무시
      if (!hdIsValidYmd(h.date)) { holidayDraftYear = +y; renderHolidayForm(); alert(`${y}년: 날짜가 비어 있거나 잘못된 휴일이 있습니다.`); return; }
      if (!name) { holidayDraftYear = +y; renderHolidayForm(); alert(`${h.date}: 휴일명을 입력하세요.`); return; }
      const key = h.date.slice(0, 4);
      (next[key] = next[key] || []).push({ id: h.id || uid(), name, date: h.date });
    }
  }
  Object.keys(next).forEach(y => next[y].sort((a, b) => a.date.localeCompare(b.date)));

  const btn = document.getElementById("btnHolidaySave");
  btn.disabled = true;
  holidayState.holidays = next;
  document.getElementById("holidayModal").style.display = "none";
  holidayDraft = null;
  hdRefreshViews();
  try { await saveHolidayData("holidays"); } catch (e) { /* 상태 표시에 안내 */ }
  finally { btn.disabled = false; }
}
