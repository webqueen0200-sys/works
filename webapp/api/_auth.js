// 로그인 · 사용자 관리 공통 함수
// - 파일명이 "_" 로 시작하므로 Vercel 이 API 주소로 노출하지 않습니다.
// - 저장 키(KV)
//     auth:users            사용자 목록 (배열)
//     auth:session:<토큰>    로그인 세션 (자동 만료)
//     auth:fail:<메일>       로그인 실패 횟수 (15분 후 자동 초기화)
// - 비밀번호는 원문을 저장하지 않고 scrypt 해시로만 저장합니다.

const crypto = require("crypto");
const { getClient, getJSON, setJSON } = require("./_kv");

const USERS_KEY = "auth:users";
const SESSION_PREFIX = "auth:session:";
const FAIL_PREFIX = "auth:fail:";

const DEFAULT_PASSWORD = "medialog2026!";              // 신규 등록 · 비밀번호 리셋 시 초기 비밀번호
const BOOTSTRAP_ADMIN = { email: "0590@medialog.co.kr", name: "관리자" }; // 사용자가 한 명도 없을 때 자동 생성
const SESSION_TTL_SEC = 60 * 60 * 24 * 7;              // 로그인 유지 7일
const FAIL_LIMIT = 10;                                  // 15분 내 10회 실패 시 잠시 차단
const FAIL_WINDOW_SEC = 60 * 15;
const MIN_PASSWORD_LEN = 8;

function normEmail(v) {
  return String(v || "").trim().toLowerCase();
}

function isValidEmail(v) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

function hashPassword(password, salt) {
  const s = salt || crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(String(password), s, 64).toString("hex");
  return { salt: s, hash };
}

function verifyPassword(password, user) {
  if (!user || !user.hash || !user.salt) return false;
  const a = Buffer.from(hashPassword(password, user.salt).hash, "hex");
  const b = Buffer.from(user.hash, "hex");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// 화면으로 내려보내는 사용자 정보 (해시 등 민감 정보 제외)
function publicUser(u) {
  return {
    email: u.email,
    name: u.name || "",
    active: u.active !== false,
    admin: !!u.admin,
    mustChange: !!u.mustChange,
    createdAt: u.createdAt || null,
    updatedAt: u.updatedAt || null,
    lastLoginAt: u.lastLoginAt || null
  };
}

function newUser({ email, name, admin }) {
  const now = new Date().toISOString();
  const { salt, hash } = hashPassword(DEFAULT_PASSWORD);
  return {
    email: normEmail(email),
    name: String(name || "").trim(),
    active: true,
    admin: !!admin,
    salt,
    hash,
    ver: 1,               // 비밀번호 변경·리셋·사용 불가 시 올려서 기존 로그인을 끊습니다
    mustChange: true,     // 초기 비밀번호로 로그인하면 변경 화면을 먼저 띄웁니다
    createdAt: now,
    updatedAt: now,
    lastLoginAt: null
  };
}

async function getUsers() {
  const list = await getJSON(USERS_KEY, []);
  return Array.isArray(list) ? list : [];
}

async function saveUsers(list) {
  await setJSON(USERS_KEY, list);
}

// 사용자가 한 명도 없으면 최초 관리자 계정을 만듭니다.
async function getUsersWithBootstrap() {
  const list = await getUsers();
  if (list.length) return list;
  const admin = newUser({ ...BOOTSTRAP_ADMIN, admin: true });
  await saveUsers([admin]);
  return [admin];
}

function newToken() {
  return crypto.randomBytes(32).toString("hex");
}

async function createSession(user) {
  const token = newToken();
  await getClient().set(SESSION_PREFIX + token, { email: user.email, ver: user.ver || 1 }, { ex: SESSION_TTL_SEC });
  return token;
}

async function deleteSession(token) {
  if (!token) return;
  await getClient().del(SESSION_PREFIX + token);
}

function readToken(req) {
  const h = (req.headers && (req.headers.authorization || req.headers.Authorization)) || "";
  const m = /^Bearer\s+([a-f0-9]{64})$/i.exec(String(h).trim());
  return m ? m[1] : "";
}

// 요청의 토큰을 확인해 로그인 사용자를 돌려줍니다. 실패하면 null.
async function authenticate(req) {
  const token = readToken(req);
  if (!token) return null;
  const session = await getClient().get(SESSION_PREFIX + token);
  if (!session || !session.email) return null;
  const users = await getUsers();
  const user = users.find((u) => u.email === session.email);
  if (!user || user.active === false || (user.ver || 1) !== (session.ver || 1)) {
    await deleteSession(token);
    return null;
  }
  return { user, token };
}

// 로그인 실패 횟수 (이메일 기준)
async function failCount(email) {
  const v = await getClient().get(FAIL_PREFIX + email);
  return Number(v) || 0;
}

async function addFail(email) {
  const key = FAIL_PREFIX + email;
  const n = await getClient().incr(key);
  if (n === 1) await getClient().expire(key, FAIL_WINDOW_SEC);
  return n;
}

async function clearFail(email) {
  await getClient().del(FAIL_PREFIX + email);
}

function checkNewPassword(pw) {
  const s = String(pw || "");
  if (s.length < MIN_PASSWORD_LEN) return `비밀번호는 ${MIN_PASSWORD_LEN}자 이상이어야 합니다.`;
  if (s === DEFAULT_PASSWORD) return "초기 비밀번호와 다른 비밀번호를 사용하세요.";
  if (!/[A-Za-z]/.test(s) || !/[0-9]/.test(s)) return "영문과 숫자를 함께 사용하세요.";
  return "";
}

module.exports = {
  DEFAULT_PASSWORD, SESSION_TTL_SEC, FAIL_LIMIT,
  normEmail, isValidEmail, hashPassword, verifyPassword, publicUser, newUser,
  getUsers, saveUsers, getUsersWithBootstrap,
  createSession, deleteSession, readToken, authenticate,
  failCount, addFail, clearFail, checkNewPassword
};
