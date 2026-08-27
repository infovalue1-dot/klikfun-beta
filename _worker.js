
const SESSION_TTL_SECONDS = 48 * 60 * 60;
const RETENTION_SECONDS = 30 * 24 * 60 * 60;
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const CODE_RE = /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/;
const ALLOWED_REPORT_REASONS = new Set(["spam","harassment","suspicious","other"]);
const ALLOWED_EVENTS = new Set([
  "consent_ok","friend_started","became_next","ayo_open","plan_created","plan_done",
  "report_open","invite_shared","invite_copied","reward_fixed","reward_downloaded"
]);

let schemaReady = null;

function securityHeaders() {
  return {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "camera=(self), microphone=(), geolocation=(), payment=(), usb=()",
    "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
    "Content-Security-Policy":
      "default-src 'self'; base-uri 'none'; object-src 'none'; frame-ancestors 'none'; " +
      "form-action 'self'; connect-src 'self'; img-src 'self' data: blob:; media-src 'self' blob:; " +
      "script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'"
  };
}

function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...securityHeaders(),
      ...extraHeaders,
    },
  });
}

function nowSec() {
  return Math.floor(Date.now() / 1000);
}

function randomCode(length = 6) {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let out = "";
  for (const b of bytes) out += CODE_ALPHABET[b % CODE_ALPHABET.length];
  return out;
}

function randomToken(bytesLength = 24) {
  const bytes = new Uint8Array(bytesLength);
  crypto.getRandomValues(bytes);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function sha256Hex(value) {
  const data = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, "0")).join("");
}

function safeCode(value) {
  const c = String(value || "").trim().toUpperCase();
  return CODE_RE.test(c) ? c : null;
}

function isIntArray7(arr) {
  return Array.isArray(arr) && arr.length === 7 && arr.every(Number.isInteger);
}

