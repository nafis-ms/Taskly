/**
 * Admin: real accounts from Supabase Auth -> route: /api/users   (header x-admin-key: ADMIN_PASSWORD)
 *   GET                          list accounts (with task counts and last activity)
 *   POST ?id=ID&action=ban|unban|reset|delete
 * Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ADMIN_PASSWORD
 */
const { BASE, HEADERS, configured, json, adminOk, detail } = require("./_lib");

const day = (ms) => new Date(ms).toISOString().slice(0, 10);

module.exports = async (req, res) => {
  if (!configured()) return json(res, 500, { error: "Server is not configured" });
  if (!adminOk(req)) return json(res, 401, { error: "Unauthorized" });
  try {
    if (req.method === "GET") {
      const [ur, dr] = await Promise.all([
        fetch(`${BASE}/auth/v1/admin/users?per_page=1000`, { headers: HEADERS }),
        /* only the task list and the save time, not every account's whole data blob */
        fetch(`${BASE}/rest/v1/taskly_data?select=user_id,updated_at,todos:data->todos`, { headers: HEADERS }),
      ]);
      if (!ur.ok) {
        const why = await ur.text().catch(() => "");
        return json(res, 500, { error: "Could not list users", detail: `Supabase ${ur.status}: ${why.slice(0, 200)}` });
      }
      const users = (await ur.json()).users || [];
      const rows = dr.ok ? await dr.json() : [];
      const stats = {};
      rows.forEach((r) => {
        const t = Array.isArray(r.todos) ? r.todos : [];
        stats[r.user_id] = { tasks: t.length, done: t.filter((x) => x && x.done).length, saved: r.updated_at ? Date.parse(r.updated_at) : 0 };
      });
      const now = Date.now();
      return json(res, 200, {
        items: users.map((u) => {
          const s = stats[u.id] || {};
          const signedIn = u.last_sign_in_at ? Date.parse(u.last_sign_in_at) : 0;
          const last = Math.max(signedIn, s.saved || 0); /* last real activity: logging in or saving changes */
          return {
            id: u.id,
            email: u.email,
            name: (u.user_metadata && (u.user_metadata.full_name || u.user_metadata.name)) || "",
            created: Date.parse(u.created_at),
            last,
            suspended: !!(u.banned_until && Date.parse(u.banned_until) > now),
            verified: !!(u.email_confirmed_at || u.confirmed_at),
            provider: (u.app_metadata && u.app_metadata.provider) || "email",
            tasks: s.tasks || 0,
            done: s.done || 0,
            days: last ? [day(last)] : [],
          };
        }),
      });
    }

    if (req.method === "POST") {
      const q = req.query || {};
      const id = String(q.id || "").replace(/[^0-9a-f-]/gi, "");
      const action = String(q.action || "");
      if (!id) return json(res, 400, { error: "Missing id" });

      if (action === "ban" || action === "unban") {
        const r = await fetch(`${BASE}/auth/v1/admin/users/${id}`, {
          method: "PUT", headers: HEADERS, body: JSON.stringify({ ban_duration: action === "ban" ? "876000h" : "none" }),
        });
        return r.ok ? json(res, 200, { ok: true }) : json(res, 500, { error: "Update failed" });
      }
      if (action === "delete") {
        await fetch(`${BASE}/rest/v1/taskly_data?user_id=eq.${id}`, { method: "DELETE", headers: HEADERS });
        const r = await fetch(`${BASE}/auth/v1/admin/users/${id}`, { method: "DELETE", headers: HEADERS });
        return r.ok ? json(res, 200, { ok: true }) : json(res, 500, { error: "Delete failed" });
      }
      if (action === "reset") {
        const g = await fetch(`${BASE}/auth/v1/admin/users/${id}`, { headers: HEADERS });
        const u = g.ok ? await g.json() : null;
        if (!u || !u.email) return json(res, 404, { error: "User not found" });
        const r = await fetch(`${BASE}/auth/v1/recover`, { method: "POST", headers: HEADERS, body: JSON.stringify({ email: u.email }) });
        return r.ok ? json(res, 200, { ok: true }) : json(res, 500, { error: "Could not send reset email" });
      }
      return json(res, 400, { error: "Unknown action" });
    }

    res.setHeader("Allow", "GET, POST");
    return json(res, 405, { error: "Method not allowed" });
  } catch (e) {
    return json(res, 500, { error: "Request failed", detail: detail(req, e) });
  }
};
