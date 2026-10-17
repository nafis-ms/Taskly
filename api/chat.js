/**
 * Taskly live chat API (Vercel serverless function) -> route: /api/chat
 * Conversations live in Supabase (tables: taskly_chats, taskly_chat_messages) - nothing is kept in localStorage.
 * A visitor is recognised by an HttpOnly cookie ("taskly_chat") that the server sets when the chat starts,
 * so a page reload reconnects to the same conversation.
 *
 * Env vars (same as /api): SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ADMIN_PASSWORD
 *
 * Visitor (cookie based)
 *   GET   /api/chat[?after=ISO&open=1]       state + messages ({chat:null} when there is no conversation)
 *   POST  /api/chat {action:"start",name,email,text}   start a chat (or add a message to the existing one)
 *   POST  /api/chat {action:"send",text}               send a message
 *   POST  /api/chat {action:"typing"}                  "visitor is typing"
 * Admin (header x-admin-key)
 *   GET   /api/chat?admin=1                  list conversations
 *   GET   /api/chat?admin=1&id=ID[&after=ISO&open=1]   messages of one conversation
 *   POST  /api/chat {action:"reply",id,text}           reply to a visitor
 *   POST  /api/chat {action:"atyping",id}              "admin is typing"
 *   PATCH /api/chat?id=ID&status=open|closed           resolve / reopen
 *   DELETE /api/chat?id=ID                             delete the conversation
 */
const crypto = require("crypto");

const URL_BASE = (process.env.SUPABASE_URL || "").replace(/\/$/, "");
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
/* legacy service_role keys are JWTs (eyJ...) and go in Authorization too; new sb_secret_ keys must only be sent as apikey */
const AUTH = /^eyJ/.test(KEY) ? { Authorization: `Bearer ${KEY}` } : {};
const CHATS = "taskly_chats";
const MSGS = "taskly_chat_messages";
const COOKIE = "taskly_chat";
const TYPING_MS = 5000;

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

/* single-line fields */
const clean = (s, n) => String(s || "").replace(/[\u0000-\u001f]/g, " ").trim().slice(0, n);
/* message text: keep line breaks, drop other control characters, limit blank lines */
const msgText = (s, n) =>
  String(s || "")
    .replace(/\r\n?/g, "\n")
    .replace(/[\u0000-\u0009\u000b-\u001f]/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, n);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO = /^\d{4}-\d{2}-\d{2}T[\d:.]+(Z|[+-]\d{2}:\d{2})$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const tokenOf = (req) => {
  const m = String(req.headers.cookie || "").match(/(?:^|;\s*)taskly_chat=([a-f0-9]{48})(?:;|$)/);
  return m ? m[1] : "";
};
function setCookie(req, res, token) {
  const secure = String(req.headers["x-forwarded-proto"] || "").includes("https") ? "; Secure" : "";
  res.setHeader("Set-Cookie", `${COOKIE}=${token}; Path=/api/chat; Max-Age=2592000; HttpOnly; SameSite=Lax${secure}`);
}

const live = (t) => !!t && Date.now() - Date.parse(t) < TYPING_MS;
const toMsg = (x) => ({ id: String(x.id), from: x.sender, text: x.text, ts: Date.parse(x.created_at), at: x.created_at });

async function chatByToken(token) {
  if (!token) return null;
  const r = await sb(`${CHATS}?token=eq.${token}&select=*&limit=1`);
  return r[0] || null;
}
async function chatById(id) {
  if (!UUID.test(id)) return null;
  const r = await sb(`${CHATS}?id=eq.${id}&select=*&limit=1`);
  return r[0] || null;
}
async function messages(chatId, after) {
  let q = `${MSGS}?chat_id=eq.${chatId}&select=id,sender,text,created_at`;
  if (after && ISO.test(after)) {
    q += `&created_at=gte.${encodeURIComponent(after)}&order=created_at.asc&limit=300`;
    return (await sb(q)).map(toMsg);
  }
  /* first load: the latest 200 messages, oldest first */
  q += "&order=created_at.desc&limit=200";
  return (await sb(q)).map(toMsg).reverse();
}
const patchChat = (id, body) => sb(`${CHATS}?id=eq.${id}`, { method: "PATCH", body: JSON.stringify(body) });
const addMsg = async (chatId, sender, text) =>
  toMsg((await sb(MSGS, { method: "POST", body: JSON.stringify({ chat_id: chatId, sender, text }) }))[0]);

/* what the visitor may see about the conversation */
const visitorView = (c) => ({
  name: c.name,
  status: c.status,
  typing: live(c.admin_typing_at),
  unread: c.visitor_unread, /* admin messages the visitor has not opened yet */
  unseen: c.admin_unread, /* visitor messages the admin has not opened yet (the last N) */
});

