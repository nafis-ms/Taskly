/**
 * Taskly developers API (Vercel serverless function) -> route: /api/developers
 * Lets the admin manage up to 3 developer cards shown in the landing page "Meet the developers" section.
 * Stored in Supabase table taskly_settings (same table as /api/contact, see sql/taskly_settings.sql).
 *
 *   GET  /api/developers   public   -> { developers: [ {name, role, bio, photo, github, linkedin, website} ] }  (max 3)
 *   PUT  /api/developers   admin    body { developers: [...] }   header x-admin-key: <ADMIN_PASSWORD>
 *                                   (cards without a name are dropped; links must start with http:// or https://)
 */
const crypto = require("crypto");

const URL_BASE = (process.env.SUPABASE_URL || "").replace(/\/$/, "");
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
/* legacy service_role keys are JWTs (eyJ...) and go in Authorization too; new sb_secret_ keys must only be sent as apikey */
const AUTH = /^eyJ/.test(KEY) ? { Authorization: `Bearer ${KEY}` } : {};
const TABLE = "taskly_settings";
const ROW = "developers";
const MAX = 3;

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

const one = (s, n) => String(s == null ? "" : s).replace(/[\u0000-\u001f]/g, " ").trim().slice(0, n);
const multi = (s, n) =>
  String(s == null ? "" : s).replace(/\r/g, "").replace(/[\u0000-\u0009\u000b-\u001f]/g, " ").trim().slice(0, n);

class Bad extends Error {}

/* only plain http(s) links are accepted (no javascript:, data:, etc.) */
function link(s, label) {
  const v = one(s, 300);
  if (!v) return "";
  let u;
  try { u = new URL(v); } catch (e) { throw new Bad(`${label} must be a full link starting with https://`); }
  if (u.protocol !== "https:" && u.protocol !== "http:") throw new Bad(`${label} must start with https:// or http://`);
  return u.href.slice(0, 300);
}

function cleanList(input) {
  const list = Array.isArray(input) ? input : [];
  const out = [];
  list.forEach((d, i) => {
    d = d || {};
    const name = one(d.name, 60);
    if (!name) return;
    const n = `Developer ${i + 1}`;
    out.push({
      name,
      role: one(d.role, 80),
      bio: multi(d.bio, 300),
      photo: link(d.photo, `${n}: photo link`),
      github: link(d.github, `${n}: GitHub link`),
      linkedin: link(d.linkedin, `${n}: LinkedIn link`),
      website: link(d.website, `${n}: website link`),
    });
  });
  return out.slice(0, MAX);
}

module.exports = async (req, res) => {
  if (!URL_BASE || !KEY) return json(res, 500, { error: "Server is not configured" });
  try {
    if (req.method === "GET") {
      const rows = await sb(`${TABLE}?select=value&key=eq.${ROW}&limit=1`);
      const v = rows[0] && rows[0].value;
      return json(res, 200, { developers: v && Array.isArray(v.list) ? v.list.slice(0, MAX) : [] });
    }

    if (req.method === "PUT" || req.method === "POST") {
      if (!isAdmin(req)) return json(res, 401, { error: "Unauthorized" });
      let b = req.body;
      if (typeof b === "string") { try { b = JSON.parse(b); } catch (e) { b = {}; } }
      const list = cleanList((b || {}).developers);
      const rows = await sb(`${TABLE}?on_conflict=key`, {
        method: "POST",
        headers: { Prefer: "resolution=merge-duplicates,return=representation" },
        body: JSON.stringify({ key: ROW, value: { list }, updated_at: new Date().toISOString() }),
      });
      const v = rows[0] && rows[0].value;
      return json(res, 200, { ok: true, developers: v && Array.isArray(v.list) ? v.list : list });
    }

    res.setHeader("Allow", "GET, PUT");
    return json(res, 405, { error: "Method not allowed" });
  } catch (e) {
    if (e instanceof Bad) return json(res, 400, { error: e.message });
    /* only admins get the real reason (e.g. a missing table); the public sees a generic message */
    return json(res, 500, { error: "Request failed", detail: isAdmin(req) ? String((e && e.message) || e).slice(0, 300) : undefined });
  }
};
