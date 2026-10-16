/* In-app: activity heartbeat + Support widget (chat with admin, send feedback) */
(function () {
  var S = window.TasklyStore, u = null, email = "", name = "";
  try { u = JSON.parse(localStorage.getItem("taskly:user")); } catch (e) {}
  if (u && typeof u === "object") { email = u.email || ""; name = u.name || ""; }
  if (!S || !email) return;
  function beat() {
    var d = S.get("taskly:data:v1", {}), t = d.todos || [];
    var ok = S.touch(email, { tasks: t.length, done: t.filter(function (x) { return x.done; }).length, rem: (d.reminders || []).length });
    if (!ok) { try { localStorage.removeItem("taskly:user"); } catch (e) {} location.href = "index.html"; }
  }
  beat(); setInterval(beat, 30000);

  var st = document.createElement("style");
  st.textContent = ".sp-b{position:fixed;right:18px;bottom:18px;z-index:900;width:52px;height:52px;border:0;border-radius:50%;background:var(--blue,#0084ff);color:#fff;font-size:22px;cursor:pointer;box-shadow:0 8px 24px rgba(0,0,0,.3)}.sp-b i{position:absolute;top:-2px;right:-2px;min-width:20px;height:20px;border-radius:10px;background:#e5484d;font:700 11px/20px sans-serif;font-style:normal}.sp-p{position:fixed;right:18px;bottom:80px;z-index:900;width:min(340px,calc(100vw - 36px));height:440px;display:flex;flex-direction:column;border-radius:18px;background:var(--surf2,#fff);backdrop-filter:blur(20px);border:1px solid var(--line,#ddd);color:var(--ink,#111);box-shadow:0 20px 50px rgba(0,0,0,.35);overflow:hidden}.sp-p[hidden]{display:none}.sp-t{display:flex}.sp-t button{flex:1;padding:12px;border:0;background:transparent;color:var(--muted,#666);font:600 13px inherit;cursor:pointer}.sp-t .on{color:var(--blue,#0084ff);box-shadow:inset 0 -2px var(--blue,#0084ff)}.sp-m{flex:1;overflow:auto;padding:10px;display:flex;flex-direction:column;gap:6px}.sp-m div{max-width:80%;padding:7px 11px;border-radius:14px;font-size:13.5px;background:rgba(120,130,150,.2)}.sp-m .me{align-self:flex-end;background:var(--blue,#0084ff);color:#fff}.sp-f{display:flex;gap:6px;padding:8px;border-top:1px solid var(--line,#ddd)}.sp-f input,.sp-f textarea{flex:1;padding:8px;border-radius:10px;border:1px solid var(--line,#ccc);background:transparent;color:inherit;font:inherit}.sp-f button,.sp-s{padding:8px 14px;border:0;border-radius:10px;background:var(--blue,#0084ff);color:#fff;font-weight:600;cursor:pointer}.sp-fb{flex:1;padding:12px;display:flex;flex-direction:column;gap:8px;font-size:13px}.sp-fb textarea{flex:1;padding:8px;border-radius:10px;border:1px solid var(--line,#ccc);background:transparent;color:inherit;font:inherit;resize:none}.sp-fb select{padding:8px;border-radius:10px;border:1px solid var(--line,#ccc);background:transparent;color:inherit}";
  document.head.appendChild(st);
  var b = document.createElement("button"); b.className = "sp-b"; b.setAttribute("aria-label", "Support"); b.innerHTML = "\u{1F4AC}<i hidden></i>";
  var p = document.createElement("div"); p.className = "sp-p"; p.hidden = true;
  p.innerHTML = '<div class="sp-t"><button class="on" data-t="c">Chat with admin</button><button data-t="f">Feedback</button></div>' +
    '<div id="spC" style="display:flex;flex-direction:column;flex:1;min-height:0"><div class="sp-m" id="spM"></div><div class="sp-f"><input id="spI" placeholder="Type a message" maxlength="500"><button id="spS">Send</button></div></div>' +
    '<div class="sp-fb" id="spF" hidden><label>Rating <select id="spR"><option>5</option><option>4</option><option>3</option><option>2</option><option>1</option></select></label><textarea id="spT" placeholder="Tell us what you think" maxlength="600"></textarea><button class="sp-s" id="spSend">Send feedback</button><span id="spOk"></span></div>';
  document.body.appendChild(b); document.body.appendChild(p);
  var $ = function (i) { return document.getElementById(i); };
  function render() {
    var ms = S.chat()[email.toLowerCase()] || [], m = $("spM");
    if (!p.hidden && !$("spC").hidden) S.markRead(email, "user");
    m.innerHTML = "";
    ms.forEach(function (x) { var d = document.createElement("div"); d.textContent = x.text; if (x.from === "user") d.className = "me"; m.appendChild(d); });
    if (!ms.length) m.innerHTML = "<div>Hi! Send us a message and an admin will reply here.</div>";
    m.scrollTop = 1e9;
    var n = S.unread(email, "user"), i = b.querySelector("i"); i.hidden = !n || !p.hidden; i.textContent = n;
  }
  b.onclick = function () { p.hidden = !p.hidden; render(); };
  p.querySelectorAll(".sp-t button").forEach(function (t) {
    t.onclick = function () {
      p.querySelectorAll(".sp-t button").forEach(function (x) { x.classList.toggle("on", x === t); });
      $("spC").hidden = t.dataset.t !== "c"; $("spF").hidden = t.dataset.t !== "f"; render();
    };
  });
  function send() { var v = $("spI").value.trim(); if (!v) return; S.send(email, "user", v); $("spI").value = ""; render(); }
  $("spS").onclick = send; $("spI").onkeydown = function (e) { if (e.key === "Enter") send(); };
  $("spSend").onclick = function () {
    var t = $("spT").value.trim(); if (!t) return;
    $("spOk").textContent = "Sending..."; S.addFeedback(email, name || email.split("@")[0], +$("spR").value, t, function (ok) { if (ok) $("spT").value = ""; $("spOk").textContent = ok ? "Thanks for your feedback!" : "Could not send. Please try again."; });
  };
  addEventListener("storage", render); setInterval(render, 4000); render();
})();