async function visitor(req, res, q, b) {
  const token = tokenOf(req);

  if (req.method === "GET") {
    const chat = await chatByToken(token);
    if (!chat) return json(res, 200, { chat: null });
    const list = await messages(chat.id, q.after);
    if (q.open && chat.visitor_unread > 0) {
      await patchChat(chat.id, { visitor_unread: 0 });
      chat.visitor_unread = 0;
    }
    return json(res, 200, { chat: visitorView(chat), messages: list });
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return json(res, 405, { error: "Method not allowed" });
  }

  if (b.action === "typing") {
    const chat = await chatByToken(token);
    if (chat) await patchChat(chat.id, { visitor_typing_at: new Date().toISOString() });
    return json(res, 200, { ok: true });
  }

  if (b.action !== "start" && b.action !== "send") return json(res, 400, { error: "Unknown action" });

  /* honeypot: bots fill the hidden field, people never see it */
  if (b.website) return json(res, 200, { ok: true });

  const text = msgText(b.text, 1000);
  if (!text) return json(res, 400, { error: "Write a message first." });

  let chat = await chatByToken(token);
  if (!chat) {
    const name = clean(b.name, 60);
    const email = clean(b.email, 120).toLowerCase();
    if (name.length < 2 || !EMAIL.test(email)) return json(res, 400, { error: "This conversation has ended.", code: "nochat" });
    const fresh = crypto.randomBytes(24).toString("hex");
    chat = (await sb(CHATS, { method: "POST", body: JSON.stringify({ token: fresh, name, email }) }))[0];
    setCookie(req, res, fresh);
  } else {
    /* simple flood guard: max 15 messages a minute per conversation */
    const since = encodeURIComponent(new Date(Date.now() - 60000).toISOString());
    const recent = await sb(`${MSGS}?chat_id=eq.${chat.id}&sender=eq.visitor&created_at=gte.${since}&select=id`);
    if (recent.length >= 15) return json(res, 429, { error: "You're sending messages very fast. Please wait a moment." });
  }

  const message = await addMsg(chat.id, "visitor", text);
  const upd = {
    last_at: new Date().toISOString(),
    last_text: text.slice(0, 120),
    last_from: "visitor",
    admin_unread: (chat.admin_unread || 0) + 1,
    status: "open",
    visitor_typing_at: null,
  };
  await patchChat(chat.id, upd);
  Object.assign(chat, upd);
  return json(res, 201, { ok: true, chat: visitorView(chat), message });
}

async function admin(req, res, q, b) {
  if (req.method === "GET") {
    if (!q.id) {
      const rows = await sb(
        `${CHATS}?select=id,name,email,status,created_at,last_at,last_text,last_from,admin_unread,visitor_typing_at&order=last_at.desc&limit=100`
      );
      return json(res, 200, {
        chats: rows.map((c) => ({
          id: c.id,
          name: c.name,
          email: c.email,
          status: c.status,
          last: c.last_text,
          lastFrom: c.last_from,
          lastAt: Date.parse(c.last_at),
          createdAt: Date.parse(c.created_at),
          unread: c.admin_unread,
          typing: live(c.visitor_typing_at),
        })),
      });
    }
    const chat = await chatById(String(q.id));
    if (!chat) return json(res, 404, { error: "Conversation not found" });
    const list = await messages(chat.id, q.after);
    if (q.open && chat.admin_unread > 0) {
      await patchChat(chat.id, { admin_unread: 0 });
      chat.admin_unread = 0;
    }
    return json(res, 200, {
      chat: {
        id: chat.id,
        name: chat.name,
        email: chat.email,
        status: chat.status,
        typing: live(chat.visitor_typing_at),
        unseen: chat.visitor_unread, /* admin messages the visitor has not opened yet (the last N) */
      },
      messages: list,
    });
  }

  if (req.method === "POST") {
    const chat = await chatById(String((b && b.id) || ""));
    if (!chat) return json(res, 404, { error: "Conversation not found" });
    if (b.action === "atyping") {
      await patchChat(chat.id, { admin_typing_at: new Date().toISOString() });
      return json(res, 200, { ok: true });
    }
    const text = msgText(b.text, 1000);
    if (!text) return json(res, 400, { error: "Write a reply first." });
    const message = await addMsg(chat.id, "admin", text);
    await patchChat(chat.id, {
      last_at: new Date().toISOString(),
      last_text: text.slice(0, 120),
      last_from: "admin",
      visitor_unread: (chat.visitor_unread || 0) + 1,
      admin_typing_at: null,
      status: "open",
    });
    return json(res, 201, { ok: true, message });
  }

  const id = String(q.id || "");
  if (!UUID.test(id)) return json(res, 400, { error: "Missing id" });

  if (req.method === "PATCH") {
    const status = q.status === "closed" ? "closed" : "open";
    await patchChat(id, { status });
    return json(res, 200, { ok: true, status });
  }
  if (req.method === "DELETE") {
    await sb(`${CHATS}?id=eq.${id}`, { method: "DELETE" });
    return json(res, 200, { ok: true });
  }
  res.setHeader("Allow", "GET, POST, PATCH, DELETE");
  return json(res, 405, { error: "Method not allowed" });
}

module.exports = async (req, res) => {
  if (!URL_BASE || !KEY) return json(res, 500, { error: "Server is not configured" });
  try {
    const q = req.query || {};
    let b = {};
    if (req.method === "POST") {
      b = req.body;
      if (typeof b === "string") {
        try { b = JSON.parse(b); } catch (e) { b = {}; }
      }
      b = b || {};
    }
    const adminCall =
      q.admin || req.method === "PATCH" || req.method === "DELETE" || (req.method === "POST" && (b.action === "reply" || b.action === "atyping"));
    if (adminCall) {
      if (!isAdmin(req)) return json(res, 401, { error: "Unauthorized" });
      return await admin(req, res, q, b);
    }
    return await visitor(req, res, q, b);
  } catch (e) {
    /* only the admin gets the real reason (e.g. a missing table); visitors see a generic message */
    return json(res, 500, { error: "Request failed", detail: isAdmin(req) ? String((e && e.message) || e).slice(0, 300) : undefined });
  }
};
