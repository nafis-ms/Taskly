/* Mobile navigation: backdrop, scroll lock, outside-tap / Esc to close, active link, hide-on-scroll. */
(function () {
  var burger = document.getElementById("burger"), mm = document.getElementById("mmenu"),
    nav = document.querySelector(".nav");
  if (!burger || !mm || !nav) return;
  var phone = matchMedia("(max-width:767px)");
  var bd = document.createElement("div");
  bd.className = "mm-backdrop";
  bd.setAttribute("aria-hidden", "true");
  document.body.appendChild(bd);

  function isOpen() { return !mm.hidden; }
  function sync() {
    var o = isOpen() && phone.matches;
    document.documentElement.classList.toggle("mm-open", o);
    bd.classList.toggle("on", o);
    if (o) current();
    else nav.classList.remove("nav-hide");
  }
  function current() {
    var best = "";
    ["home", "features", "about", "feedback", "contact"].forEach(function (id) {
      var s = document.getElementById(id);
      if (s && s.getBoundingClientRect().top <= innerHeight * 0.4) best = id;
    });
    [].forEach.call(mm.querySelectorAll(".mm-links a[href^='#']"), function (a) {
      a.setAttribute("aria-current", a.getAttribute("href") === "#" + best);
    });
  }
  function close() { if (isOpen()) { burger.click(); } }

  new MutationObserver(sync).observe(mm, { attributes: true, attributeFilter: ["hidden"] });
  bd.addEventListener("click", close);
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") close(); });
  mm.addEventListener("click", function (e) {
    var a = e.target.closest("a");
    if (a && (a.hasAttribute("data-login") || a.hasAttribute("data-open") || a.hasAttribute("data-logout") || /\.html/.test(a.getAttribute("href") || ""))) close();
  });
  phone.addEventListener && phone.addEventListener("change", function () { if (!phone.matches && isOpen()) close(); sync(); });

  /* hide the bar when scrolling down, bring it back on scroll up */
  var last = scrollY, ticking = false;
  addEventListener("scroll", function () {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(function () {
      var y = scrollY, d = y - last;
      if (phone.matches && !isOpen()) {
        if (d > 8 && y > 140) nav.classList.add("nav-hide");
        else if (d < -6 || y < 60) nav.classList.remove("nav-hide");
        nav.classList.toggle("nav-solid", y > 24);
      }
      if (Math.abs(d) > 2) last = y;
      ticking = false;
    });
  }, { passive: true });
})();
