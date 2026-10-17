/**
 * Admin: real accounts from Supabase Auth -> route: /api/users   (header x-admin-key: ADMIN_PASSWORD)
 *   GET                          list accounts
 *   POST ?id=ID&action=ban|unban|reset|delete
 * Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ADMIN_PASSWORD (already set)
 */
const crypto = require("crypto");
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
function isAdmin(req) {
  const given = String(req.headers["x-admin-key"] || "");
  const real = process.env.ADMIN_PASSWORD || "";
  if (!real || !given) return false;
  const a = crypto.createHash("sha256").update(given).digest();
  const b = crypto.createHash("sha256").update(real).digest();
  return crypto.timingSafeEqual(a, b);
}
const H = { apikey: KEY, ...AUTH, "Content-Type": "application/json" };

module.exports = async (req, res) => {
  if (!BASE || !KEY) return json(res, 500, { error: "Server is not configured" });
  if (!isAdmin(req)) return json(res, 401, { error: "Unauthorized" });
  try {
    if (req.method === "GET") {
      const [ur, dr] = await Promise.all([
        fetch(`${BASE}/auth/v1/admin/users?per_page=1000`, { headers: H }),
        fetch(`${BASE}/rest/v1/taskly_data?select=user_id,data`, { headers: H }),
      ]);
      if (!ur.ok) {
        const why = await ur.text().catch(() => "");
        return json(res, 500, { error: "Could not list users", detail: `Supabase ${ur.status}: ${why.slice(0, 200)}` });
      }
      const users = (await ur.json()).users || [];
      const rows = dr.ok ? await dr.json() : [];
      const stats = {};
      rows.forEach((r) => {
        const t = (r.data && r.data.todos) || [];
        stats[r.user_id] = { tasks: t.length, done: t.filter((x) => x && x.done).length };
      });
      const now = Date.now();
      return json(res, 200, {
        items: users.map((u) => ({
          id: u.id,
          email: u.email,
          name: (u.user_metadata && (u.user_metadata.full_name || u.user_metadata.name)) || "",
          created: new Date(u.created_at).getTime(),
          last: u.last_sign_in_at ? new Date(u.last_sign_in_at).getTime() : 0,
          suspended: !!(u.banned_until && new Date(u.banned_until).getTime() > now),
          verified: !!(u.email_confirmed_at || u.confirmed_at),
          provider: (u.app_metadata && u.app_metadata.provider) || "email",
          tasks: (stats[u.id] || {}).tasks || 0,
          done: (stats[u.id] || {}).done || 0,
          days: [],
        })),
      });
    }
    if (req.method === "POST") {
      const id = String((req.query && req.query.id) || "").replace(/[^0-9a-f-]/gi, "");
      const action = String((req.query && req.query.action) || "");
      if (!id) return json(res, 400, { error: "Missing id" });
      if (action === "ban" || action === "unban") {
        const r = await fetch(`${BASE}/auth/v1/admin/users/${id}`, {
          method: "PUT", headers: H, body: JSON.stringify({ ban_duration: action === "ban" ? "876000h" : "none" }),
        });
        return r.ok ? json(res, 200, { ok: true }) : json(res, 500, { error: "Update failed" });
      }
      if (action === "delete") {
        await fetch(`${BASE}/rest/v1/taskly_data?user_id=eq.${id}`, { method: "DELETE", headers: H });
        const r = await fetch(`${BASE}/auth/v1/admin/users/${id}`, { method: "DELETE", headers: H });
        return r.ok ? json(res, 200, { ok: true }) : json(res, 500, { error: "Delete failed" });
      }
      if (action === "reset") {
        const g = await fetch(`${BASE}/auth/v1/admin/users/${id}`, { headers: H });
        const u = g.ok ? await g.json() : null;
        if (!u || !u.email) return json(res, 404, { error: "User not found" });
        const r = await fetch(`${BASE}/auth/v1/recover`, { method: "POST", headers: H, body: JSON.stringify({ email: u.email }) });
        return r.ok ? json(res, 200, { ok: true }) : json(res, 500, { error: "Could not send reset email" });
      }
      return json(res, 400, { error: "Unknown action" });
    }
    res.setHeader("Allow", "GET, POST");
    return json(res, 405, { error: "Method not allowed" });
  } catch (e) {
    return json(res, 500, { error: "Request failed" });
  }
};
