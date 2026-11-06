// 업무상세내역(detail.html) 전용 공통 함수 — ?ns=detail
// - 파일명이 "_" 로 시작하므로 Vercel 이 API 주소로 노출하지 않습니다. (서버 함수 개수 증가 없음)
// - 저장 키(KV)
//     detail:months                       탭 목록 (months.js 가 그대로 처리)
//     detail:tasks:<탭명>:<메일>           사용자별 · 탭별 업무 상세 목록
//     detail:owners:<탭명>                 해당 탭에 저장한 사용자 메일 목록 (관리자 전체 조회용)
//     detail:favorites:<메일>              사용자별 분류 즐겨찾기 (settings.js, month=favorites)
//     detail:settings:<YYYY.MM>            월별 기준 MM (settings.js)
//     detail:assignees / detail:categories 담당자 · 분류 (관리자만 저장)
// - 일반 사용자는 본인 데이터만 읽고 쓸 수 있고, 관리자는 전체 조회 · 탭 삭제 · 다른 사용자 데이터 저장이 가능합니다.

const { getClient, getJSON, setJSON } = require("./_kv");
const { randomUUID } = require("crypto");

const DETAIL_NS = "detail";
const MAX_ROWS = 5000;          // 한 사람 · 한 탭 최대 건수
const TITLE_MAX = 300;          // 업무명 최대 글자 수

function isDetail(ns) { return ns && ns.ns === DETAIL_NS; }

function normEmail(v) { return String(v || "").trim().toLowerCase(); }

function tabOf(req, body) {
  let m = (body && body.month) || (req.query && req.query.month) || "";
  if (Array.isArray(m)) m = m[0];
  return String(m).trim().slice(0, 60);
}

const taskKey = (tab, email) => `${DETAIL_NS}:tasks:${tab}:${email}`;
const ownersKey = (tab) => `${DETAIL_NS}:owners:${tab}`;

function str(v, max) { return String(v == null ? "" : v).trim().slice(0, max || 100); }

// 저장 전 값 정리 (작성자 메일은 서버가 붙입니다)
function cleanRow(t, owner) {
  const minutes = Math.max(0, Math.min(9999, parseInt(t.minutes, 10) || 0));
  return {
    id: str(t.id, 80) || randomUUID(),
    month: str(t.month, 7),
    title: str(t.title, TITLE_MAX),
    worker: str(t.worker, 40),
    date: str(t.date, 10),
    minutes,
    count: 1,
    major: str(t.major, 60),
    minor: str(t.minor, 60),
    sub: str(t.sub, 120),
    createdBy: owner,
    createdAt: str(t.createdAt, 30) || new Date().toISOString(),
    updatedAt: str(t.updatedAt, 30) || new Date().toISOString()
  };
}

async function handleDetailTasks(req, res) {
  const me = req.authUser || {};
  const myEmail = normEmail(me.email);
  const body = req.body || {};
  const tab = tabOf(req, body);
  if (!tab) return res.status(400).json({ error: "month(탭명) 값이 필요합니다." });

  if (req.method === "GET") {
    let scope = req.query.scope;
    if (Array.isArray(scope)) scope = scope[0];
    if (scope === "all") {
      if (!me.admin) return res.status(403).json({ error: "관리자만 전체 데이터를 조회할 수 있습니다." });
      const owners = (await getClient().smembers(ownersKey(tab))) || [];
      if (!owners.length) return res.status(200).json({ tasks: [] });
      const lists = await getClient().mget(...owners.map((e) => taskKey(tab, e)));
      const tasks = [];
      (lists || []).forEach((list, i) => {
        (Array.isArray(list) ? list : []).forEach((t) => tasks.push({ ...t, createdBy: t.createdBy || owners[i] }));
      });
      return res.status(200).json({ tasks });
    }
    const tasks = await getJSON(taskKey(tab, myEmail), []);
    return res.status(200).json({ tasks: Array.isArray(tasks) ? tasks : [] });
  }

  if (req.method === "PUT") {
    if (!Array.isArray(body.tasks)) return res.status(400).json({ error: "tasks 배열이 필요합니다." });
    if (body.tasks.length > MAX_ROWS) return res.status(400).json({ error: `한 탭에 최대 ${MAX_ROWS}건까지 저장할 수 있습니다.` });
    // 관리자는 다른 사용자 데이터도 저장 가능 (담당자 이름 변경 반영용)
    let owner = myEmail;
    if (body.user && normEmail(body.user) !== myEmail) {
      if (!me.admin) return res.status(403).json({ error: "다른 사용자의 데이터는 저장할 수 없습니다." });
      owner = normEmail(body.user);
    }
    const tasks = body.tasks.map((t) => cleanRow(t || {}, owner));
    await setJSON(taskKey(tab, owner), tasks);
    await getClient().sadd(ownersKey(tab), owner);
    return res.status(200).json({ tasks });
  }

  if (req.method === "DELETE") {
    if (!me.admin) return res.status(403).json({ error: "관리자만 탭을 삭제할 수 있습니다." });
    const owners = (await getClient().smembers(ownersKey(tab))) || [];
    const keys = owners.map((e) => taskKey(tab, e)).concat(ownersKey(tab));
    await getClient().del(...keys);
    return res.status(200).json({ ok: true, deleted: owners.length });
  }

  return res.status(405).json({ error: "지원하지 않는 메서드입니다." });
}

// assignees · categories · settings(기준 MM) 저장은 관리자만
function denyNonAdminWrite(req, res, ns) {
  if (!isDetail(ns) || req.method === "GET") return false;
  if (req.authUser && req.authUser.admin) return false;
  res.status(403).json({ error: "관리자만 변경할 수 있습니다." });
  return true;
}

module.exports = { isDetail, handleDetailTasks, denyNonAdminWrite, normEmail, DETAIL_NS };
