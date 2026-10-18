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
 *
 *   FREE option (recommended): your own Gmail sends the e-mails through a Google Apps Script
 *   GAS_MAIL_URL       the Apps Script "web app" URL (google-apps-script/taskly-mailer.gs)
 *
 *   Other providers (optional, used only if GAS_MAIL_URL is not set):
 *   EMAIL_FROM         e.g.  Taskly <reminders@yourdomain.com>   (must be verified with the provider)
 *   BREVO_API_KEY      Brevo  -- or --  RESEND_API_KEY   Resend (needs a verified domain)
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
  if (process.env.GAS_MAIL_URL) return "";
  if (!parseFrom()) return "No e-mail sender: set GAS_MAIL_URL (free Gmail + Apps Script), or EMAIL_FROM with a provider key";
  if (!process.env.BREVO_API_KEY && !process.env.RESEND_API_KEY) return "No e-mail provider: set GAS_MAIL_URL (free), or BREVO_API_KEY / RESEND_API_KEY";
  return "";
}
async function sendMail({ to, toName, subject, html, text }) {
  /* free route: a Google Apps Script web app that sends through your own Gmail */
  if (process.env.GAS_MAIL_URL) {
    const r = await fetch(process.env.GAS_MAIL_URL, {
      method: "POST",
      redirect: "follow",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ secret: process.env.CRON_SECRET, to, subject, html, text, name: "Taskly" }),
    });
    const raw = await r.text().catch(() => "");
    let d = {};
    try { d = JSON.parse(raw); } catch (e) {}
    if (!r.ok || !d.ok) throw new Error(`Apps Script mailer: ${d.error || r.status + " " + raw.slice(0, 120).replace(/\s+/g, " ")}`);
    return;
  }
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

  /* time left, as a snapshot at the moment the e-mail is sent */
  const left = Math.max(0, dueMs - now);
  const pad = (n) => String(n).padStart(2, "0");
  const dd = Math.floor(left / 86400000), hh = Math.floor((left % 86400000) / 3600000), mm = Math.floor((left % 3600000) / 60000);
  const chip = (num, label) =>
    `<td width="33%" style="padding:0 5px"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#0d1428;border:1px solid #22305a;border-radius:14px"><tr><td class="tk-chip" align="center" style="padding:16px 4px 12px"><div class="tk-num" style="font-size:34px;line-height:1;font-weight:800;color:#ffffff;letter-spacing:-1px">${pad(num)}</div><div style="margin-top:8px;font-size:10px;letter-spacing:2.4px;color:#7f92bd;font-weight:700">${label}</div></td></tr></table></td>`;
  const FONT = "'Poppins','Segoe UI',Helvetica,Arial,sans-serif";
  const HERO = `${SITE}/img/reminder-hero.gif`;
  const pre = esc(`Your reminder: ${t.length > 60 ? t.slice(0, 57) + "..." : t} is due ${rel}.`);

  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="dark light"><meta name="supported-color-schemes" content="dark light"><title>${esc(subject)}</title>
<style>
@keyframes tkRise{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:none}}
@keyframes tkSlide{to{background-position:200% 0}}
@keyframes tkGlow{0%,100%{box-shadow:0 0 0 0 rgba(0,132,255,.55)}50%{box-shadow:0 0 0 12px rgba(0,132,255,0)}}
@keyframes tkBlink{0%,100%{opacity:1}50%{opacity:.35}}
.tk-a1{animation:tkRise .9s .2s both}.tk-a2{animation:tkRise .9s .45s both}.tk-a3{animation:tkRise .9s .7s both}.tk-a4{animation:tkRise .9s .95s both}.tk-a5{animation:tkRise .9s 1.2s both}
.tk-btn{background-repeat:repeat-x;animation:tkSlide 4s linear infinite,tkGlow 2.6s ease-in-out infinite}
.tk-dot{animation:tkBlink 1.6s ease-in-out infinite}
@media (max-width:520px){.tk-pad{padding-left:20px!important;padding-right:20px!important}.tk-h{font-size:25px!important}.tk-num{font-size:27px!important}}
@media (prefers-reduced-motion:reduce){*{animation:none!important}}
</style></head>
<body style="margin:0;padding:0;background:#04060d;font-family:${FONT}">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:#04060d">${pre}&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;</div>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" bgcolor="#04060d" style="background:#04060d"><tr><td align="center" style="padding:28px 12px">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px"><tr><td style="padding:1px;border-radius:22px;background:#1a56c7;background-image:linear-gradient(135deg,#0084ff,#7c5cff 55%,#22d3ee)">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" bgcolor="#080d1c" style="background:#080d1c;border-radius:21px;overflow:hidden">