function normalizeText(value) {
  return String(value || "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/(.)\1{3,}/g, "$1$1")
    .replace(/[._*~-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Lightweight server-enforced safety gate.
// Intentionally conservative; future FeNM moderation can be layered on top.
const BLOCK_PATTERNS = [
  /\b(porno|pornografi|bokep|ngentot|ngewe|kontol|memek)\b/i,
  /\b(perkosa|memperkosa|bunuh\s+dia|membunuh\s+dia)\b/i,
  /\b(goblok|tolol|bangsat)\b/i
];
const BODY_SHAME_PATTERNS = [
  /\b(gendut\s+banget|kurus\s+banget|jelek\s+banget|badan\s+.*jelek)\b/i
];

function unsafeText(value) {
  const t = normalizeText(value);
  if (!t) return false;
  return BLOCK_PATTERNS.some(r => r.test(t)) || BODY_SHAME_PATTERNS.some(r => r.test(t));
}

function validateQuestions(qs) {
  if (!Array.isArray(qs) || qs.length !== 7) return false;
  return qs.every(q => {
    if (!q || typeof q !== "object") return false;
    if (typeof q.q !== "string" || q.q.length < 2 || q.q.length > 260) return false;
    if (!Array.isArray(q.o) || q.o.length !== 4) return false;
    if (unsafeText(q.q)) return false;
    return q.o.every(opt =>
      typeof opt === "string" &&
      opt.length >= 1 &&
      opt.length <= 160 &&
      !unsafeText(opt)
    );
  });
}

function validateAnswers(qs, answers) {
  if (!isIntArray7(answers)) return false;
  return answers.every((a, i) => a >= 0 && a < qs[i].o.length);
}

async function readJson(request, maxBytes = 32 * 1024) {
  const type = String(request.headers.get("content-type") || "").toLowerCase();
  if (!type.includes("application/json")) throw new Error("Content-Type harus application/json");

  const len = Number(request.headers.get("content-length") || 0);
  if (len && len > maxBytes) throw new Error("Payload terlalu besar");

  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > maxBytes) throw new Error("Payload terlalu besar");
  if (!text) return {};

  try {
    return JSON.parse(text);
  } catch {
    throw new Error("JSON tidak valid");
  }
}

async function ensureSchema(db) {
  if (!schemaReady) {
    schemaReady = db.batch([
      db.prepare(`
        CREATE TABLE IF NOT EXISTS sessions (
          code TEXT PRIMARY KEY,
          questions TEXT NOT NULL,
          answers TEXT NOT NULL,
          parent_code TEXT,
          delete_hash TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'active',
          created_at INTEGER NOT NULL,
          expires_at INTEGER NOT NULL
        )
      `),
      db.prepare(`CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at)`),
      db.prepare(`
        CREATE TABLE IF NOT EXISTS reports (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          code TEXT NOT NULL,
          reason TEXT NOT NULL,
          reporter_key TEXT,
          created_at INTEGER NOT NULL
        )
      `),
      db.prepare(`CREATE INDEX IF NOT EXISTS idx_reports_code ON reports(code)`),
      db.prepare(`
        CREATE TABLE IF NOT EXISTS events (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          event TEXT NOT NULL,
          code TEXT,
          parent_code TEXT,
          meta TEXT,
          created_at INTEGER NOT NULL
        )
      `),
      db.prepare(`CREATE INDEX IF NOT EXISTS idx_events_created ON events(created_at)`),
      db.prepare(`
        CREATE TABLE IF NOT EXISTS rate_limits (
          bucket TEXT NOT NULL,
          actor TEXT NOT NULL,
          count INTEGER NOT NULL,
          expires_at INTEGER NOT NULL,
          PRIMARY KEY (bucket, actor)
        )
      `),
      db.prepare(`CREATE INDEX IF NOT EXISTS idx_rate_limits_expires ON rate_limits(expires_at)`)
    ]).catch(err => {
      schemaReady = null;
      throw err;
    });
  }
  return schemaReady;
}

async function cleanup(db) {
  const now = nowSec();
  const cutoff = now - RETENTION_SECONDS;
  await db.batch([
    db.prepare(`DELETE FROM sessions WHERE expires_at <= ?`).bind(now),
    db.prepare(`DELETE FROM events WHERE created_at < ?`).bind(cutoff),
    db.prepare(`DELETE FROM reports WHERE created_at < ?`).bind(cutoff),
    db.prepare(`DELETE FROM rate_limits WHERE expires_at <= ?`).bind(now)
  ]);
}

function maybeCleanup(db) {
  const b = new Uint8Array(1);
  crypto.getRandomValues(b);
  if ((b[0] & 63) === 0) return cleanup(db).catch(() => {});
  return Promise.resolve();
}

async function actorKey(request, env) {
  const ip = request.headers.get("CF-Connecting-IP") || "unknown";
  const salt = env.RATE_SALT || "klikfun-rate-v1";
  const ua = String(request.headers.get("user-agent") || "").slice(0, 180);
  return (await sha256Hex(`${salt}|${ip}|${ua}`)).slice(0, 32);
}

async function rateLimit(request, env, db, name, limit, windowSec) {
  const actor = await actorKey(request, env);
  const now = nowSec();
  const bucket = `${name}:${Math.floor(now / windowSec)}`;

  const row = await db.prepare(`
    SELECT count, expires_at FROM rate_limits
    WHERE bucket = ? AND actor = ?
  `).bind(bucket, actor).first();

  if (row && row.expires_at > now && row.count >= limit) {
    return json(
      { error: "Terlalu banyak percobaan. Coba lagi sebentar." },
      429,
      { "Retry-After": String(Math.max(1, row.expires_at - now)) }
    );
  }

  const expires = (Math.floor(now / windowSec) + 1) * windowSec;
  await db.prepare(`
    INSERT INTO rate_limits (bucket, actor, count, expires_at)
    VALUES (?, ?, 1, ?)
    ON CONFLICT(bucket, actor)
    DO UPDATE SET count = count + 1, expires_at = excluded.expires_at
  `).bind(bucket, actor, expires).run();

  return null;
}

function sanitizeMeta(meta) {
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) return {};
  const allowedKeys = new Set(["channel","theme","source","mode"]);
  const out = {};
  for (const [k, v] of Object.entries(meta)) {
    if (!allowedKeys.has(k)) continue;
    if (typeof v === "string") out[k] = v.slice(0, 80);
    else if (typeof v === "number" && Number.isFinite(v)) out[k] = v;
    else if (typeof v === "boolean") out[k] = v;
  }
  return out;
}

function constantTimeEqualHex(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function createSession(request, env, db) {
  const limited = await rateLimit(request, env, db, "create_session", 10, 10 * 60);
  if (limited) return limited;

  const body = await readJson(request, 32 * 1024);
  const questions = body.questions;
  const answers = body.answers;

  if (body.consent !== true) return json({ error: "Persetujuan diperlukan" }, 400);
  if (!validateQuestions(questions)) return json({ error: "Pertanyaan ronde tidak valid" }, 400);
  if (!validateAnswers(questions, answers)) return json({ error: "Jawaban ronde tidak valid" }, 400);

  const parentCode = body.parent_code ? safeCode(body.parent_code) : null;
  const deleteKey = randomToken(24);
  const deleteHash = await sha256Hex(deleteKey);
  const created = nowSec();
  const expires = created + SESSION_TTL_SECONDS;

  await maybeCleanup(db);

  for (let attempt = 0; attempt < 12; attempt++) {
    const code = randomCode(6);
    try {
      await db.prepare(`
        INSERT INTO sessions
          (code, questions, answers, parent_code, delete_hash, status, created_at, expires_at)
        VALUES (?, ?, ?, ?, ?, 'active', ?, ?)
      `).bind(
        code,
        JSON.stringify(questions),
        JSON.stringify(answers),
        parentCode,
        deleteHash,
        created,
        expires
      ).run();

      return json({
        code,
        delete_key: deleteKey,
        expires_at: expires,
        expires_in_seconds: SESSION_TTL_SECONDS
      }, 201);
    } catch (e) {
      if (!String(e?.message || e).toLowerCase().includes("unique")) throw e;
    }
  }
  return json({ error: "Gagal membuat kode unik. Coba lagi." }, 503);
}

async function getSession(request, env, code, db) {
  const limited = await rateLimit(request, env, db, "get_session", 60, 10 * 60);
  if (limited) return limited;

  const now = nowSec();
  const row = await db.prepare(`
    SELECT code, questions, parent_code, created_at, expires_at
    FROM sessions
    WHERE code = ? AND status = 'active' AND expires_at > ?
  `).bind(code, now).first();

  if (!row) return json({ error: "Kode tidak ditemukan atau sudah kedaluwarsa" }, 404);

  return json({
    code: row.code,
    questions: JSON.parse(row.questions),
    parent_code: row.parent_code || null,
    created_at: row.created_at,
    expires_at: row.expires_at
  });
}

async function submitGuess(request, env, code, db) {
  const limited = await rateLimit(request, env, db, "guess", 60, 10 * 60);
  if (limited) return limited;

  const body = await readJson(request, 8 * 1024);
  const guesses = body.guesses;
  if (!isIntArray7(guesses)) return json({ error: "Tebakan harus berisi 7 jawaban" }, 400);

  const row = await db.prepare(`
    SELECT questions, answers
    FROM sessions
    WHERE code = ? AND status = 'active' AND expires_at > ?
  `).bind(code, nowSec()).first();

  if (!row) return json({ error: "Ronde tidak ditemukan atau sudah kedaluwarsa" }, 404);

  const questions = JSON.parse(row.questions);
  const answers = JSON.parse(row.answers);

  if (!validateAnswers(questions, guesses)) return json({ error: "Format tebakan tidak valid" }, 400);

  let score = 0;
  const misses = [];
  for (let i = 0; i < 7; i++) {
    if (guesses[i] === answers[i]) score++;
    else misses.push(i);
  }

  return json({ score, misses });
}

async function deleteSession(request, env, code, db) {
  const limited = await rateLimit(request, env, db, "delete", 12, 60 * 60);
  if (limited) return limited;

  const body = await readJson(request, 4 * 1024);
  const key = String(body.delete_key || "");
  if (!key || key.length > 128) return json({ error: "Kunci hapus diperlukan" }, 400);

  const row = await db.prepare(`
    SELECT delete_hash, status
    FROM sessions
    WHERE code = ?
  `).bind(code).first();

  if (!row || row.status !== "active") return json({ error: "Ronde tidak ditemukan" }, 404);

  const suppliedHash = await sha256Hex(key);
  if (!constantTimeEqualHex(suppliedHash, row.delete_hash)) {
    return json({ error: "Kunci hapus tidak cocok" }, 403);
  }

  await db.prepare(`
    UPDATE sessions
    SET status = 'deleted', questions = '[]', answers = '[]', expires_at = ?
    WHERE code = ?
  `).bind(nowSec(), code).run();

  return json({ ok: true });
}

async function submitReport(request, env, code, db) {
  const limited = await rateLimit(request, env, db, "report", 5, 60 * 60);
  if (limited) return limited;

  const body = await readJson(request, 4 * 1024);
  const reason = String(body.reason || "");
  if (!ALLOWED_REPORT_REASONS.has(reason)) return json({ error: "Alasan laporan tidak valid" }, 400);

  const exists = await db.prepare(`
    SELECT 1 AS ok FROM sessions WHERE code = ? LIMIT 1
  `).bind(code).first();
  if (!exists) return json({ error: "Ronde tidak ditemukan" }, 404);

  const reporter = await actorKey(request, env);
  const recent = await db.prepare(`
    SELECT 1 AS ok FROM reports
    WHERE code = ? AND reporter_key = ? AND created_at > ?
    LIMIT 1
  `).bind(code, reporter, nowSec() - 24 * 60 * 60).first();

  if (recent) return json({ ok: true }, 200);

  await db.prepare(`
    INSERT INTO reports (code, reason, reporter_key, created_at)
    VALUES (?, ?, ?, ?)
  `).bind(code, reason, reporter, nowSec()).run();

  return json({ ok: true }, 201);
}

async function submitEvent(request, env, db) {
  const limited = await rateLimit(request, env, db, "event", 120, 10 * 60);
  if (limited) return limited;

  const body = await readJson(request, 4 * 1024);
  const event = String(body.event || "");
  if (!ALLOWED_EVENTS.has(event)) return json({ error: "Event tidak diizinkan" }, 400);

  const code = body.code ? safeCode(body.code) : null;
  const parentCode = body.parent_code ? safeCode(body.parent_code) : null;
  const metaText = JSON.stringify(sanitizeMeta(body.meta));

  await db.prepare(`
    INSERT INTO events (event, code, parent_code, meta, created_at)
    VALUES (?, ?, ?, ?, ?)
  `).bind(event, code, parentCode, metaText, nowSec()).run();

  return json({ ok: true }, 201);
}

async function api(request, env) {
  if (!env.DB) {
    return json({
      error: "Database belum terhubung. Tambahkan D1 binding dengan nama DB pada project Cloudflare Pages."
    }, 503);
  }

  await ensureSchema(env.DB);

  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method.toUpperCase();

  if (path === "/api/config" && method === "GET") {
    return json({
      beta_min_age: 18,
      session_ttl_hours: SESSION_TTL_SECONDS / 3600,
      telemetry_retention_days: RETENTION_SECONDS / 86400,
      max_group_people: 5,
      public_reward_themes: 10,
      photo_ttl_hours: 5
    });
  }

  if (path === "/api/session" && method === "POST") {
    return createSession(request, env, env.DB);
  }

  let m = path.match(/^\/api\/session\/([A-Z2-9]{6})$/i);
  if (m && method === "GET") {
    const code = safeCode(m[1]);
    return code ? getSession(request, env, code, env.DB) : json({ error: "Kode tidak valid" }, 400);
  }

  m = path.match(/^\/api\/session\/([A-Z2-9]{6})\/delete$/i);
  if (m && method === "POST") {
    const code = safeCode(m[1]);
    return code ? deleteSession(request, env, code, env.DB) : json({ error: "Kode tidak valid" }, 400);
  }

  m = path.match(/^\/api\/guess\/([A-Z2-9]{6})$/i);
  if (m && method === "POST") {
    const code = safeCode(m[1]);
    return code ? submitGuess(request, env, code, env.DB) : json({ error: "Kode tidak valid" }, 400);
  }

  m = path.match(/^\/api\/report\/([A-Z2-9]{6})$/i);
  if (m && method === "POST") {
    const code = safeCode(m[1]);
    return code ? submitReport(request, env, code, env.DB) : json({ error: "Kode tidak valid" }, 400);
  }

  if (path === "/api/event" && method === "POST") {
    return submitEvent(request, env, env.DB);
  }

  if (path.startsWith("/api/")) {
    return json({ error: "Endpoint tidak ditemukan" }, 404);
  }

  return null;
}

function withSecurityHeaders(response) {
  const headers = new Headers(response.headers);
  for (const [k, v] of Object.entries(securityHeaders())) headers.set(k, v);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}

export default {
  async fetch(request, env) {
    try {
      const url = new URL(request.url);

      if (url.pathname.startsWith("/api/")) {
        const response = await api(request, env);
        if (response) return response;
      }

      const assetResponse = await env.ASSETS.fetch(request);
      return withSecurityHeaders(assetResponse);
    } catch (e) {
      console.error("Klikfun worker error", e);
      const msg = String(e?.message || "");
      if (
        msg === "Payload terlalu besar" ||
        msg === "JSON tidak valid" ||
        msg === "Content-Type harus application/json"
      ) {
        return json({ error: msg }, 400);
      }
      return json({ error: "Terjadi gangguan server. Coba lagi." }, 500);
    }
  }
};
