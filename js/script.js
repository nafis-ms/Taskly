(function () {
  var $ = function (s, c) {
      return (c || document).querySelector(s);
    },
    $$ = function (s, c) {
      return [].slice.call((c || document).querySelectorAll(s));
    };
  var reduce = matchMedia("(prefers-reduced-motion:reduce)").matches;
  var burger = $("#burger"),
    mm = $("#mmenu");
  function menu(o) {
    burger.setAttribute("aria-expanded", o);
    mm.hidden = !o;
  }
  burger.onclick = function () {
    menu(mm.hidden);
  };
  $$('a[href^="#"]:not([data-open])').forEach(function (a) {
    a.addEventListener("click", function (e) {
      var t = $(a.getAttribute("href"));
      if (!t) return;
      e.preventDefault();
      menu(false);
      t.scrollIntoView({ behavior: reduce ? "auto" : "smooth" });
    });
  });
  var spy = new IntersectionObserver(
    function (es) {
      es.forEach(function (en) {
        if (en.isIntersecting) {
          $$(".links a").forEach(function (a) {
            a.setAttribute(
              "aria-current",
              a.getAttribute("href") === "#" + en.target.id,
            );
          });
        }
      });
    },
    { rootMargin: "-40% 0px -55% 0px" },
  );
  ["home", "features", "about", "contact"].forEach(function (id) {
    spy.observe(document.getElementById(id));
  });
  $$("[data-count]").forEach(function (el) {
    var t = +el.dataset.count,
      s = el.dataset.suffix;
    function run() {
      if (reduce) {
        el.textContent = t.toLocaleString() + s;
        return;
      }
      var st = performance.now();
      (function f(n) {
        var p = Math.min((n - st) / 1200, 1);
        el.textContent =
          Math.round(t * (1 - Math.pow(1 - p, 3))).toLocaleString() +
          (p < 1 ? "" : s);
        if (p < 1) requestAnimationFrame(f);
      })(st);
    }
    var io = new IntersectionObserver(function (e) {
      if (e[0].isIntersecting) {
        io.disconnect();
        run();
      }
    });
    io.observe(el);
  });
  $$("[data-bill]").forEach(function (b) {
    b.onclick = function () {
      var y = b.dataset.bill === "yearly";
      $$("[data-bill]").forEach(function (x) {
        x.classList.toggle("on", x === b);
      });
      $$(".price b").forEach(function (p) {
        p.textContent = "$" + (y ? p.dataset.y : p.dataset.m);
      });
    };
  });
  var modal = $("#modal"),
    form = $("#form"),
    done = $("#done"),
    last;
  function open(label) {
    last = document.activeElement;
    menu(false);
    form.hidden = false;
    done.hidden = true;
    form.reset();
    $$(".err", form).forEach(function (e) {
      e.textContent = "";
    });
    $$("input", form).forEach(function (i) {
      i.removeAttribute("aria-invalid");
    });
    var plan = /plan/.test(label);
    $("#mt").textContent =
      plan ? "Start with " + label.replace(" plan", "") : "Create your account";
    $("#ml").textContent =
      plan ?
        "Create your account to continue."
      : "Free for 14 days. No card needed.";
    modal.hidden = false;
    document.body.style.overflow = "hidden";
    setTimeout(function () {
      form.name.focus();
    }, 30);
  }
  function close() {
    modal.hidden = true;
    document.body.style.overflow = "";
    if (last) last.focus();
  }
  $$("[data-open]").forEach(function (b) {
    b.addEventListener("click", function (e) {
      e.preventDefault();
      open(b.dataset.open);
    });
  });
  $("#mx").onclick = close;
  $("#dc").onclick = close;
  modal.addEventListener("mousedown", function (e) {
    if (e.target === modal) close();
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") {
      if (!modal.hidden) close();
      else menu(false);
    }
    if (e.key === "Tab" && !modal.hidden) {
      var f = $$("button,input", modal).filter(function (x) {
        return x.offsetParent;
      });
      var a = f[0],
        z = f[f.length - 1];
      if (e.shiftKey && document.activeElement === a) {
        e.preventDefault();
        z.focus();
      } else if (!e.shiftKey && document.activeElement === z) {
        e.preventDefault();
        a.focus();
      }
    }
  });
  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var v = form.elements,
      ok = true;
    function chk(i, msg, bad) {
      var s = i.nextElementSibling;
      if (bad) {
        s.textContent = msg;
        i.setAttribute("aria-invalid", "true");
        if (ok) i.focus();
        ok = false;
      } else {
        s.textContent = "";
        i.removeAttribute("aria-invalid");
      }
    }
    chk(v.name, "Enter your full name.", v.name.value.trim().length < 2);
    chk(
      v.email,
      "Enter a valid email address.",
      !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.email.value.trim()),
    );
    chk(v.pw, "Use at least 8 characters.", v.pw.value.length < 8);
    if (!ok) return;
    $("#dm").textContent =
      "Welcome, " +
      v.name.value.trim().split(" ")[0] +
      ". We sent a confirmation link to " +
      v.email.value.trim() +
      ".";
    savePw(v.email.value.trim(), v.pw.value);
    TasklyStore.signup(v.email.value.trim(), v.name.value.trim());
    setUser(v.email.value.trim(), v.name.value.trim());
    form.hidden = true;
    done.hidden = false;
    $("#dc").focus();
  });
  var orb = $("#orb"),
    grab = $("#orbGrab"),
    pg = $(".page"),
    ox = 0,
    oy = 0,
    vx = 0,
    vy = 0,
    raf = 0,
    drag = false,
    mx = null,
    my = null,
    sx,
    sy,
    bx,
    by,
    lx,
    ly;
  function place(x, y) {
    var r = orb.getBoundingClientRect(),
      p = pg.getBoundingClientRect(),
      cx = r.left + r.width / 2 - ox,
      cy = r.top + r.height / 2 - oy;
    var nx = Math.max(p.left - cx, Math.min(p.right - cx, x)),
      ny = Math.max(p.top - cy, Math.min(p.bottom - cy, y));
    ox = nx;
    oy = ny;
    orb.style.transform = "translate3d(" + nx + "px," + ny + "px,0)";
    return [nx !== x, ny !== y];
  }
  function wake() {
    if (!raf) raf = requestAnimationFrame(tick);
  }
  /* physics: gravity-like spring toward home, soft push away from the cursor */
  function tick() {
    raf = 0;
    var near = false;
    if (!drag) {
      if (mx !== null && !reduce) {
        var r = orb.getBoundingClientRect(),
          cx = r.left + r.width / 2,
          cy = r.top + r.height / 2,
          reach = r.width * 0.32 * 1.4,
          dx = cx - mx,
          dy = cy - my,
          d = Math.hypot(dx, dy);
        if (d < reach) {
          near = true;
          if (d > 0.1) {
            var f = (1 - d / reach) * 0.9;
            vx += (dx / d) * f;
            vy += (dy / d) * f;
          }
        }
      }
      vx -= ox * 0.02;
      vy -= oy * 0.02;
      var damp = reduce ? 0.6 : 0.92;
      vx *= damp;
      vy *= damp;
      var b = place(ox + vx, oy + vy);
      if (b[0]) vx *= -0.5;
      if (b[1]) vy *= -0.5;
      if (
        !near &&
        Math.abs(vx) < 0.05 &&
        Math.abs(vy) < 0.05 &&
        Math.abs(ox) < 0.5 &&
        Math.abs(oy) < 0.5
      ) {
        place(0, 0);
        vx = vy = 0;
        return;
      }
    }
    raf = requestAnimationFrame(tick);
  }
  addEventListener("pointermove", function (e) {
    if (e.pointerType === "mouse") {
      mx = e.clientX;
      my = e.clientY;
      wake();
    }
  });
  document.addEventListener("mouseleave", function () {
    mx = null;
  });
  grab.addEventListener("pointerdown", function (e) {
    drag = true;
    sx = lx = e.clientX;
    sy = ly = e.clientY;
    bx = ox;
    by = oy;
    vx = vy = 0;
    grab.setPointerCapture(e.pointerId);
    orb.classList.add("dragging");
    wake();
  });
  grab.addEventListener("pointermove", function (e) {
    if (!drag) return;
    place(bx + e.clientX - sx, by + e.clientY - sy);
    vx = (e.clientX - lx) * 0.6;
    vy = (e.clientY - ly) * 0.6;
    lx = e.clientX;
    ly = e.clientY;
  });
  function end() {
    if (!drag) return;
    drag = false;
    orb.classList.remove("dragging");
    wake();
  }
  grab.addEventListener("pointerup", end);
  grab.addEventListener("pointercancel", end);
  grab.addEventListener("keydown", function (e) {
    var d = {
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
      ArrowUp: [0, -1],
      ArrowDown: [0, 1],
    }[e.key];
    if (d) {
      e.preventDefault();
      vx += d[0] * 12;
      vy += d[1] * 12;
      wake();
    }
  });
  addEventListener("resize", function () {
    place(ox, oy);
    wake();
  });
  var cf = $("#cform");
  cf.addEventListener("submit", function (e) {
    e.preventDefault();
    var v = cf.elements,
      ok = true,
      st = $("#cstatus");
    st.textContent = "";
    function chk(i, m, bad) {
      var s = i.nextElementSibling;
      if (bad) {
        s.textContent = m;
        i.setAttribute("aria-invalid", "true");
        if (ok) i.focus();
        ok = false;
      } else {
        s.textContent = "";
        i.removeAttribute("aria-invalid");
      }
    }
    chk(v.cn, "Enter your name.", v.cn.value.trim().length < 2);
    chk(
      v.ce,
      "Enter a valid email address.",
      !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.ce.value.trim()),
    );
    chk(v.cm, "Write at least 10 characters.", v.cm.value.trim().length < 10);
    if (!ok) return;
    st.textContent =
      "Thanks, " +
      v.cn.value.trim().split(" ")[0] +
      ". We got your message and will reply to " +
      v.ce.value.trim() +
      " within one business day.";
    cf.reset();
  });
  var words = [
      "Task",
      "Assignment",
      "Date",
      "Anniversary",
      "Events",
      "Birthday",
    ],
    colors = ["#8f7dff", "#ff7fb2", "#4fb4ff", "#ff9d5c", "#34d399", "#c084fc"],
    /* deeper shades of the same hues: readable on the light lavender background */
    lightColors = ["#5a3fd8", "#d4246f", "#0a6cd6", "#c4550a", "#0b8a5c", "#8a2fd6"],
    ri = 0,
    rw = $("#rot");
  function rotColor(i) {
    return document.documentElement.getAttribute("data-theme") === "dark" ? colors[i] : lightColors[i];
  }
  rw.style.color = rotColor(0);
  new MutationObserver(function () { rw.style.color = rotColor(ri); })
    .observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  setInterval(function () {
    ri = (ri + 1) % words.length;
    if (reduce) {
      rw.textContent = words[ri];
      rw.style.color = rotColor(ri);
      return;
    }
    rw.classList.add("out");
    setTimeout(function () {
      rw.classList.remove("out");
      rw.classList.add("pre");
      rw.textContent = words[ri];
      rw.style.color = rotColor(ri);
      void rw.offsetWidth;
      rw.classList.remove("pre");
    }, 260);
  }, 2500);
  /* log in */
  var lm = $("#lmodal"),
    lf = $("#lform"),
    ld = $("#ldone"),
    llast,
    eye = $("#eye");
  function lerr(i, m) {
    var s = i.closest("label").querySelector(".err");
    s.textContent = m || "";
    if (m) i.setAttribute("aria-invalid", "true");
    else i.removeAttribute("aria-invalid");
    return !m;
  }
  function lopen(keep) {
    if (!keep) llast = document.activeElement;
    menu(false);
    lf.hidden = false;
    ld.hidden = true;
    lf.reset();
    $("#lstatus").textContent = "";
    lerr(lf.elements.le);
    lerr(lf.elements.lp);
    lf.elements.lp.type = "password";
    eye.textContent = "Show";
    eye.setAttribute("aria-pressed", "false");
    eye.setAttribute("aria-label", "Show password");
    lm.hidden = false;
    document.body.style.overflow = "hidden";
    setTimeout(function () {
      lf.elements.le.focus();
    }, 30);
  }
  function lclose() {
    lm.hidden = true;
    document.body.style.overflow = "";
    if (llast && document.body.contains(llast) && llast.offsetParent !== null)
      llast.focus();
  }
  $$("[data-login]").forEach(function (b) {
    b.addEventListener("click", function (e) {
      e.preventDefault();
      lopen();
    });
  });
  $("#lx").onclick = lclose;
  $("#lc").onclick = lclose;
  lm.addEventListener("mousedown", function (e) {
    if (e.target === lm) lclose();
  });
  $("#toLogin").onclick = function () {
    llast = last;
    modal.hidden = true;
    lopen(true);
  };
  $("#toSignup").onclick = function () {
    var l = llast;
    lm.hidden = true;
    open("Sign up");
    last = l;
  };
  eye.onclick = function () {
    var p = lf.elements.lp,
      show = p.type === "password";
    p.type = show ? "text" : "password";
    eye.textContent = show ? "Hide" : "Show";
    eye.setAttribute("aria-pressed", show);
    eye.setAttribute("aria-label", show ? "Hide password" : "Show password");
  };
  var EM = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  $("#forgot").onclick = function () {
    var i = lf.elements.le,
      st = $("#lstatus");
    st.textContent = "";
    if (
      !lerr(i, EM.test(i.value.trim()) ? "" : "Enter your email above first.")
    ) {
      i.focus();
      return;
    }
    st.textContent =
      "If an account exists for " +
      i.value.trim() +
      ", we sent a password reset link.";
  };
  lf.addEventListener("submit", function (e) {
    e.preventDefault();
    var v = lf.elements,
      ok = true;
    $("#lstatus").textContent = "";
    var a = lerr(
      v.le,
      EM.test(v.le.value.trim()) ? "" : "Enter a valid email address.",
    );
    var b = lerr(v.lp, v.lp.value ? "" : "Enter your password.");
    if (!a) {
      v.le.focus();
      return;
    }
    if (!b) {
      v.lp.focus();
      return;
    }
    var saved = pwMap()[v.le.value.trim().toLowerCase()];
    if (saved && saved !== pwHash(v.lp.value)) {
      lerr(v.lp, "Incorrect password.");
      v.lp.focus();
      return;
    }
    if (!TasklyStore.login(v.le.value.trim())) {
      lerr(v.le, "This account is suspended. Contact support.");
      v.le.focus();
      return;
    }
    $("#ldm").textContent =
      "Welcome back! You are logged in as " + v.le.value.trim() + ".";
    setUser(v.le.value.trim());
    lf.hidden = true;
    ld.hidden = false;
    $("#lc").focus();
  });
  document.addEventListener("keydown", function (e) {
    if (lm.hidden) return;
    if (e.key === "Escape") {
      lclose();
      return;
    }
    if (e.key === "Tab") {
      var f = $$("button,input", lm).filter(function (x) {
        return x.offsetParent;
      });
      var a = f[0],
        z = f[f.length - 1];
      if (e.shiftKey && document.activeElement === a) {
        e.preventDefault();
        z.focus();
      } else if (!e.shiftKey && document.activeElement === z) {
        e.preventDefault();
        a.focus();
      }
    }
  });
  /* account menu */
  var acct = $("#acct"),
    ab = $("#acctBtn");
  function aopen(o) {
    acct.classList.toggle("open", o);
    ab.setAttribute("aria-expanded", o);
  }
  ab.addEventListener("click", function () {
    menu(false);
    aopen(!acct.classList.contains("open"));
  });
  $("#acctMenu").addEventListener("click", function () {
    aopen(false);
    last = llast = ab;
  });
  document.addEventListener("click", function (e) {
    if (!acct.contains(e.target)) aopen(false);
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && acct.classList.contains("open")) {
      aopen(false);
      ab.focus();
    }
  });
  var v = $("#orbVideo"),
    w = $("#orb");
  v.addEventListener("playing", function () {
    w.classList.add("is-playing");
  });
  v.addEventListener(
    "error",
    function () {
      w.classList.remove("is-playing");
    },
    true,
  );
  var p = v.play && v.play();
  if (p && p.catch) p.catch(function () {});
  /* dark mode */
  var tb = $("#themeBtn"),
    root = document.documentElement,
    cs = $('meta[name="color-scheme"]');
  function theme(d, save) {
    if (d) root.setAttribute("data-theme", "dark");
    else root.removeAttribute("data-theme");
    tb.setAttribute("aria-pressed", d);
    tb.setAttribute(
      "aria-label",
      d ? "Switch to light mode" : "Switch to dark mode",
    );
    if (cs) cs.setAttribute("content", d ? "dark" : "light");
    if (save) {
      try {
        localStorage.setItem("theme", d ? "dark" : "light");
      } catch (e) {}
    }
  }
  theme(root.getAttribute("data-theme") === "dark", false);
  tb.addEventListener("click", function () {
    theme(root.getAttribute("data-theme") !== "dark", true);
  });
  /* auth state: "Open app" is only shown when logged in */
  var USER_KEY = "taskly:user";
  function getUser() {
    try {
      return localStorage.getItem(USER_KEY);
    } catch (e) {
      return null;
    }
  }
  function nameMap() {
    try {
      return JSON.parse(localStorage.getItem("taskly:names") || "{}") || {};
    } catch (e) {
      return {};
    }
  }
  /* passwords live only in this browser (no server): a salted hash per email, shared with Settings in the app */
  function pwHash(pw) {
    var s = "taskly|" + pw, h1 = 0xdeadbeef, h2 = 0x41c6ce57;
    for (var i = 0; i < s.length; i++) {
      var c = s.charCodeAt(i);
      h1 = Math.imul(h1 ^ c, 2654435761);
      h2 = Math.imul(h2 ^ c, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return (h2 >>> 0).toString(16) + (h1 >>> 0).toString(16);
  }
  function pwMap() {
    try {
      return JSON.parse(localStorage.getItem("taskly:pw") || "{}") || {};
    } catch (e) {
      return {};
    }
  }
  function savePw(email, pw) {
    try {
      var m = pwMap();
      m[email.toLowerCase()] = pwHash(pw);
      localStorage.setItem("taskly:pw", JSON.stringify(m));
    } catch (e) {}
  }
  function setUser(email, name) {
    var key = email.toLowerCase();
    try {
      var m = nameMap();
      if (name) {
        m[key] = name;
        localStorage.setItem("taskly:names", JSON.stringify(m));
      } else name = m[key] || "";
      localStorage.setItem(USER_KEY, JSON.stringify({ email: email, name: name }));
    } catch (e) {}
    applyAuth();
  }
  function applyAuth() {
    var on = !!getUser();
    $$("[data-auth]").forEach(function (el) {
      el.hidden = el.dataset.auth === "in" ? !on : on;
    });
  }
  $$("[data-logout]").forEach(function (a) {
    a.addEventListener("click", function (e) {
      e.preventDefault();
      try {
        localStorage.removeItem(USER_KEY);
      } catch (err) {}
      applyAuth();
    });
  });
  $("#cta").addEventListener("click", function (e) {
    if (getUser()) return;
    e.preventDefault();
    open("Sign up");
  });
  applyAuth();
})();
/* cinematic extras: scroll reveal + pointer parallax */
(function () {
  if (!("IntersectionObserver" in window) || matchMedia("(prefers-reduced-motion:reduce)").matches) return;
  var io = new IntersectionObserver(function (es) {
    es.forEach(function (e) {
      if (!e.isIntersecting) return;
      e.target.classList.add("in");
      io.unobserve(e.target);
      setTimeout(function () { e.target.style.transitionDelay = ""; }, 1400);
    });
  }, { threshold: 0.15 });
  [].slice.call(document.querySelectorAll(".sec h2,.sec .lede,.card,.trusted,.cinfo")).forEach(function (el, i) {
    el.classList.add("rv");
    el.style.transitionDelay = (i % 3) * 90 + "ms";
    io.observe(el);
  });
  addEventListener("pointermove", function (e) {
    if (e.pointerType !== "mouse") return;
    var s = document.documentElement.style;
    s.setProperty("--mx", (e.clientX / innerWidth - 0.5).toFixed(3));
    s.setProperty("--my", (e.clientY / innerHeight - 0.5).toFixed(3));
  });
})();

