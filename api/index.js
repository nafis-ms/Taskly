/**
 * Taskly feedback API (Vercel serverless function) -> route: /api
 * Stores feedback in Supabase (table: taskly_feedback).
 *
 *   POST   /api            public   submit feedback {email,name,rating,text}  (text up to 1000 chars)
 *   GET    /api?public=1   public   approved ("kept") feedback only, for the website slider
 *   GET    /api            admin    list all feedback
 *   POST   /api            admin    add feedback straight to the slideshow (send status:"kept")
 *   PATCH  /api?id=ID&status=kept|rejected|pending   admin   move feedback (default: kept)
 *   DELETE /api?id=ID      admin    remove
 * Admin requests send the header:  x-admin-key: <ADMIN_PASSWORD>
 */
const { configured, json, allow, isAdmin, adminOk, sb, body, one, multi, detail } = require("./_lib");

const TABLE = "taskly_feedback";
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
  if (!configured()) return json(res, 500, { error: "Server is not configured" });
  try {
    const q = req.query || {};

    if (req.method === "POST") {
      const admin = isAdmin(req);
      if (!admin && !allow(req, "feedback", 5, 10 * 60000)) return json(res, 429, { error: "Too many submissions. Please try again later." });
      const b = body(req);
      const text = multi(b.text, 1000);
      const rating = Math.min(5, Math.max(1, parseInt(b.rating, 10) || 5));
      if (!text) return json(res, 400, { error: "Feedback text is required" });
      const rows = await sb(TABLE, {
        method: "POST",
        body: JSON.stringify({
          email: one(b.email, 120),
          name: one(b.name, 60) || "Anonymous",
          rating,
          text,
          status: admin && b.status === "kept" ? "kept" : "pending", /* only the admin can post straight to the slideshow */
        }),
      });
      return json(res, 201, { ok: true, item: toClient(rows[0]) });
    }

    /* public: approved ("kept") feedback for the landing page slider. No emails. */
    if (req.method === "GET" && q.public) {
      const rows = await sb(`${TABLE}?select=name,rating,text,created_at&status=eq.kept&order=created_at.desc&limit=12`);
      return json(res, 200, { items: rows.map((x) => ({ name: x.name, rating: x.rating, text: x.text, ts: new Date(x.created_at).getTime() })) });
    }

    if (!adminOk(req)) return json(res, 401, { error: "Unauthorized" });

    if (req.method === "GET") {
      const rows = await sb(`${TABLE}?select=*&order=created_at.asc`);
      return json(res, 200, { items: rows.map(toClient) });
    }

    const id = String(q.id || "").replace(/[^0-9a-f-]/gi, "");
    if (!id) return json(res, 400, { error: "Missing id" });

    if (req.method === "PATCH") {
      const st = ["kept", "rejected", "pending"].includes(q.status) ? q.status : "kept";
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
    return json(res, 500, { error: "Request failed", detail: detail(req, e) });
  }
};
