/**
 * Per-user app data (tasks, reminders, schedule...) -> route: /api/data
 *   GET  -> { data, ts } for the logged-in user (data is null if nothing saved yet)
 *   PUT  -> body { data, ts } saves it
 * The browser sends its Supabase session token: Authorization: Bearer <access_token>
 * Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (already set)
 */
const BASE = (process.env.SUPABASE_URL || "").replace(/\/$/, "");
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
/* legacy service_role keys are JWTs (eyJ...) and go in Authorization too; new sb_secret_ keys must only be sent as apikey */
const AUTH = /^eyJ/.test(KEY) ? { Authorization: `Bearer ${KEY}` } : {};
const json = (res, code, body) => {
  res.statusCode = code;
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(body));
};
async function userOf(req) {
  const t = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (!t) return null;
  const r = await fetch(`${BASE}/auth/v1/user`, { headers: { apikey: KEY, Authorization: `Bearer ${t}` } });
  if (!r.ok) return null;
  const u = await r.json();
  return u && u.id && (u.email_confirmed_at || u.confirmed_at) ? u : null; /* verified emails only */
}
module.exports = async (req, res) => {
  if (!BASE || !KEY) return json(res, 500, { error: "Server is not configured" });
  try {
    const u = await userOf(req);
    if (!u) return json(res, 401, { error: "Not logged in" });
    const h = { apikey: KEY, ...AUTH, "Content-Type": "application/json" };
    if (req.method === "GET") {
      const r = await fetch(`${BASE}/rest/v1/taskly_data?user_id=eq.${u.id}&select=data,ts`, { headers: h });
      const rows = r.ok ? await r.json() : [];
      return json(res, 200, rows[0] ? { data: rows[0].data, ts: Number(rows[0].ts) } : { data: null, ts: 0 });
    }
    if (req.method === "PUT") {
      let b = req.body;
      if (typeof b === "string") { try { b = JSON.parse(b); } catch (e) { b = {}; } }
      if (!b || typeof b.data !== "object" || JSON.stringify(b.data).length > 900000) return json(res, 400, { error: "Bad data" });
      const r = await fetch(`${BASE}/rest/v1/taskly_data?on_conflict=user_id`, {
        method: "POST",
        headers: { ...h, Prefer: "resolution=merge-duplicates" },
        body: JSON.stringify({ user_id: u.id, data: b.data, ts: Number(b.ts) || Date.now(), updated_at: new Date().toISOString() }),
      });
      if (!r.ok) return json(res, 500, { error: "Save failed" });
      return json(res, 200, { ok: true });
    }
    res.setHeader("Allow", "GET, PUT");
    return json(res, 405, { error: "Method not allowed" });
  } catch (e) {
    return json(res, 500, { error: "Request failed" });
  }
};
