/* Taskly live chat (visitor side).
   Messages live on the server (/api/chat -> Supabase). The browser keeps nothing in localStorage:
   the server sets an HttpOnly cookie when a chat starts, so a reload reconnects to the same conversation.
   Contact form -> TasklyChat.start({name, email, text}) -> chat window pops up -> admin replies arrive live. */
(function () {
  "use strict";
  var API = "/api/chat";
  var reduce = window.matchMedia && matchMedia("(prefers-reduced-motion:reduce)").matches;
  var ICON = {
    chat: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 12a8 8 0 0 1-11.6 7.1L4 20l1-4A8 8 0 1 1 20 12z"/></svg>',
    bolt: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M13.5 2 5 13.5h6L10 22l9-12h-6.3z"/></svg>',
    down: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>',
    send: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 3 10 14M21 3l-7 18-4-7-7-4z"/></svg>',
    tick: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12.5l5 5L20 6.5"/></svg>'
  };

  var st = {
    chat: null,      /* server view of the conversation, null = none */
    ids: {},         /* message ids already on screen */
    last: "",        /* created_at of the newest message we have (for ?after=) */
    open: false,
    unread: 0,
    unseen: 0,       /* how many of our latest messages the admin has not opened yet */
    typing: false,
    pendingName: "",
    fails: 0,
    sending: 0,
    timer: 0,
    ui: null,
    lastTypingPing: 0,
    welcomed: false
  };
  var ac = null;     /* WebAudio context for the soft notification chime */

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function hhmm(ts) {
    try { return new Date(ts).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }); } catch (e) { return ""; }
  }
  function first(name) { return String(name || "").trim().split(/\s+/)[0] || "there"; }

  /* ---------- network ---------- */
  function http(method, qs, body) {
    var opt = { method: method, credentials: "same-origin", cache: "no-store" };
    if (body) { opt.headers = { "Content-Type": "application/json" }; opt.body = JSON.stringify(body); }
    return fetch(API + (qs || ""), opt).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (d) {
        if (!r.ok) { var e = new Error(d.error || "HTTP " + r.status); e.status = r.status; e.code = d.code; throw e; }
        return d;
      });
    });
  }

  /* ---------- sound (a short two-note chime, only after the visitor has interacted) ---------- */
  function unlock() {
    try {
      ac = ac || new (window.AudioContext || window.webkitAudioContext)();
      if (ac.state === "suspended") ac.resume();
    } catch (e) {}
  }
  function chime() {
    if (!ac || ac.state !== "running") return;
    try {
      var t = ac.currentTime;
      [[660, 0], [880, 0.12]].forEach(function (n) {
        var o = ac.createOscillator(), g = ac.createGain(), at = t + n[1];
        o.type = "sine"; o.frequency.value = n[0];
        g.gain.setValueAtTime(0.0001, at);
        g.gain.linearRampToValueAtTime(0.05, at + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, at + 0.4);
        o.connect(g); g.connect(ac.destination);
        o.start(at); o.stop(at + 0.45);
      });
    } catch (e) {}
  }

  /* ---------- UI ---------- */
  function build() {
    if (st.ui) return st.ui;
    var fab = el("button", "tc-fab");
    fab.type = "button";
    fab.setAttribute("aria-label", "Open chat with Taskly support");
    fab.innerHTML = ICON.chat + '<i class="tc-badge" hidden></i>';

    var win = el("section", "tc-win");
    win.hidden = true;
    win.setAttribute("role", "dialog");
    win.setAttribute("aria-label", "Chat with Taskly support");
    win.innerHTML =
      '<header class="tc-head"><div class="tc-aurora" aria-hidden="true"><i></i><i></i></div>' +
      '<div class="tc-ava">' + ICON.bolt + '<span class="tc-ring"></span></div>' +
      '<div class="tc-who"><b>Taskly Support</b><small class="tc-sub">Live chat · we reply right here</small></div>' +
      '<button type="button" class="tc-min" aria-label="Minimize chat">' + ICON.down + '</button></header>' +
      '<div class="tc-body" role="log" aria-live="polite"><div class="tc-sys" hidden></div><div class="tc-typing" hidden aria-label="Support is typing"><i></i><i></i><i></i></div></div>' +
      '<form class="tc-foot" autocomplete="off"><textarea rows="1" maxlength="1000" placeholder="Write a message…" aria-label="Message"></textarea>' +
      '<button class="tc-send" type="submit" aria-label="Send message" disabled>' + ICON.send + '</button></form>';

    document.body.appendChild(win);
    document.body.appendChild(fab);

    var ui = {
      fab: fab, win: win,
      badge: fab.querySelector(".tc-badge"),
      body: win.querySelector(".tc-body"),
      sys: win.querySelector(".tc-sys"),
      typing: win.querySelector(".tc-typing"),
      sub: win.querySelector(".tc-sub"),
      form: win.querySelector(".tc-foot"),
      ta: win.querySelector("textarea"),
      send: win.querySelector(".tc-send"),
      resume: null
    };
    st.ui = ui;

    fab.onclick = function () { unlock(); open(); };
    win.querySelector(".tc-min").onclick = close;
    win.addEventListener("keydown", function (e) { if (e.key === "Escape") close(); });
    ui.ta.addEventListener("input", function () {
      ui.ta.style.height = "auto";
      ui.ta.style.height = Math.min(120, ui.ta.scrollHeight) + "px";
      ui.send.disabled = !ui.ta.value.trim();
      pingTyping();
    });
    ui.ta.addEventListener("keydown", function (e) {
      if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); ui.form.requestSubmit ? ui.form.requestSubmit() : submitText(); }
    });
    ui.form.addEventListener("submit", function (e) { e.preventDefault(); submitText(); });
    document.addEventListener("visibilitychange", function () { if (!document.hidden) schedule(true); });
    return ui;
  }

  function submitText() {
    var ui = st.ui, text = ui.ta.value.trim();
    if (!text) return;
    unlock();
    ui.ta.value = "";
    ui.ta.style.height = "auto";
    ui.send.disabled = true;
    ui.send.classList.remove("fly"); void ui.send.offsetWidth; ui.send.classList.add("fly");
    post(addPending(text, {}));
  }

  function pingTyping() {
    var now = Date.now();
    if (!st.chat || now - st.lastTypingPing < 3000) return;
    st.lastTypingPing = now;
    http("POST", "", { action: "typing" }).catch(function () {});
  }

  function nearBottom() {
    var b = st.ui.body;
    return b.scrollHeight - b.scrollTop - b.clientHeight < 90;
  }
  function toBottom(instant) {
    var b = st.ui.body, top = b.scrollHeight;
    if (instant || reduce) { b.scrollTop = top; return; }
    try { b.scrollTo({ top: top, behavior: "smooth" }); } catch (e) { b.scrollTop = top; }
  }

  /* a message bubble; list order is kept by timestamp */
  function bubble(m, animate) {
    var d = el("div", "tc-m " + (m.from === "visitor" ? "me" : "them"));
    var t = el("p", "tc-t", m.text);
    var meta = el("span", "tc-meta");
    var time = el("time", null, hhmm(m.ts));
    meta.appendChild(time);
    if (m.from === "visitor") {
      var tk = el("span", "tc-tick");
      tk.innerHTML = ICON.tick + ICON.tick;
      meta.appendChild(tk);
    }
    d.appendChild(t); d.appendChild(meta);
    d.dataset.ts = m.ts;
    if (m.id) d.dataset.id = m.id;
    if (animate === false) d.style.animation = "none";
    return d;
  }
  function msgEls() { return st.ui.body.querySelectorAll(".tc-m"); }
  function regroup() {
    var prev = null;
    [].forEach.call(msgEls(), function (e) {
      var side = e.classList.contains("me") ? "me" : "them";
      e.classList.toggle("grp", !!prev && prev === side);
      prev = side;
    });
  }
  function place(e) {
    var body = st.ui.body, list = msgEls(), ts = +e.dataset.ts, ref = null, i;
    for (i = list.length - 1; i >= 0; i--) {
      if (+list[i].dataset.ts <= ts) break;
      ref = list[i];
    }
    body.insertBefore(e, ref || st.ui.typing);
    regroup();
  }

  function sysNote() {
    var ui = st.ui, c = st.chat;
    if (!c && !ui.body.querySelector(".tc-m")) { ui.sys.hidden = true; return; }
    var hasAdmin = !!ui.body.querySelector(".tc-m.them");
    var firstMe = ui.body.querySelector(".tc-m.me");
    var text = "";
    if (c && c.status === "closed") text = "Support marked this conversation as resolved. Send a message to reopen it.";
    else if (!hasAdmin && firstMe) text = "Thanks, " + first((c && c.name) || st.pendingName) + "! Your message is in. A Taskly admin will reply right here, so feel free to keep browsing.";
    if (text && ui.sys.textContent !== text) {
      ui.sys.textContent = text;
      ui.sys.style.animation = "none"; void ui.sys.offsetWidth; ui.sys.style.animation = "";
    }
    ui.sys.hidden = !text;
    if (text) {
      if (c && c.status === "closed") ui.body.insertBefore(ui.sys, ui.typing); /* after the last message */
      else ui.body.insertBefore(ui.sys, firstMe.nextSibling);                  /* right under the first message */
    }
  }

  function seenTicks() {
    var mine = [].filter.call(msgEls(), function (e) { return e.classList.contains("me") && !e.classList.contains("sending") && !e.classList.contains("failed"); });
    mine.forEach(function (e, i) { e.classList.toggle("seen", i < mine.length - st.unseen); });
  }

  function setBadge() {
    var ui = st.ui;
    if (!ui) return;
    var n = st.open ? 0 : st.unread;
    ui.badge.hidden = !n;
    ui.badge.textContent = n > 9 ? "9+" : n;
    if (ui.resume) {
      ui.resume.hidden = !st.chat || st.open;
      var b = ui.resume.querySelector("b");
      b.hidden = !n; b.textContent = n;
    }
  }
  function setSub() {
    var ui = st.ui;
    ui.sub.classList.toggle("typing", st.typing);
    ui.sub.textContent = st.fails >= 3 ? "Reconnecting…" : st.typing ? "Support is typing…" : "Live chat · we reply right here";
  }

  /* ---------- state from the server ---------- */
  function apply(d, initial) {
    if (!d.chat) { ended(); return; }
    var ui = st.ui, prevUnread = st.unread, stick = nearBottom(), gotAdmin = false, added = false;
    st.chat = d.chat;
    st.unseen = d.chat.unseen || 0;
    st.unread = d.chat.unread || 0;
    (d.messages || []).forEach(function (m) {
      st.last = m.at;
      if (st.ids[m.id]) return;
      st.ids[m.id] = 1;
      var e = bubble(m, !initial);
      place(e);
      added = true;
      if (m.from === "admin") gotAdmin = true;
    });
    var wasTyping = st.typing;
    st.typing = !!d.chat.typing;
    ui.typing.hidden = !st.typing;
    if (st.typing) ui.body.appendChild(ui.typing);
    sysNote(); seenTicks(); setSub();
    if (added || st.typing !== wasTyping) { if (initial) toBottom(true); else if (stick || gotAdmin) toBottom(); }
    if (!initial && gotAdmin) {
      if (!st.open || document.hidden) chime();
      if (!st.open) { ui.fab.classList.remove("ping"); void ui.fab.offsetWidth; ui.fab.classList.add("ping"); }
    }
    if (st.open) st.unread = 0;
    if (!st.open && st.unread > prevUnread && !gotAdmin) chime();
    setBadge();
  }

  function ended() {
    var had = !!st.chat;
    st.chat = null; st.ids = {}; st.last = ""; st.unread = 0; st.unseen = 0; st.typing = false;
    clearTimeout(st.timer);
    if (st.ui) {
      st.ui.win.remove(); st.ui.fab.remove();
      if (st.ui.resume) st.ui.resume.remove();
      st.ui = null; st.open = false;
    }
    var s = document.getElementById("cstatus");
    if (had && s) s.textContent = "That conversation has ended. Send a new message to start another chat.";
  }

  function fetchState(initial) {
    var qs = st.last ? "?after=" + encodeURIComponent(st.last) : "";
    if (st.open) qs += (qs ? "&" : "?") + "open=1";
    return http("GET", qs).then(function (d) { st.fails = 0; apply(d, initial); });
  }
  function schedule(now) {
    clearTimeout(st.timer);
    if (!st.chat) return;
    var ms = now ? 50 : document.hidden ? 15000 : st.open ? 2200 : 7000;
    st.timer = setTimeout(function () {
      if (st.sending) { schedule(); return; }
      fetchState().catch(function (e) { st.fails++; if (st.ui) setSub(); if (e.status === 404) ended(); }).then(function () { schedule(); });
    }, ms);
  }

  /* ---------- sending ---------- */
  function addPending(text, extra) {
    var ui = build();
    var m = { from: "visitor", text: text, ts: Date.now(), id: "" };
    var e = bubble(m);
    e.classList.add("sending");
    e.querySelector(".tc-meta time").textContent = "Sending…";
    var p = { el: e, text: text, name: extra.name || "", email: extra.email || "", website: extra.website || "" };
    e.dataset.ts = "9999999999999"; /* a pending bubble is always the newest until the server confirms it */
    ui.body.insertBefore(e, ui.typing);
    regroup();
    st.pendingName = p.name || st.pendingName;
    sysNote();
    toBottom();
    return p;
  }
  function post(p) {
    var e = p.el;
    e.classList.remove("failed"); e.classList.add("sending");
    e.querySelector(".tc-meta time").textContent = "Sending…";
    e.onclick = null;
    st.sending++;
    var body = { action: st.chat ? "send" : "start", text: p.text };
    if (p.name) body.name = p.name;
    if (p.email) body.email = p.email;
    if (p.website) body.website = p.website;
    http("POST", "", body).then(function (d) {
      st.sending--;
      if (!d.message) { e.remove(); return; } /* honeypot answer: nothing was stored */
      e.classList.remove("sending");
      e.dataset.id = d.message.id; e.dataset.ts = d.message.ts;
      e.querySelector(".tc-meta time").textContent = hhmm(d.message.ts);
      st.ids[d.message.id] = 1;
      st.chat = d.chat;
      st.unseen = d.chat.unseen || 0;
      seenTicks(); sysNote(); addResume(); setBadge();
      schedule(true);
    }).catch(function (err) {
      st.sending--;
      if (err.code === "nochat" || err.status === 404) { ended(); return; }
      e.classList.remove("sending"); e.classList.add("failed");
      e.querySelector(".tc-meta time").textContent = err.status === 429 ? "Too fast · tap to retry" : "Not sent · tap to retry";
      e.onclick = function () { post(p); };
    });
  }

  /* ---------- open / close ---------- */
  function open() {
    var ui = build();
    if (st.open) return;
    st.open = true;
    ui.win.hidden = false;
    ui.win.classList.remove("tc-out", "tc-in");
    void ui.win.offsetWidth;
    ui.win.classList.add("tc-in");
    ui.fab.classList.add("tc-hide");
    ui.fab.classList.remove("ping");
    st.unread = 0; setBadge();
    toBottom(true);
    setTimeout(function () { if (st.open) { try { ui.ta.focus({ preventScroll: true }); } catch (e) { ui.ta.focus(); } } }, reduce ? 0 : 450);
    if (st.chat) { fetchState().catch(function () {}); schedule(); }
  }
  function close() {
    var ui = st.ui;
    if (!ui || !st.open) return;
    st.open = false;
    var hadFocus = ui.win.contains(document.activeElement);
    ui.win.classList.remove("tc-in");
    ui.win.classList.add("tc-out");
    ui.fab.classList.remove("tc-hide");
    setTimeout(function () {
      if (!st.open && st.ui) { ui.win.hidden = true; ui.win.classList.remove("tc-out"); }
    }, reduce ? 0 : 270);
    if (hadFocus) ui.fab.focus();
    setBadge();
    schedule();
  }

  /* ---------- the contact form entry point ---------- */
  function start(d) {
    unlock();
    var ui = build();
    var p = addPending(d.text, d);
    open();
    post(p);
    return true;
  }

  /* an "Open your conversation" button next to the contact form when a chat already exists */
  function addResume() {
    var ui = st.ui, f = document.getElementById("cform");
    if (!ui || !f || ui.resume) return;
    var b = el("button", "tc-resume");
    b.type = "button";
    b.innerHTML = ICON.chat + "<span>Open your conversation</span><b hidden></b>";
    b.onclick = function () { unlock(); open(); };
    f.appendChild(b);
    ui.resume = b;
    setBadge();
  }

  window.TasklyChat = {
    start: start,
    open: function () { if (st.ui) { unlock(); open(); } },
    has: function () { return !!st.chat; }
  };

  /* reconnect to a conversation that already exists (cookie) */
  http("GET").then(function (d) {
    if (!d.chat) return;
    build();
    apply(d, true);
    addResume();
    schedule();
  }).catch(function () {});

})();
