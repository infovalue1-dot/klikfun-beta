const SESSION_TTL_SECONDS = 48 * 60 * 60;
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const ALLOWED_REPORT_REASONS = new Set(["spam","harassment","suspicious","other"]);

function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
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
  return /^[A-Z2-9]{6}$/.test(c) ? c : null;
}

function isIntArray7(arr) {
  return Array.isArray(arr) && arr.length === 7 && arr.every(Number.isInteger);
}

function validateQuestions(qs) {
  if (!Array.isArray(qs) || qs.length !== 7) return false;
  return qs.every(q =>
    q && typeof q === "object" &&
    typeof q.q === "string" &&
    Array.isArray(q.o) &&
    q.o.length >= 2 &&
    q.o.length <= 8
  );
}

function validateAnswers(qs, answers) {
  if (!isIntArray7(answers)) return false;
  return answers.every((a, i) => a >= 0 && a < qs[i].o.length);
}

async function readJson(request, maxBytes = 64 * 1024) {
  const len = Number(request.headers.get("content-length") || 0);
  if (len && len > maxBytes) throw new Error("Payload terlalu besar");
  const text = await request.text();
  if (text.length > maxBytes) throw new Error("Payload terlalu besar");
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    throw new Error("JSON tidak valid");
  }
}

async function ensureSchema(db) {
  await db.batch([
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
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_events_created ON events(created_at)`)
  ]);
}

async function cleanup(db) {
  const now = nowSec();
  await db.prepare(`DELETE FROM sessions WHERE expires_at <= ?`).bind(now).run();
  // Telemetry/report retention: 30 days for this beta.
  const cutoff = now - (30 * 24 * 60 * 60);
  await db.prepare(`DELETE FROM events WHERE created_at < ?`).bind(cutoff).run();
  await db.prepare(`DELETE FROM reports WHERE created_at < ?`).bind(cutoff).run();
}

async function createSession(request, db) {
  const body = await readJson(request);
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

  await cleanup(db);

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

async function getSession(code, db) {
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

async function submitGuess(request, code, db) {
  const body = await readJson(request);
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

async function deleteSession(request, code, db) {
  const body = await readJson(request);
  const key = String(body.delete_key || "");
  if (!key) return json({ error: "Kunci hapus diperlukan" }, 400);

  const row = await db.prepare(`
    SELECT delete_hash, status
    FROM sessions
    WHERE code = ?
  `).bind(code).first();

  if (!row || row.status !== "active") return json({ error: "Ronde tidak ditemukan" }, 404);

  const suppliedHash = await sha256Hex(key);
  if (suppliedHash !== row.delete_hash) return json({ error: "Kunci hapus tidak cocok" }, 403);

  await db.prepare(`
    UPDATE sessions
    SET status = 'deleted', questions = '[]', answers = '[]', expires_at = ?
    WHERE code = ?
  `).bind(nowSec(), code).run();

  return json({ ok: true });
}

async function submitReport(request, code, db) {
  const body = await readJson(request, 8 * 1024);
  const reason = String(body.reason || "");
  if (!ALLOWED_REPORT_REASONS.has(reason)) return json({ error: "Alasan laporan tidak valid" }, 400);

  await db.prepare(`
    INSERT INTO reports (code, reason, created_at)
    VALUES (?, ?, ?)
  `).bind(code, reason, nowSec()).run();

  return json({ ok: true }, 201);
}

async function submitEvent(request, db) {
  const body = await readJson(request, 8 * 1024);
  const event = String(body.event || "").slice(0, 64);
  if (!/^[a-z0-9_:-]{1,64}$/i.test(event)) return json({ error: "Event tidak valid" }, 400);

  const code = body.code ? safeCode(body.code) : null;
  const parentCode = body.parent_code ? safeCode(body.parent_code) : null;
  let meta = body.meta && typeof body.meta === "object" ? body.meta : {};
  let metaText = JSON.stringify(meta);
  if (metaText.length > 2000) metaText = JSON.stringify({ truncated: true });

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
      telemetry_retention_days: 30
    });
  }

  if (path === "/api/session" && method === "POST") {
    return createSession(request, env.DB);
  }

  let m = path.match(/^\/api\/session\/([A-Z2-9]{6})$/i);
  if (m && method === "GET") {
    const code = safeCode(m[1]);
    return code ? getSession(code, env.DB) : json({ error: "Kode tidak valid" }, 400);
  }

  m = path.match(/^\/api\/session\/([A-Z2-9]{6})\/delete$/i);
  if (m && method === "POST") {
    const code = safeCode(m[1]);
    return code ? deleteSession(request, code, env.DB) : json({ error: "Kode tidak valid" }, 400);
  }

  m = path.match(/^\/api\/guess\/([A-Z2-9]{6})$/i);
  if (m && method === "POST") {
    const code = safeCode(m[1]);
    return code ? submitGuess(request, code, env.DB) : json({ error: "Kode tidak valid" }, 400);
  }

  m = path.match(/^\/api\/report\/([A-Z2-9]{6})$/i);
  if (m && method === "POST") {
    const code = safeCode(m[1]);
    return code ? submitReport(request, code, env.DB) : json({ error: "Kode tidak valid" }, 400);
  }

  if (path === "/api/event" && method === "POST") {
    return submitEvent(request, env.DB);
  }

  if (path.startsWith("/api/")) {
    return json({ error: "Endpoint tidak ditemukan" }, 404);
  }

  return null;
}

export default {
  async fetch(request, env) {
    try {
      const url = new URL(request.url);

      if (url.pathname.startsWith("/api/")) {
        const response = await api(request, env);
        if (response) return response;
      }

      return env.ASSETS.fetch(request);
    } catch (e) {
      console.error("Klikfun worker error", e);
      return json({ error: "Terjadi gangguan server. Coba lagi." }, 500);
    }
  }
};
