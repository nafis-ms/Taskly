/**
 * Taskly reminder e-mails (Vercel serverless function) -> route: /api/cron-reminders
 *
 * Called every minute by a scheduler (see the setup notes). For every reminder whose "remind me before" time has
 * arrived it sends ONE e-mail to the member who set it: the reminder details + a thank-you for being part of the
 * Taskly community. The Schedule tab is not touched (it keeps its simple in-app notification).
 *
 * Env vars (Vercel > Settings > Environment Variables):
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY   already set
 *   CRON_SECRET        any long random text. The scheduler sends it as   Authorization: Bearer <CRON_SECRET>
 *   EMAIL_FROM         e.g.  Taskly <reminders@yourdomain.com>   (the address must be verified with your e-mail provider)
 *   BREVO_API_KEY      use Brevo   (free plan, you can verify a single sender address)      -- or --
 *   RESEND_API_KEY     use Resend  (needs a verified domain to e-mail other people)
 *   SITE_URL           optional, link in the e-mail button (default https://taskly-36.vercel.app)
 *   EMAIL_TIMEZONE     optional, used for reminders saved before time zones were stored (default Asia/Dhaka)
 *
 * Table: taskly_reminder_emails (run sql/taskly_reminder_emails.sql once).
 *
 *   GET /api/cron-reminders                    run now
 *   GET /api/cron-reminders?test=you@mail.com  send a sample e-mail to that address (to check the e-mail setup)
 */
const crypto = require("crypto");

const BASE = (process.env.SUPABASE_URL || "").replace(/\/$/, "");
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
/* legacy service_role keys are JWTs (eyJ...) and go in Authorization too; new sb_secret_ keys must only be sent as apikey */
const AUTH = /^eyJ/.test(KEY) ? { Authorization: `Bearer ${KEY}` } : {};
const SENT = "taskly_reminder_emails";
const SITE = (process.env.SITE_URL || "https://taskly-36.vercel.app").replace(/\/$/, "");
const DEFAULT_TZ = process.env.EMAIL_TIMEZONE || "Asia/Dhaka";

const UNIT = { minutes: 60000, hours: 3600000, days: 86400000 };
const GRACE = 10 * 60000; /* still e-mail up to 10 minutes after the deadline if the scheduler was late */
const MAX_PER_RUN = 40; /* keeps one run well inside the function time limit; the rest goes out on the next tick */

const json = (res, code, body) => {
  res.statusCode = code;
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(body));
};

function authorised(req) {
  const real = process.env.CRON_SECRET || "";
  const given = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "") || String((req.query && req.query.secret) || "");
  if (!real || !given) return false;
  const a = crypto.createHash("sha256").update(given).digest();
  const b = crypto.createHash("sha256").update(real).digest();
  return crypto.timingSafeEqual(a, b);
}

async function sb(path, opts = {}) {
  const r = await fetch(`${BASE}/rest/v1/${path}`, {
    ...opts,
    headers: { apikey: KEY, ...AUTH, "Content-Type": "application/json", ...(opts.headers || {}) },
  });
  const text = await r.text();
  if (!r.ok) throw new Error(text || `Supabase ${r.status}`);
  return text ? JSON.parse(text) : [];
}

/* ---------- e-mail providers ---------- */
function parseFrom() {
  const raw = String(process.env.EMAIL_FROM || "").trim();
  const m = raw.match(/^(.*?)\s*<([^<>\s]+@[^<>\s]+)>$/);
  if (m) return { name: m[1].replace(/^"|"$/g, "") || "Taskly", email: m[2] };
  if (/^[^\s@<>]+@[^\s@<>]+$/.test(raw)) return { name: "Taskly", email: raw };
  return null;
}
function providerReady() {
  if (!parseFrom()) return "EMAIL_FROM is missing or not like  Taskly <reminders@yourdomain.com>";
  if (!process.env.BREVO_API_KEY && !process.env.RESEND_API_KEY) return "No e-mail provider: set BREVO_API_KEY or RESEND_API_KEY";
  return "";
}
async function sendMail({ to, toName, subject, html, text }) {
  const from = parseFrom();
  let r;
  if (process.env.BREVO_API_KEY) {
    r = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: { "api-key": process.env.BREVO_API_KEY, "Content-Type": "application/json", accept: "application/json" },
      body: JSON.stringify({ sender: from, to: [{ email: to, name: toName || undefined }], subject, htmlContent: html, textContent: text }),
    });
  } else {
    r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: `${from.name} <${from.email}>`, to: [to], subject, html, text }),
    });
  }
  if (!r.ok) throw new Error(`E-mail provider ${r.status}: ${(await r.text().catch(() => "")).slice(0, 200)}`);
}

/* ---------- the e-mail itself ---------- */
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const plural = (n, w) => `${n} ${w}${n === 1 ? "" : "s"}`;

