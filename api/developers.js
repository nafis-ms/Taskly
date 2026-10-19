/**
 * Taskly developers API (Vercel serverless function) -> route: /api/developers
 * Lets the admin manage up to 3 developer cards shown in the landing page "Meet the developers" section.
 * Stored in Supabase table taskly_settings (same table as /api/contact, see sql/setup.sql).
 *
 *   GET  /api/developers   public   -> { developers: [ {name, role, bio, photo, github, linkedin, website} ] }  (max 3)
 *   PUT  /api/developers   admin    body { developers: [...] }   header x-admin-key: <ADMIN_PASSWORD>
 *                                   (cards without a name are dropped; links must start with http:// or https://)
 */
const { configured, json, adminOk, sb, body, one, multi, detail } = require("./_lib");

const TABLE = "taskly_settings";
const ROW = "developers";
const MAX = 3;

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
  const out = [];
  (Array.isArray(input) ? input : []).forEach((d, i) => {
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

const listOf = (v) => (v && Array.isArray(v.list) ? v.list.slice(0, MAX) : []);

module.exports = async (req, res) => {
  if (!configured()) return json(res, 500, { error: "Server is not configured" });
  try {
    if (req.method === "GET") {
      const rows = await sb(`${TABLE}?select=value&key=eq.${ROW}&limit=1`);
      return json(res, 200, { developers: listOf(rows[0] && rows[0].value) });
    }

    if (req.method === "PUT" || req.method === "POST") {
      if (!adminOk(req)) return json(res, 401, { error: "Unauthorized" });
      const list = cleanList(body(req).developers);
      const rows = await sb(`${TABLE}?on_conflict=key`, {
        method: "POST",
        headers: { Prefer: "resolution=merge-duplicates,return=representation" },
        body: JSON.stringify({ key: ROW, value: { list }, updated_at: new Date().toISOString() }),
      });
      return json(res, 200, { ok: true, developers: rows[0] ? listOf(rows[0].value) : list });
    }

    res.setHeader("Allow", "GET, PUT");
    return json(res, 405, { error: "Method not allowed" });
  } catch (e) {
    if (e instanceof Bad) return json(res, 400, { error: e.message });
    return json(res, 500, { error: "Request failed", detail: detail(req, e) });
  }
};
