/* In-app: activity heartbeat + Chat panel (opened from the sidebar "Chat" button).
   Chat goes through /api/chat, the same server-backed conversation the admin sees under "Contact Chat",
   so messages reach the admin from any device. The Feedback tab sends feedback via TasklyStore.addFeedback. */
(function () {
  var S = window.TasklyStore, u = null, email = "", name = "";
  try { u = JSON.parse(localStorage.getItem("taskly:user")); } catch (e) {}
  if (u && typeof u === "object") { email = u.email || ""; name = u.name || ""; }
  if (!S || !email) return;

  /* ---------- heartbeat (unchanged): keeps "last active" up to date and signs out suspended accounts ---------- */
  function beat() {
    var d = S.get("taskly:data:v1", {}), t = d.todos || [];
    var ok = S.touch(email, { tasks: t.length, done: t.filter(function (x) { return x.done; }).length, rem: (d.reminders || []).length });
    if (!ok) { try { localStorage.removeItem("taskly:user"); } catch (e) {} location.href = "index.html"; }
  }
  beat(); setInterval(beat, 30000);

  var btn = document.getElementById("chatBtn");
  if (!btn) return;

  /* ---------- styles ---------- */
  var st = document.createElement("style");
  st.textContent =
    ".sp-bd{position:absolute;top:0;right:0;min-width:18px;height:18px;padding:0 5px;border-radius:9px;background:#e5484d;color:#fff;font:700 11px/18px sans-serif;text-align:center;pointer-events:none}.sp-bd[hidden]{display:none}" +
    ".sp-p{position:fixed;left:90px;bottom:24px;z-index:900;width:min(360px,calc(100vw - 36px));height:min(480px,calc(100vh - 48px));display:flex;flex-direction:column;border-radius:20px;" +
    "background:linear-gradient(var(--surf2,rgba(255,255,255,.92)),var(--surf2,rgba(255,255,255,.92))),var(--bg,#fff);backdrop-filter:blur(20px);border:1px solid var(--line,#ddd);color:var(--ink,#111);box-shadow:0 20px 50px rgba(0,0,0,.35);overflow:hidden}" +
    ".sp-p[hidden]{display:none}.sp-h{display:flex;align-items:stretch;border-bottom:1px solid var(--line,#ddd)}.sp-t{display:flex;flex:1}" +
    ".sp-t button{flex:1;padding:13px 8px;border:0;background:transparent;color:var(--muted,#666);font:600 13px inherit;cursor:pointer}.sp-t .on{color:var(--blue,#0084ff);box-shadow:inset 0 -2px var(--blue,#0084ff)}" +
    ".sp-x{width:44px;border:0;background:transparent;color:var(--muted,#666);font-size:22px;cursor:pointer}" +
    ".sp-m{flex:1;overflow:auto;padding:12px;display:flex;flex-direction:column;gap:6px}.sp-m div{max-width:82%;padding:8px 12px;border-radius:14px;font-size:13.5px;line-height:1.4;white-space:pre-wrap;word-break:break-word;background:rgba(120,130,150,.2)}" +
    ".sp-m .me{align-self:flex-end;background:var(--blue,#0084ff);color:#fff}.sp-m .sp-n{align-self:center;max-width:100%;background:transparent;color:var(--muted,#666);font-size:12px;text-align:center}" +
    ".sp-ty{padding:0 14px 6px;font-size:12px;color:var(--muted,#666);min-height:18px}" +
    ".sp-f{display:flex;gap:6px;padding:8px;border-top:1px solid var(--line,#ddd)}.sp-f input,.sp-f textarea{flex:1;min-width:0;padding:9px 10px;border-radius:10px;border:1px solid var(--line,#ccc);background:transparent;color:inherit;font:inherit}" +
    ".sp-f button,.sp-s{padding:8px 14px;border:0;border-radius:10px;background:var(--blue,#0084ff);color:#fff;font-weight:600;cursor:pointer}.sp-f button:disabled,.sp-s:disabled{opacity:.6;cursor:default}" +
    ".sp-fb{flex:1;padding:14px;display:flex;flex-direction:column;gap:8px;font-size:13px;overflow:auto}#spC{display:flex;flex-direction:column;flex:1;min-height:0}.sp-fb[hidden],#spC[hidden]{display:none}" +
    ".sp-fb textarea{flex:1;min-height:90px;padding:8px;border-radius:10px;border:1px solid var(--line,#ccc);background:transparent;color:inherit;font:inherit;resize:none}.sp-fb select{padding:8px;border-radius:10px;border:1px solid var(--line,#ccc);background:transparent;color:inherit}" +
    "@media (max-width:768px){.sp-p{left:50%;transform:translateX(-50%);bottom:calc(74px + env(safe-area-inset-bottom,0px));height:min(480px,calc(100vh - 110px))}}";
  document.head.appendChild(st);

  /* ---------- markup ---------- */
  var badge = document.createElement("i"); badge.className = "sp-bd"; badge.hidden = true; btn.appendChild(badge);
  var p = document.createElement("div"); p.className = "sp-p"; p.hidden = true;
  p.setAttribute("role", "dialog"); p.setAttribute("aria-label", "Chat with admin");
  p.innerHTML =
    '<div class="sp-h"><div class="sp-t"><button type="button" class="on" data-t="c">Chat with admin</button><button type="button" data-t="f">Feedback</button></div><button type="button" class="sp-x" id="spX" aria-label="Close chat">\u00d7</button></div>' +
    '<div id="spC"><div class="sp-m" id="spM" aria-live="polite"></div><div class="sp-ty" id="spTy"></div>' +
    '<div class="sp-f"><input id="spI" placeholder="Type a message" maxlength="1000" autocomplete="off"><button type="button" id="spS">Send</button></div></div>' +
    '<div class="sp-fb" id="spF" hidden><label>Rating <select id="spR"><option>5</option><option>4</option><option>3</option><option>2</option><option>1</option></select></label><textarea id="spT" placeholder="Tell us what you think" maxlength="600"></textarea><button type="button" class="sp-s" id="spSend">Send feedback</button><span id="spOk"></span></div>';
  document.body.appendChild(p);
  var $ = function (i) { return document.getElementById(i); };

  /* ---------- chat state + server calls ---------- */
  var chat = null, msgs = [], ids = {}, last = "", tab = "c", busy = false, polling = false, typedAt = 0, errText = "", sig = "";
  var who = (name && name.trim().length >= 2) ? name.trim() : (email.split("@")[0].length >= 2 ? email.split("@")[0] : "User");

  function api(method, qs, body) {
    var o = { method: method, cache: "no-store", credentials: "same-origin" };
    if (body) { o.headers = { "Content-Type": "application/json" }; o.body = JSON.stringify(body); }
    return fetch("/api/chat" + (qs || ""), o).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (d) {
        if (!r.ok) throw new Error(d.error || "Server error " + r.status);
        return d;
      });
    });
  }
  function isOpen() { return !p.hidden && tab === "c"; }
  function addMsgs(list) {
    var fresh = false;
    (list || []).forEach(function (m) {
      if (!m || ids[m.id]) return;
      ids[m.id] = 1; msgs.push(m); fresh = true;
      if (m.at && (!last || m.at > last)) last = m.at;
    });
    return fresh;
  }
  function render() {
    var m = $("spM"), atBottom = m.scrollHeight - m.scrollTop - m.clientHeight < 60;
    m.textContent = "";
    if (!msgs.length) { var h = document.createElement("div"); h.textContent = "Hi " + who.split(" ")[0] + "! Send us a message and an admin will reply here."; m.appendChild(h); }
    msgs.forEach(function (x) { var d = document.createElement("div"); d.textContent = x.text; if (x.from === "visitor") d.className = "me"; m.appendChild(d); });
    if (chat && chat.status === "closed") { var n = document.createElement("div"); n.className = "sp-n"; n.textContent = "This conversation was marked resolved. Send a message to reopen it."; m.appendChild(n); }
    if (errText) { var e = document.createElement("div"); e.className = "sp-n"; e.style.color = "#e5484d"; e.textContent = errText; m.appendChild(e); }
    if (atBottom || msgs.length < 2) m.scrollTop = 1e9;
    $("spTy").textContent = chat && chat.typing ? "Admin is typing\u2026" : "";
  }
  function setBadge() {
    var n = chat && !isOpen() ? (chat.unread || 0) : 0;
    badge.hidden = !n; badge.textContent = n > 9 ? "9+" : n;
  }
  function poll() {
    if (polling) return; polling = true;
    var qs = "?" + (last ? "after=" + encodeURIComponent(last) + "&" : "") + (isOpen() ? "open=1" : "");
    api("GET", qs).then(function (d) {
      chat = d.chat || null;
      var fresh = addMsgs(d.messages), now = (chat ? chat.status + "|" + !!chat.typing : "") + "|" + msgs.length;
      if (isOpen() && (fresh || now !== sig)) { sig = now; render(); }
      setBadge();
    }).catch(function () {}).then(function () { polling = false; });
  }
  function send() {
    var inp = $("spI"), v = inp.value.trim();
    if (!v || busy) return;
    busy = true; $("spS").disabled = true; errText = ""; inp.value = "";
    /* "start" also works for an existing conversation: the server only uses name/email when it has to create a new one */
    api("POST", "", { action: "start", name: who, email: email, text: v }).then(function (d) {
      if (d.chat) chat = d.chat;
      if (d.message) addMsgs([d.message]);
      render(); setBadge();
    }).catch(function (e) {
      inp.value = v; errText = e.message || "Could not send. Please try again."; render();
    }).then(function () { busy = false; $("spS").disabled = false; inp.focus(); });
  }

  /* ---------- panel open / close ---------- */
  function setOpen(on) {
    p.hidden = !on; btn.setAttribute("aria-expanded", on ? "true" : "false");
    if (on) { render(); poll(); setTimeout(function () { if (tab === "c") $("spI").focus(); }, 30); }
    setBadge();
  }
  btn.onclick = function () { setOpen(p.hidden); };
  $("spX").onclick = function () { setOpen(false); btn.focus(); };
  document.addEventListener("keydown", function (e) { if (e.key === "Escape" && !p.hidden) { setOpen(false); btn.focus(); } });
  document.addEventListener("mousedown", function (e) { if (!p.hidden && !p.contains(e.target) && !btn.contains(e.target) && matchMedia("(max-width:768px)").matches) setOpen(false); });

  p.querySelectorAll(".sp-t button").forEach(function (t) {
    t.onclick = function () {
      tab = t.dataset.t;
      p.querySelectorAll(".sp-t button").forEach(function (x) { x.classList.toggle("on", x === t); });
      $("spC").hidden = tab !== "c"; $("spF").hidden = tab !== "f";
      if (tab === "c") { render(); poll(); }
      setBadge();
    };
  });
  $("spS").onclick = send;
  $("spI").onkeydown = function (e) { if (e.key === "Enter") { e.preventDefault(); send(); } };
  $("spI").oninput = function () {
    if (!chat || Date.now() - typedAt < 2500) return;
    typedAt = Date.now(); api("POST", "", { action: "typing" }).catch(function () {});
  };

  /* ---------- feedback tab ---------- */
  $("spSend").onclick = function () {
    var t = $("spT").value.trim(); if (!t) return;
    $("spOk").textContent = "Sending...";
    S.addFeedback(email, name || email.split("@")[0], +$("spR").value, t, function (ok) {
      if (ok) $("spT").value = "";
      $("spOk").textContent = ok ? "Thanks for your feedback!" : "Could not send. Please try again.";
    });
  };

  /* poll fast while the chat is open, slowly (for the unread badge) otherwise */
  poll();
  setInterval(function () { if (isOpen() && !document.hidden) poll(); }, 3000);
  setInterval(function () { if (!isOpen() && !document.hidden) poll(); }, 20000);
})();