function when(ms, tz) {
  const opt = { weekday: "short", day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", hour12: true, timeZoneName: "short" };
  for (const z of [tz, DEFAULT_TZ, "UTC"]) {
    try { return new Intl.DateTimeFormat("en-GB", { ...opt, timeZone: z }).format(new Date(ms)); } catch (e) {}
  }
  return new Date(ms).toISOString();
}
function relative(dueMs, now) {
  const d = dueMs - now;
  if (d <= 60000) return "right now";
  const min = Math.round(d / 60000);
  if (min < 60) return "in " + plural(min, "minute");
  const hrs = Math.round(d / 3600000);
  if (hrs < 48) return "in " + plural(hrs, "hour");
  return "in " + plural(Math.round(d / 86400000), "day");
}

function buildEmail({ name, title, dueMs, lead, unit, tz, now }) {
  const first = esc(String(name || "there").trim().split(/\s+/)[0] || "there");
  const firstText = String(name || "there").trim().split(/\s+/)[0] || "there";
  const t = String(title).replace(/\s+/g, " ").trim().slice(0, 200);
  const rel = relative(dueMs, now);
  const dueText = when(dueMs, tz);
  const leadText = plural(lead, String(unit).replace(/s$/, ""));
  const subject = `Reminder: ${t.length > 70 ? t.slice(0, 67) + "..." : t} is due ${rel}`;

  const text =
`Hi ${firstText},

This is the reminder you set in Taskly.

Task: ${t}
Deadline: ${dueText} (${rel})
You asked us to remind you ${leadText} before the deadline.

Thank you for becoming a member of the Taskly community. We are so glad to have you with us, and we hope this little nudge helps you finish on time.

Open Taskly: ${SITE}/app.html

With appreciation,
The Taskly team

You are receiving this e-mail because you set a reminder in Taskly.`;

  const html = `<!doctype html><html><body style="margin:0;padding:0;background:#f3f6fb;font-family:Arial,Helvetica,sans-serif;color:#0b1220">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f3f6fb;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:520px;background:#ffffff;border-radius:18px;overflow:hidden;border:1px solid #e3e9f2">
<tr><td style="background:#0084ff;padding:22px 28px;color:#ffffff;font-size:22px;font-weight:700;letter-spacing:-.3px">Taskly <span style="font-weight:400;font-size:14px;opacity:.9">&nbsp;Reminder</span></td></tr>
<tr><td style="padding:28px 28px 8px">
<p style="margin:0 0 14px;font-size:17px;font-weight:700">Hi ${first},</p>
<p style="margin:0 0 18px;font-size:15px;line-height:1.55;color:#33405a">This is the reminder you set in Taskly.</p>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f3f8ff;border:1px solid #d6e8ff;border-radius:14px"><tr><td style="padding:18px 20px">
<div style="font-size:12px;letter-spacing:.6px;text-transform:uppercase;color:#5b6b86;margin-bottom:4px">Task</div>
<div style="font-size:19px;font-weight:700;line-height:1.35;margin-bottom:14px;word-break:break-word">${esc(t)}</div>
<div style="font-size:12px;letter-spacing:.6px;text-transform:uppercase;color:#5b6b86;margin-bottom:4px">Deadline</div>
<div style="font-size:15px;font-weight:600">${esc(dueText)}</div>
<div style="font-size:14px;color:#0084ff;font-weight:700;margin-top:2px">${esc(rel)}</div>
</td></tr></table>
<p style="margin:16px 0 0;font-size:13.5px;line-height:1.5;color:#5b6b86">You asked us to remind you ${esc(leadText)} before the deadline.</p>
</td></tr>
<tr><td style="padding:18px 28px 6px">
<p style="margin:0;font-size:15px;line-height:1.6;color:#33405a">Thank you for becoming a member of the Taskly community. We are so glad to have you with us, and we hope this little nudge helps you finish on time.</p>
</td></tr>
<tr><td align="center" style="padding:20px 28px 10px"><a href="${SITE}/app.html" style="display:inline-block;background:#0084ff;color:#ffffff;text-decoration:none;font-weight:700;font-size:15px;padding:13px 28px;border-radius:999px">Open Taskly</a></td></tr>
<tr><td style="padding:14px 28px 26px"><p style="margin:0;font-size:15px;line-height:1.5;color:#33405a">With appreciation,<br><b>The Taskly team</b></p></td></tr>
<tr><td style="padding:14px 28px;background:#f7f9fc;border-top:1px solid #e3e9f2;font-size:12px;color:#8391a8">You are receiving this e-mail because you set a reminder in Taskly.</td></tr>
</table></td></tr></table></body></html>`;
  return { subject, html, text };
}

/* ---------- data helpers ---------- */
async function allReminderRows() {
  const out = [];
  for (let off = 0; off < 5000; off += 500) {
    const rows = await sb(`taskly_data?select=user_id,reminders:data->reminders&order=user_id.asc&limit=500&offset=${off}`);
    out.push(...rows);
    if (rows.length < 500) break;
  }
  return out;
}
async function sentKeys(sinceMs) {
  const set = new Set();
  const since = encodeURIComponent(new Date(sinceMs).toISOString());
  for (let off = 0; off < 5000; off += 1000) {
    const rows = await sb(`${SENT}?select=user_id,reminder_id,due&due=gte.${since}&order=sent_at.asc&limit=1000&offset=${off}`);
    rows.forEach((x) => set.add(`${x.user_id}|${x.reminder_id}|${Date.parse(x.due)}`));
    if (rows.length < 1000) break;
  }
  return set;
}
async function getUser(id) {
  const r = await fetch(`${BASE}/auth/v1/admin/users/${encodeURIComponent(id)}`, { headers: { apikey: KEY, ...AUTH } });
  if (r.status >= 500) throw new Error("auth " + r.status);
  if (!r.ok) return null;
  return r.json();
}

module.exports = async (req, res) => {
  if (!BASE || !KEY) return json(res, 500, { error: "Server is not configured" });
  if (!authorised(req)) return json(res, 401, { error: "Unauthorized" });
  const problem = providerReady();
  if (problem) return json(res, 500, { error: problem });

  try {
    const q = req.query || {};

    /* sample e-mail, to check that the provider and sender address work */
    if (q.test) {
      const to = String(q.test).trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) return json(res, 400, { error: "test= must be an e-mail address" });
      const now = Date.now();
      const m = buildEmail({ name: "Friend", title: "Submit the project report", dueMs: now + 2 * 86400000, lead: 2, unit: "days", tz: DEFAULT_TZ, now });
      await sendMail({ to, toName: "Friend", ...m });
      return json(res, 200, { ok: true, sentTo: to });
    }

    const now = Date.now();
    const due = [];
    (await allReminderRows()).forEach((row) => {
      if (!Array.isArray(row.reminders)) return;
      row.reminders.forEach((r) => {
        if (!r || typeof r !== "object" || !r.id || !r.title || !UNIT[r.unit]) return;
        const lead = Number(r.lead), dueMs = Date.parse(r.due);
        if (!(lead >= 1) || isNaN(dueMs)) return;
        const remindMs = dueMs - lead * UNIT[r.unit];
        if (now >= remindMs && now <= dueMs + GRACE) due.push({ uid: row.user_id, r, lead, dueMs });
      });
    });

    const result = { checked: due.length, sent: 0, failed: 0, skipped: 0 };
    if (due.length) {
      const sent = await sentKeys(now - GRACE);
      let todo = due.filter((x) => !sent.has(`${x.uid}|${x.r.id}|${x.dueMs}`));
      result.skipped = due.length - todo.length;
      todo = todo.slice(0, MAX_PER_RUN);
      const users = {};

      const one = async (x) => {
        const dueIso = new Date(x.dueMs).toISOString();
        /* claim first: if two runs overlap, only one of them gets the row back and sends */
        const claim = await sb(SENT, {
          method: "POST",
          headers: { Prefer: "resolution=ignore-duplicates,return=representation" },
          body: JSON.stringify({ user_id: x.uid, reminder_id: String(x.r.id).slice(0, 100), due: dueIso }),
        });
        if (!claim.length) { result.skipped++; return; }
        const release = () => sb(`${SENT}?user_id=eq.${x.uid}&reminder_id=eq.${encodeURIComponent(String(x.r.id).slice(0, 100))}&due=eq.${encodeURIComponent(dueIso)}`, { method: "DELETE" }).catch(() => {});
        try {
          if (!(x.uid in users)) users[x.uid] = await getUser(x.uid);
          const u = users[x.uid];
          const banned = u && u.banned_until && Date.parse(u.banned_until) > now;
          if (!u || !u.email || !(u.email_confirmed_at || u.confirmed_at) || banned) { result.skipped++; return; } /* nobody to e-mail: keep the claim so we do not retry */
          const md = u.user_metadata || {};
          const name = md.name || md.full_name || String(u.email).split("@")[0];
          const m = buildEmail({ name, title: x.r.title, dueMs: x.dueMs, lead: x.lead, unit: x.r.unit, tz: typeof x.r.tz === "string" ? x.r.tz : "", now });
          await sendMail({ to: u.email, toName: name, ...m });
          result.sent++;
        } catch (e) {
          await release(); /* try again on the next run (still inside the time window) */
          result.failed++;
          result.lastError = String((e && e.message) || e).slice(0, 200);
        }
      };
      for (let i = 0; i < todo.length; i += 5) await Promise.all(todo.slice(i, i + 5).map(one));
    }

    /* tidy up old rows about once an hour */
    if (new Date().getMinutes() < 2) {
      await sb(`${SENT}?due=lt.${encodeURIComponent(new Date(now - 60 * 86400000).toISOString())}`, { method: "DELETE" }).catch(() => {});
    }
    return json(res, 200, result);
  } catch (e) {
    return json(res, 500, { error: "Run failed", detail: String((e && e.message) || e).slice(0, 300) });
  }
};
