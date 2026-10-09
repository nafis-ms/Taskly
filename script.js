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
    setUser(v.email.value.trim());
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
    colors = ["#0084ff", "#7c3aed", "#e11d48", "#f97316", "#059669", "#db2777"],
    ri = 0,
    rw = $("#rot");
  rw.style.color = colors[0];
  setInterval(function () {
    ri = (ri + 1) % words.length;
    if (reduce) {
      rw.textContent = words[ri];
      rw.style.color = colors[ri];
      return;
    }
    rw.classList.add("out");
    setTimeout(function () {
      rw.classList.remove("out");
      rw.classList.add("pre");
      rw.textContent = words[ri];
      rw.style.color = colors[ri];
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
  function setUser(email) {
    try {
      localStorage.setItem(USER_KEY, email);
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