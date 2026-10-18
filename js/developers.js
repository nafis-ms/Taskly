/* Landing page "Meet the developers" section: shows up to 3 cards saved by the admin (GET /api/developers).
   The section stays hidden until at least one developer has been added. */
(function () {
  "use strict";
  var sec = document.getElementById("developers"), grid = document.getElementById("devGrid");
  if (!sec || !grid) return;

  var st = document.createElement("style");
  st.textContent =
    ".devs{display:flex;flex-wrap:wrap;justify-content:center;gap:20px;width:100%;max-width:1000px}" +
    ".devs .dev{flex:1 1 260px;max-width:320px;align-items:center;text-align:center;gap:8px}" +
    ".dev .dav{width:96px;height:96px;border-radius:50%;object-fit:cover;display:grid;place-items:center;flex:none;margin-bottom:6px;" +
    "background:var(--grad,linear-gradient(135deg,#0084ff,#60b1ff));color:#fff;font:700 34px/1 var(--font-head,inherit);border:3px solid rgba(255,255,255,.6)}" +
    ".dev h3{margin:0}.dev .drole{color:var(--blue,#0084ff);font-weight:600;font-size:14px}" +
    ".dev .dbio{white-space:pre-line}" +
    ".dev .dlinks{display:flex;flex-wrap:wrap;justify-content:center;gap:8px;margin-top:6px}" +
    ".dev .dlinks a{padding:6px 14px;border-radius:999px;font-size:13px;font-weight:600;border:1px solid rgba(120,130,150,.35);color:var(--ink,#0b1220);transition:background .2s,color .2s}" +
    ".dev .dlinks a:hover{background:var(--blue,#0084ff);border-color:var(--blue,#0084ff);color:#fff}";
  document.head.appendChild(st);

  function initials(n) {
    var p = String(n || "?").trim().split(/\s+/);
    return ((p[0] || "?")[0] + (p.length > 1 ? p[p.length - 1][0] : "")).toUpperCase();
  }
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function avatar(d) {
    var fallback = function () { var f = el("div", "dav", initials(d.name)); f.setAttribute("aria-hidden", "true"); return f; };
    if (!d.photo) return fallback();
    var img = el("img", "dav");
    img.alt = d.name;
    img.loading = "lazy";
    img.referrerPolicy = "no-referrer";
    img.src = d.photo;
    img.onerror = function () { if (img.parentNode) img.parentNode.replaceChild(fallback(), img); };
    return img;
  }
  function card(d) {
    var c = el("article", "card dev");
    c.appendChild(avatar(d));
    c.appendChild(el("h3", "", d.name));
    if (d.role) c.appendChild(el("div", "drole", d.role));
    if (d.bio) c.appendChild(el("p", "dbio", d.bio));
    var links = [["GitHub", d.github], ["LinkedIn", d.linkedin], ["Website", d.website]].filter(function (l) { return /^https?:\/\//i.test(l[1] || ""); });
    if (links.length) {
      var row = el("div", "dlinks");
      links.forEach(function (l) {
        var a = el("a", "", l[0]);
        a.href = l[1]; a.target = "_blank"; a.rel = "noopener noreferrer";
        row.appendChild(a);
      });
      c.appendChild(row);
    }
    return c;
  }

  fetch("/api/developers", { cache: "no-store" })
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (d) {
      var list = d && Array.isArray(d.developers) ? d.developers.slice(0, 3) : [];
      if (!list.length) return;
      grid.textContent = "";
      list.forEach(function (x) { if (x && x.name) grid.appendChild(card(x)); });
      if (grid.children.length) sec.style.display = "";
    })
    .catch(function () {});
})();