<tr><td style="background:#0a1b44;line-height:0;font-size:0"><img src="${HERO}" width="600" alt="Taskly reminder" style="display:block;width:100%;max-width:600px;height:auto;border:0;outline:none"></td></tr>

<tr><td class="tk-pad" style="padding:34px 36px 6px">
<div class="tk-a1" style="font-size:12px;letter-spacing:3.2px;font-weight:700;color:#22d3ee"><span class="tk-dot" style="color:#22d3ee">&#9679;</span>&nbsp; REMINDER</div>
<h1 class="tk-h tk-a2" style="margin:12px 0 10px;font-size:31px;line-height:1.2;font-weight:800;color:#ffffff;letter-spacing:-.6px;word-break:break-word">${esc(t)}</h1>
<p class="tk-a3" style="margin:0;font-size:15.5px;line-height:1.65;color:#a3b3d6">Hi ${first}, here is the reminder you set in Taskly.</p>
</td></tr>

<tr><td class="tk-pad tk-a3" style="padding:26px 31px 6px">
<div style="padding:0 5px 12px;font-size:11px;letter-spacing:2.6px;font-weight:700;color:#6f82b0">TIME LEFT</div>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr>${chip(dd, "DAYS")}${chip(hh, "HOURS")}${chip(mm, "MINUTES")}</tr></table>
</td></tr>

<tr><td class="tk-pad tk-a4" style="padding:22px 36px 6px">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#0d1428;border:1px solid #22305a;border-left:4px solid #0084ff;border-radius:14px"><tr><td style="padding:18px 22px">
<div style="font-size:11px;letter-spacing:2.6px;font-weight:700;color:#6f82b0;margin-bottom:6px">DEADLINE</div>
<div style="font-size:18px;line-height:1.4;font-weight:700;color:#ffffff">${esc(dueText)}</div>
<div style="font-size:14px;font-weight:700;color:#22d3ee;margin-top:4px">${esc(rel)}</div>
<div style="font-size:13px;line-height:1.55;color:#8798bd;margin-top:10px">You asked us to remind you ${esc(leadText)} before the deadline.</div>
</td></tr></table>
</td></tr>

<tr><td align="center" class="tk-a4" style="padding:28px 36px 8px">
<a class="tk-btn" href="${SITE}/app.html" style="display:inline-block;padding:15px 38px;border-radius:999px;background:#0084ff;background-image:linear-gradient(110deg,#0084ff 0%,#7c5cff 50%,#0084ff 100%);background-size:200% 100%;color:#ffffff;text-decoration:none;font-size:15px;font-weight:700;letter-spacing:.3px">Open Taskly &nbsp;&#8594;</a>
</td></tr>

<tr><td class="tk-pad tk-a5" style="padding:26px 36px 8px">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#0e1530;background-image:linear-gradient(135deg,#0c1f4a,#1a1240);border:1px solid #2a3770;border-radius:16px"><tr><td style="padding:22px 24px">
<div style="font-size:20px;color:#ffd666;line-height:1">&#10022;</div>
<div style="margin-top:8px;font-size:16px;font-weight:700;color:#ffffff">Thank you for being part of our community</div>
<div style="margin-top:8px;font-size:14.5px;line-height:1.7;color:#b4c2e3">Thank you for becoming a member of the Taskly community. We are so glad to have you with us, and we hope this little nudge helps you finish on time.</div>
</td></tr></table>
</td></tr>

<tr><td class="tk-pad" style="padding:22px 36px 30px"><p style="margin:0;font-size:14.5px;line-height:1.6;color:#a3b3d6">With appreciation,<br><b style="color:#ffffff">The Taskly team</b></p></td></tr>

<tr><td style="padding:16px 36px;background:#060a16;border-top:1px solid #16203f;font-size:12px;line-height:1.6;color:#6f82b0">You are receiving this e-mail because you set a reminder in Taskly.</td></tr>
</table>
</td></tr></table>
</td></tr></table></body></html>`;
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
