/**
 * Shared helpers for every Taskly API route.
 * Files starting with "_" are not turned into routes by Vercel, so this is only imported by the other files in /api.
 */
const crypto = require("crypto");

const BASE = (process.env.SUPABASE_URL || "").replace(/\/$/, "");
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
/* legacy service_role keys are JWTs (eyJ...) and go in Authorization too; new sb_secret_ keys must only be sent as apikey */
const AUTH = /^eyJ/.test(KEY) ? { Authorization: `Bearer ${KEY}` } : {};
const HEADERS = { apikey: KEY, ...AUTH, "Content-Type": "application/json" };

const configured = () => !!(BASE && KEY);

const json = (res, code, body) => {
  res.statusCode = code;
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(body));
};

/* ---------- tiny in-memory rate limiter ----------
   Best effort only: every serverless instance has its own memory, but it stops casual spam and password guessing. */
const buckets = new Map();
function ip(req) {
  return String(req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "?").split(",")[0].trim();
}
/** true when the caller is still inside the limit (and counts this call) */
function allow(req, name, max, windowMs) {
  const now = Date.now();
  const k = `${name}|${ip(req)}`;
  let b = buckets.get(k);
  if (!b || now > b.reset) b = { n: 0, reset: now + windowMs };
  b.n++;
  buckets.set(k, b);
  if (buckets.size > 5000) for (const [key, v] of buckets) if (now > v.reset) buckets.delete(key);
  return b.n <= max;
}

/* ---------- admin check (constant-time, with a brake on password guessing) ---------- */
function isAdmin(req) {
  const given = String(req.headers["x-admin-key"] || "");
  const real = process.env.ADMIN_PASSWORD || "";
  if (!real || !given) return false;
  const a = crypto.createHash("sha256").update(given).digest();
  const b = crypto.createHash("sha256").update(real).digest();
  return crypto.timingSafeEqual(a, b);
}
const failBucket = (req) => buckets.get(`admin-fail|${ip(req)}`);
/** admin check for routes: a wrong key counts as a failure; after 10 failures in 15 minutes the IP is locked out */
function adminOk(req) {
  const f = failBucket(req);
  if (f && Date.now() < f.reset && f.n >= 10) return false;
  if (isAdmin(req)) return true;
  if (req.headers["x-admin-key"]) allow(req, "admin-fail", 1e9, 15 * 60000);
  return false;
}

/* ---------- Supabase REST ---------- */
async function sb(path, opts = {}) {
  const r = await fetch(`${BASE}/rest/v1/${path}`, {
    ...opts,
    headers: { ...HEADERS, Prefer: "return=representation", ...(opts.headers || {}) },
  });
  const text = await r.text();
  if (!r.ok) throw new Error(text || `Supabase ${r.status}`);
  return text ? JSON.parse(text) : [];
}

/* ---------- request body / text cleaning ---------- */
function body(req) {
  let b = req.body;
  if (typeof b === "string") {
    try { b = JSON.parse(b); } catch (e) { b = {}; }
  }
  return b && typeof b === "object" ? b : {};
}
/* single-line text */
const one = (s, n) => String(s == null ? "" : s).replace(/[\u0000-\u001f]/g, " ").trim().slice(0, n);
/* multi-line text: keeps line breaks, drops other control characters */
const multi = (s, n) =>
  String(s == null ? "" : s).replace(/\r\n?/g, "\n").replace(/[\u0000-\u0009\u000b-\u001f]/g, " ").replace(/\n{3,}/g, "\n\n").trim().slice(0, n);

/* what an admin may see about a failure (visitors only ever get a generic message) */
const detail = (req, e) => (isAdmin(req) ? String((e && e.message) || e).slice(0, 300) : undefined);

module.exports = { BASE, KEY, AUTH, HEADERS, configured, json, allow, ip, isAdmin, adminOk, sb, body, one, multi, detail, crypto };
