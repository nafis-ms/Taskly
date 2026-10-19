/**
 * Taskly contact-info API (Vercel serverless function) -> route: /api/contact
 * Lets the admin edit what the landing page's "Contact us" section shows.
 * Stored in Supabase table taskly_settings (run sql/setup.sql once).
 *
 *   GET  /api/contact   public   -> { info: { lede, email, phone, address, hours } }  ({} until first save)
 *   PUT  /api/contact   admin    save the fields above (header x-admin-key: <ADMIN_PASSWORD>)
 */
const { configured, json, adminOk, sb, body, one, multi, detail } = require("./_lib");

const TABLE = "taskly_settings";
const ROW = "contact";

module.exports = async (req, res) => {
  if (!configured()) return json(res, 500, { error: "Server is not configured" });
  try {
    if (req.method === "GET") {
      const rows = await sb(`${TABLE}?select=value&key=eq.${ROW}&limit=1`);
      return json(res, 200, { info: (rows[0] && rows[0].value) || {} });
    }

    if (req.method === "PUT" || req.method === "POST") {
      if (!adminOk(req)) return json(res, 401, { error: "Unauthorized" });
      const b = body(req);
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
    return json(res, 500, { error: "Request failed", detail: detail(req, e) });
  }
};