/* bokeh bubbles: constant float + scroll "push" impulses that fade out like friction */
(function () {
  var pg = document.querySelector(".page");
  if (!pg) return;
  var reduce = matchMedia("(prefers-reduced-motion:reduce)").matches;
  var box = document.createElement("div");
  box.className = "bokeh";
  box.setAttribute("aria-hidden", "true");
  var cols = ["--bc1", "--bc2", "--bc3", "--bc4"],
    n = innerWidth < 700 ? 28 : 58,
    bs = [],
    W = innerWidth,
    H = innerHeight;
  for (var k = 0; k < n; k++) {
    var d = 0.3 + Math.random() * 0.9,
      size = Math.round((40 + d * 130 + Math.random() * 50) * 1.4),
      o = document.createElement("i"),
      s = document.createElement("b");
    o.style.width = o.style.height = size + "px";
    s.style.cssText =
      "--c:var(" + cols[k % 4] + ");--o:" + (0.35 + Math.random() * 0.4).toFixed(2) +
      ";--st:" + (d > 0.95 ? 10 : d > 0.65 ? 30 : 50) + "%;--bl:" + (d > 0.95 ? 16 : d > 0.65 ? 9 : 4) +
      "px;--dl:" + (0.9 + Math.random() * 1.6).toFixed(2) + "s;--fd:" + (7 + Math.random() * 8).toFixed(1) + "s";
    o.appendChild(s);
    box.appendChild(o);
    bs.push({
      el: o, d: d, size: size, x: Math.random(), y: Math.random() * (H + 2 * size),
      p: Math.random() * 6.28, sp: 8 + Math.random() * 10,
      ox: 0, vx: 0, vy: 0,
      fr: 0.9 + Math.random() * 0.8 /* friction: each bubble slows down at its own pace */
    });
  }
  pg.insertBefore(box, pg.firstChild);
  var mx = 0, my = 0, cmx = 0, cmy = 0, last = 0, lastY = scrollY;
  function clamp(v, m) { return v > m ? m : v < -m ? -m : v; }
  function draw(now) {
    if (document.documentElement.getAttribute("data-theme") === "dark") {
      last = 0;
      if (!reduce) requestAnimationFrame(draw);
      return;
    }
    var dt = Math.min((now - (last || now)) / 1000, 0.05);
    last = now;
    var t = now / 1000,
      k2 = 1 - Math.exp(-dt * 3),
      ds = clamp(scrollY - lastY, 140);
    lastY = scrollY;
    cmx += (mx - cmx) * k2;
    cmy += (my - cmy) * k2;
    bs.forEach(function (b) {
      if (ds) {
        /* scrolling pushes the bubble: nearer (bigger d) bubbles get a stronger kick */
        b.vy = clamp(b.vy + ds * b.d * 5, 1400);
        b.vx = clamp(b.vx + Math.sin(b.p * 3.1) * ds * b.d * 1.8, 700);
      }
      b.vx -= b.ox * 1.4 * dt; /* gentle pull back toward its home column */
      var damp = Math.exp(-dt * b.fr); /* the push fades out slowly */
      b.vx *= damp;
      b.vy *= damp;
      b.ox += b.vx * dt;
      b.y += (-b.sp * b.d + b.vy) * dt;
      var span = H + 2 * b.size,
        y = ((b.y % span) + span) % span - b.size + cmy * b.d * 40,
        x = b.x * W + Math.sin(t * 0.22 * b.d + b.p) * 70 * b.d + b.ox + cmx * b.d * 70 - b.size / 2;
      b.el.style.transform = "translate3d(" + x.toFixed(1) + "px," + y.toFixed(1) + "px,0)";
    });
    if (!reduce) requestAnimationFrame(draw);
  }
  addEventListener("pointermove", function (e) {
    if (e.pointerType !== "mouse") return;
    mx = e.clientX / innerWidth - 0.5;
    my = e.clientY / innerHeight - 0.5;
  });
  addEventListener("resize", function () { W = innerWidth; H = innerHeight; });
  requestAnimationFrame(draw);
})();