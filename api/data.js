/**
 * Per-user app data (tasks, reminders, schedule...) -> route: /api/data
 *   GET  -> { data, ts } for the logged-in user (data is null if nothing saved yet)
 *   PUT  -> body { data, ts } saves it
 * The browser sends its Supabase session token: Authorization: Bearer <access_token>
 * Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */
const { BASE, KEY, HEADERS, configured, json, allow, body } = require("./_lib");

const MAX_CHARS = 900000; /* keeps one account's data well under the database row and request limits */
const TABLE = "taskly_data";

/* what Supabase said about a failed call (code + message only), also logged for Vercel > Logs */
async function why(r, where) {
  let d = {};
  try { d = await r.json(); } catch (e) {}
  const out = { where, status: r.status, code: d.code || "", message: d.message || d.error || "", hint: d.hint || "" };
  console.error("taskly/api/data", JSON.stringify(out));
  return out;
}

/* the logged-in user for this request: verified e-mail only, and not suspended */
async function userOf(req) {
  const t = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (!t) return null;
  const r = await fetch(`${BASE}/auth/v1/user`, { headers: { apikey: KEY, Authorization: `Bearer ${t}` } });
  if (!r.ok) return null;
  const u = await r.json();
  if (!u || !u.id || !(u.email_confirmed_at || u.confirmed_at)) return null;
  if (u.banned_until && Date.parse(u.banned_until) > Date.now()) return null;
  return u;
}

module.exports = async (req, res) => {
  if (!configured()) return json(res, 500, { error: "Server is not configured", detail: { missing: [!BASE && "SUPABASE_URL", !KEY && "SUPABASE_SERVICE_ROLE_KEY"].filter(Boolean) } });
  if (!allow(req, "data", 120, 60000)) return json(res, 429, { error: "Too many requests" });
  try {
    const u = await userOf(req);
    if (!u) return json(res, 401, { error: "Not logged in" });

    if (req.method === "GET") {
      const r = await fetch(`${BASE}/rest/v1/${TABLE}?user_id=eq.${u.id}&select=data,ts`, { headers: HEADERS });
      /* a failed read must not look like "no data saved yet" */
      if (!r.ok) return json(res, 500, { error: "Load failed", detail: await why(r, "GET " + TABLE) });
      const rows = await r.json();
      return json(res, 200, rows[0] ? { data: rows[0].data, ts: Number(rows[0].ts) } : { data: null, ts: 0 });
    }

    if (req.method === "PUT") {
      const b = body(req);
      if (!b.data || typeof b.data !== "object" || Array.isArray(b.data) || JSON.stringify(b.data).length > MAX_CHARS) {
        return json(res, 400, { error: "Bad data" });
      }
      const r = await fetch(`${BASE}/rest/v1/${TABLE}?on_conflict=user_id`, {
        method: "POST",
        headers: { ...HEADERS, Prefer: "resolution=merge-duplicates,return=minimal" },
        body: JSON.stringify({ user_id: u.id, data: b.data, ts: Number(b.ts) || Date.now(), updated_at: new Date().toISOString() }),
      });
      if (!r.ok) return json(res, 500, { error: "Save failed", detail: await why(r, "PUT " + TABLE) });
      return json(res, 200, { ok: true });
    }

    res.setHeader("Allow", "GET, PUT");
    return json(res, 405, { error: "Method not allowed" });
  } catch (e) {
    console.error("taskly/api/data", e && e.message);
    return json(res, 500, { error: "Request failed", detail: { message: String((e && e.message) || e) } });
  }
};
