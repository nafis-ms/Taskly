/**
 * Taskly feedback API (Vercel serverless function) -> route: /api
 * Stores feedback in Supabase (table: taskly_feedback), same pattern as the portfolio inbox.
 *
 * Env vars (Vercel > Settings > Environment Variables):
 *   SUPABASE_URL                e.g. https://xxxx.supabase.co
 *   SUPABASE_SERVICE_ROLE_KEY   server-side only, never put it in front-end code
 *   ADMIN_PASSWORD              the password you use for admin.html
 *
 *   POST   /api            public   submit feedback {email,name,rating,text}  (text up to 1000 chars)
 *   GET    /api?public=1   public   approved ("kept") feedback only, for the website slider
 *   GET    /api            admin    list all feedback
 *   POST   /api            admin    add feedback straight to the slideshow (send status:"kept")
 *   PATCH  /api?id=ID&status=kept|rejected|pending   admin   move feedback (default: kept)
 *   DELETE /api?id=ID      admin    remove
 * Admin requests send the header:  x-admin-key: <ADMIN_PASSWORD>
 */
const crypto = require("crypto");

const URL_BASE = (process.env.SUPABASE_URL || "").replace(/\/$/, "");
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
/* legacy service_role keys are JWTs (eyJ...) and go in Authorization too; new sb_secret_ keys must only be sent as apikey */
const AUTH = /^eyJ/.test(KEY) ? { Authorization: `Bearer ${KEY}` } : {};
const TABLE = "taskly_feedback";

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

const clean = (s, n) => String(s || "").replace(/[\u0000-\u001f]/g, " ").trim().slice(0, n);
const toClient = (x) => ({
  id: String(x.id),
  email: x.email,
  name: x.name,
  rating: x.rating,
  text: x.text,
  ts: new Date(x.created_at).getTime(),
  status: x.status,
});

module.exports = async (req, res) => {
  if (!URL_BASE || !KEY) return json(res, 500, { error: "Server is not configured" });
  try {
    if (req.method === "POST") {
      let b = req.body;
      if (typeof b === "string") { try { b = JSON.parse(b); } catch (e) { b = {}; } }
      b = b || {};
      const text = clean(b.text, 1000);
      const rating = Math.min(5, Math.max(1, parseInt(b.rating, 10) || 5));
      if (!text) return json(res, 400, { error: "Feedback text is required" });
      const rows = await sb(TABLE, {
        method: "POST",
        body: JSON.stringify({
          email: clean(b.email, 120),
          name: clean(b.name, 60) || "Anonymous",
          rating,
          text,
          status: isAdmin(req) && b.status === "kept" ? "kept" : "pending", /* only the admin can post straight to the slideshow */
        }),
      });
      return json(res, 201, { ok: true, item: toClient(rows[0]) });
    }

    /* public: approved ("kept") feedback for the landing page slider. No emails. */
    if (req.method === "GET" && req.query && req.query.public) {
      const rows = await sb(`${TABLE}?select=name,rating,text,created_at&status=eq.kept&order=created_at.desc&limit=12`);
      return json(res, 200, {
        items: rows.map((x) => ({ name: x.name, rating: x.rating, text: x.text, ts: new Date(x.created_at).getTime() })),
      });
    }

    if (!isAdmin(req)) return json(res, 401, { error: "Unauthorized" });

    if (req.method === "GET") {
      const rows = await sb(`${TABLE}?select=*&order=created_at.asc`);
      return json(res, 200, { items: rows.map(toClient) });
    }

    const id = String((req.query && req.query.id) || "").replace(/[^0-9a-f-]/gi, "");
    if (!id) return json(res, 400, { error: "Missing id" });

    if (req.method === "PATCH") {
      const st = ["kept", "rejected", "pending"].includes(req.query.status) ? req.query.status : "kept";
      await sb(`${TABLE}?id=eq.${id}`, { method: "PATCH", body: JSON.stringify({ status: st }) });
      return json(res, 200, { ok: true });
    }
    if (req.method === "DELETE") {
      await sb(`${TABLE}?id=eq.${id}`, { method: "DELETE" });
      return json(res, 200, { ok: true });
    }
    res.setHeader("Allow", "GET, POST, PATCH, DELETE");
    return json(res, 405, { error: "Method not allowed" });
  } catch (e) {
    /* only admins get the real reason (e.g. a Supabase error); the public sees a generic message */
    return json(res, 500, { error: "Request failed", detail: isAdmin(req) ? String(e && e.message || e).slice(0, 300) : undefined });
  }
};
