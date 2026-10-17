/* Taskly premium layer: scroll progress, film grain, cursor light, card spotlight, section dots, section cross-fade. */
(function () {
  "use strict";
  var d = document, root = d.documentElement;
  var reduce = matchMedia("(prefers-reduced-motion:reduce)").matches;
  var fine = matchMedia("(pointer:fine)").matches;
  var desktop = matchMedia("(min-width:768px)");
  function el(tag, cls, parent) {
    var e = d.createElement(tag);
    if (cls) e.className = cls;
    (parent || d.body).appendChild(e);
    return e;
  }
  var labels = { home: "Home", features: "Features", about: "About us", feedback: "Feedback", contact: "Contact" };
  var secs = Object.keys(labels).map(function (id) { return d.getElementById(id); }).filter(Boolean);

  /* scroll progress, navbar depth, and the cross-fade value each section fades with */
  var bar = el("div", "pp-bar"), ticking = false;
  bar.setAttribute("aria-hidden", "true");
  el("div", "pp-grain").setAttribute("aria-hidden", "true");
  function frame() {
    ticking = false;
    var max = root.scrollHeight - innerHeight, y = scrollY, vh = innerHeight;
    bar.style.setProperty("--p", max > 0 ? Math.min(1, y / max).toFixed(4) : 0);
    root.classList.toggle("pp-scrolled", y > 24);
    secs.forEach(function (s) {
      if (!desktop.matches) { s.style.removeProperty("--sp"); return; }
      var r = s.getBoundingClientRect(), t = 0;
      if (r.top > 0) t = r.top / vh;
      else if (r.bottom < vh) t = (vh - r.bottom) / vh;
      s.style.setProperty("--sp", Math.min(1, t).toFixed(3));
    });
  }
  function req() { if (!ticking) { ticking = true; requestAnimationFrame(frame); } }
  addEventListener("scroll", req, { passive: true });
  addEventListener("resize", req);
  frame();

  /* light that follows the mouse */
  if (fine && !reduce) {
    var halo = el("div", "pp-halo"), hx = innerWidth / 2, hy = innerHeight / 3, tx = hx, ty = hy, run = false;
    halo.setAttribute("aria-hidden", "true");
    var loop = function () {
      hx += (tx - hx) * 0.12;
      hy += (ty - hy) * 0.12;
      halo.style.transform = "translate3d(" + hx + "px," + hy + "px,0)";
      if (Math.abs(tx - hx) + Math.abs(ty - hy) > 0.5) requestAnimationFrame(loop);
      else run = false;
    };
    addEventListener("pointermove", function (e) {
      if (e.pointerType !== "mouse") return;
      tx = e.clientX;
      ty = e.clientY;
      halo.classList.add("on");
      if (!run) { run = true; requestAnimationFrame(loop); }
    }, { passive: true });
    root.addEventListener("mouseleave", function () { halo.classList.remove("on"); });
  }

  /* spotlight that tracks the cursor across each card */
  [].forEach.call(d.querySelectorAll(".card"), function (c) {
    el("span", "pp-spot", c).setAttribute("aria-hidden", "true");
    c.addEventListener("pointermove", function (e) {
      var r = c.getBoundingClientRect();
      c.style.setProperty("--mx", e.clientX - r.left + "px");
      c.style.setProperty("--my", e.clientY - r.top + "px");
    });
  });

  /* section dots */
  if (secs.length && "IntersectionObserver" in window) {
    var dots = el("nav", "pp-dots");
    dots.setAttribute("aria-label", "Sections");
    var links = secs.map(function (s) {
      var a = el("a", "", dots);
      a.href = "#" + s.id;
      a.dataset.l = labels[s.id];
      a.setAttribute("aria-label", labels[s.id]);
      a.addEventListener("click", function (e) {
        e.preventDefault();
        s.scrollIntoView({ behavior: reduce ? "auto" : "smooth" });
      });
      return a;
    });
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) {
        if (!e.isIntersecting) return;
        links.forEach(function (a) { a.setAttribute("aria-current", a.getAttribute("href") === "#" + e.target.id); });
      });
    }, { rootMargin: "-45% 0px -45% 0px" });
    secs.forEach(function (s) { io.observe(s); });
  }
})();
