/**
 * Taskly contact-info API (Vercel serverless function) -> route: /api/contact
 * Lets the admin edit what the landing page's "Contact us" section shows.
 * Stored in Supabase table: taskly_settings (run sql/taskly_settings.sql once).
 *
 *   GET  /api/contact   public   -> { info: { lede, email, phone, address, hours } }  ({} until first save)
 *   PUT  /api/contact   admin    save the fields above (header x-admin-key: <ADMIN_PASSWORD>)
 *
 * Env vars (already set for the other API files): SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ADMIN_PASSWORD
 */
const crypto = require("crypto");

const URL_BASE = (process.env.SUPABASE_URL || "").replace(/\/$/, "");
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
/* legacy service_role keys are JWTs (eyJ...) and go in Authorization too; new sb_secret_ keys must only be sent as apikey */
const AUTH = /^eyJ/.test(KEY) ? { Authorization: `Bearer ${KEY}` } : {};
const TABLE = "taskly_settings";
const ROW = "contact";

const json = (res, code, body) => {
  res.statusCode = code;
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(body));
};

function isAdmin(req) {
  const given = String(req.headers["x-admin-key"] || "");
  const real = process.env.ADMIN_PASSWORD || "";
  if (!real || !given) return false;
  const a = crypto.createHash("sha256").update(given).digest();
  const b = crypto.createHash("sha256").update(real).digest();
  return crypto.timingSafeEqual(a, b);
}

async function sb(path, opts = {}) {
  const r = await fetch(`${URL_BASE}/rest/v1/${path}`, {
    ...opts,
    headers: {
      apikey: KEY,
      ...AUTH,
      "Content-Type": "application/json",
      Prefer: "return=representation",
      ...(opts.headers || {}),
    },
  });
  const text = await r.text();
  if (!r.ok) throw new Error(text || `Supabase ${r.status}`);
  return text ? JSON.parse(text) : [];
}

/* single-line fields lose control characters; multi-line fields keep line breaks */
const one = (s, n) => String(s == null ? "" : s).replace(/[\u0000-\u001f]/g, " ").trim().slice(0, n);
const multi = (s, n) =>
  String(s == null ? "" : s).replace(/\r/g, "").replace(/[\u0000-\u0009\u000b-\u001f]/g, " ").trim().slice(0, n);

module.exports = async (req, res) => {
  if (!URL_BASE || !KEY) return json(res, 500, { error: "Server is not configured" });
  try {
    if (req.method === "GET") {
      const rows = await sb(`${TABLE}?select=value&key=eq.${ROW}&limit=1`);
      return json(res, 200, { info: (rows[0] && rows[0].value) || {} });
    }

    if (req.method === "PUT" || req.method === "POST") {
      if (!isAdmin(req)) return json(res, 401, { error: "Unauthorized" });
      let b = req.body;
      if (typeof b === "string") { try { b = JSON.parse(b); } catch (e) { b = {}; } }
      b = b || {};
      const info = {
        lede: multi(b.lede, 400),
        email: one(b.email, 120),
        phone: one(b.phone, 40),
        address: multi(b.address, 200),
        hours: one(b.hours, 120),
      };
      if (info.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(info.email)) {
        return json(res, 400, { error: "That email address does not look valid" });
      }
      const rows = await sb(`${TABLE}?on_conflict=key`, {
        method: "POST",
        headers: { Prefer: "resolution=merge-duplicates,return=representation" },
        body: JSON.stringify({ key: ROW, value: info, updated_at: new Date().toISOString() }),
      });
      return json(res, 200, { ok: true, info: (rows[0] && rows[0].value) || info });
    }

    res.setHeader("Allow", "GET, PUT");
    return json(res, 405, { error: "Method not allowed" });
  } catch (e) {
    /* only admins get the real reason (e.g. a missing table); the public sees a generic message */
    return json(res, 500, { error: "Request failed", detail: isAdmin(req) ? String((e && e.message) || e).slice(0, 300) : undefined });
  }
};
