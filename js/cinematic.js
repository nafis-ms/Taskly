/* Taskly cinematic layer: behaviour for css/cinematic.css. Safe on every page; does nothing under reduced motion. */
(function () {
  "use strict";
  if (matchMedia("(prefers-reduced-motion:reduce)").matches) return;
  var d = document, root = d.documentElement;
  var fine = matchMedia("(pointer:fine)").matches;
  var $$ = function (s, c) { return [].slice.call((c || d).querySelectorAll(s)); };
  function mk(tag, cls, parent) { var e = d.createElement(tag); if (cls) e.className = cls; if (parent) parent.appendChild(e); return e; }

  /* 1. section titles: split into words that rise out of a mask (landing page) */
  $$(".sec h2").forEach(function (h) {
    if (h.children.length || !h.textContent.trim()) return;
    var words = h.textContent.trim().split(/\s+/);
    h.setAttribute("aria-label", h.textContent.trim());
    h.textContent = "";
    words.forEach(function (w, i) {
      var o = mk("span", "cx-w", h), s = mk("span", "", o);
      o.setAttribute("aria-hidden", "true");
      o.style.setProperty("--w", i);
      s.textContent = w;
      if (i < words.length - 1) h.appendChild(d.createTextNode(" "));
    });
    h.classList.add("cx-split");
    /* script.js adds .in when visible; this is the fallback if it did not tag the title */
    if (!h.classList.contains("rv") && "IntersectionObserver" in window) {
      var io = new IntersectionObserver(function (es) {
        es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } });
      }, { threshold: 0.3 });
      io.observe(h);
    }
  });

  var hero = d.querySelector(".hero");

  /* 2. scroll: progress bar (if premium.js is not providing one) + parallax depth variable */
  var bar = d.querySelector(".pp-bar") ? null : mk("div", "cx-bar", d.body), tick = false;
  if (bar) bar.setAttribute("aria-hidden", "true");
  function frame() {
    tick = false;
    var y = scrollY, max = root.scrollHeight - innerHeight;
    if (bar) bar.style.setProperty("--p", max > 0 ? Math.min(1, y / max).toFixed(4) : 0);
    if (hero) root.style.setProperty("--cx-sy", y < innerHeight * 1.4 ? Math.round(y) : Math.round(innerHeight * 1.4));
  }
  addEventListener("scroll", function () { if (!tick) { tick = true; requestAnimationFrame(frame); } }, { passive: true });
  frame();

  /* 4. cursor light for pages that do not already have one */
  if (fine && !d.querySelector(".pp-halo")) {
    var g = mk("div", "cx-glow", d.body), gx = innerWidth / 2, gy = innerHeight / 3, tx = gx, ty = gy, run = false;
    g.setAttribute("aria-hidden", "true");
    var loop = function () {
      gx += (tx - gx) * 0.1; gy += (ty - gy) * 0.1;
      g.style.transform = "translate3d(" + gx + "px," + gy + "px,0)";
      if (Math.abs(tx - gx) + Math.abs(ty - gy) > 0.5) requestAnimationFrame(loop); else run = false;
    };
    addEventListener("pointermove", function (e) {
      if (e.pointerType !== "mouse") return;
      tx = e.clientX; ty = e.clientY; g.classList.add("on");
      if (!run) { run = true; requestAnimationFrame(loop); }
    }, { passive: true });
    root.addEventListener("mouseleave", function () { g.classList.remove("on"); });
  }

  /* 5. 3D tilt on the landing-page content cards + magnetic call-to-action buttons */
  if (fine) {
    $$("article.card").forEach(function (c) {
      var raf = 0;
      c.addEventListener("pointerenter", function () { c.classList.add("cx-live"); });
      c.addEventListener("pointermove", function (e) {
        var r = c.getBoundingClientRect(), px = (e.clientX - r.left) / r.width - 0.5, py = (e.clientY - r.top) / r.height - 0.5;
        cancelAnimationFrame(raf);
        raf = requestAnimationFrame(function () {
          c.style.setProperty("--ry", (px * 9).toFixed(2) + "deg");
          c.style.setProperty("--rx", (-py * 9).toFixed(2) + "deg");
        });
      });
      c.addEventListener("pointerleave", function () { c.style.setProperty("--rx", "0deg"); c.style.setProperty("--ry", "0deg"); });
    });
    $$(".cta,.cta2").forEach(function (b) {
      b.addEventListener("pointermove", function (e) {
        var r = b.getBoundingClientRect();
        b.style.translate = ((e.clientX - r.left - r.width / 2) * 0.22).toFixed(1) + "px " + ((e.clientY - r.top - r.height / 2) * 0.3).toFixed(1) + "px";
      });
      b.addEventListener("pointerleave", function () { b.style.translate = ""; });
    });
  }

  /* 6. click ripple on action buttons */
  var RIP = ".submit,.cta,.cta2,.fbdone-btn,.modal-act button,.mdone,.dlink,.btn,.g-btn";
  d.addEventListener("pointerdown", function (e) {
    var b = e.target.closest && e.target.closest(RIP);
    if (!b || b.disabled) return;
    b.classList.add("cx-rh");
    var r = b.getBoundingClientRect(), s = Math.max(r.width, r.height) * 2.2, o = mk("span", "cx-rip", b);
    o.style.setProperty("--s", s + "px");
    o.style.setProperty("--x", (e.clientX - r.left) + "px");
    o.style.setProperty("--y", (e.clientY - r.top) + "px");
    setTimeout(function () { o.remove(); }, 900);
  });

  /* 7. smooth light/dark switch */
  var tb = d.getElementById("themeBtn") || d.getElementById("th");
  if (tb) tb.addEventListener("click", function () {
    root.classList.add("cx-theming");
    clearTimeout(root._cxT);
    root._cxT = setTimeout(function () { root.classList.remove("cx-theming"); }, 800);
  }, true);

  /* 8. app lists: rows that are genuinely new glide in; switching tabs replays the whole cascade */
  var LISTS = "#todoList,#upList,#histList,#remHistList,#mList,#wkList,#oneList,#dTodoList,#dRemList,#dToday,#dWeek";
  var boxes = $$(LISTS);
  function key(n) { return n.textContent.replace(/\s+/g, " ").slice(0, 240); }
  function stamp(n, i) {
    n.classList.remove("cx-new");
    void n.offsetWidth;
    n.style.setProperty("--i", Math.min(i, 14));
    n.classList.add("cx-new");
    setTimeout(function () { n.classList.remove("cx-new"); }, 1600 + Math.min(i, 14) * 55);
  }
  function replay(box) {
    box._seen = {};
    [].forEach.call(box.children, function (n, i) { box._seen[key(n)] = 1; stamp(n, i); });
  }
  boxes.forEach(function (box) {
    box._seen = {};
    new MutationObserver(function (muts) {
      var i = 0, nodes = [];
      muts.forEach(function (m) { [].forEach.call(m.addedNodes, function (n) { if (n.nodeType === 1) nodes.push(n); }); });
      if (Object.keys(box._seen).length > 400) box._seen = {};
      nodes.forEach(function (n) {
        var k = key(n);
        if (box._seen[k]) return;
        box._seen[k] = 1;
        stamp(n, i++);
      });
    }).observe(box, { childList: true });
  });
  /* panel becomes visible -> cascade its rows again */
  $$(".panel,.dash").forEach(function (p) {
    new MutationObserver(function () {
      if (p.hidden) return;
      $$(LISTS, p).forEach(replay);
    }).observe(p, { attributes: true, attributeFilter: ["hidden"] });
  });
  requestAnimationFrame(function () {
    boxes.forEach(function (b) { var p = b.closest(".panel,.dash"); if (!p || !p.hidden) replay(b); });
  });
})();
