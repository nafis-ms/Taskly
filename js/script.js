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
  ["home", "features", "about", "feedback", "contact"].forEach(function (id) {
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
      : "Free to use. No card needed.";
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
  $("#dc").onclick = function () {
    if (done.dataset.go) { location.href = "app.html"; return; }
    close();
  };
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
  var pwbar = $("#pwbar"),
    pwlabel = $("#pwlabel");
  function pwShow() {
    var r = TasklyAuth.strength(form.elements.pw.value);
    pwbar.dataset.l = r.level;
    pwbar.classList.toggle("on", r.level > 0);
    pwlabel.textContent = r.label;
  }
  form.elements.pw.addEventListener("input", pwShow);
  form.addEventListener("reset", function () {
    setTimeout(pwShow, 0);
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
    var pwv = v.pw.value;
    chk(
      v.pw,
      pwv.length < 8
        ? "Use at least 8 characters."
        : "Password is too easy. Mix letters and numbers (add a symbol for a hard password).",
      pwv.length < 8 || TasklyAuth.strength(pwv).level < 2,
    );
    if (!ok) return;
    var sb = form.querySelector(".submit"),
      ss = $("#sstatus"),
      em = v.email.value.trim(),
      nm = v.name.value.trim();
    ss.textContent = "";
    sb.disabled = true;
    TasklyAuth.signUp(em, v.pw.value, nm).then(function (r) {
      sb.disabled = false;
      if (r.error) {
        var msg = TasklyAuth.friendly(r.error);
        chk(v.email, msg, true);
        return;
      }
      TasklyStore.signup(em, nm);
      $("#dt").textContent = r.needsConfirm ? "Check your email" : "You're in!";
      $("#dm").textContent = r.needsConfirm
        ? "We sent a confirmation link to " + em + ". Click it to verify your email, then log in. (Check spam if you don't see it.)"
        : "Welcome, " + nm.split(" ")[0] + ".";
      form.hidden = true;
      done.hidden = false;
      $("#dc").focus();
      if (!r.needsConfirm) {
        /* signed in straight away (no email confirmation needed): go to the dashboard */
        done.dataset.go = "1";
        try { localStorage.setItem("taskly:user", JSON.stringify({ email: em, name: nm })); } catch (e) {}
        setTimeout(function () { location.href = "app.html"; }, 1200);
      }
    });
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
    var who = v.cn.value.trim().split(" ")[0];
    if (window.TasklyChat) {
      /* live chat: the chat window pops up and the admin replies there */
      window.TasklyChat.start({
        name: v.cn.value.trim(),
        email: v.ce.value.trim(),
        text: v.cm.value.trim(),
        website: v.website ? v.website.value : "",
      });
      st.textContent = "Thanks, " + who + ". Your chat is open, and we'll reply right there.";
    } else {
      st.textContent =
        "Thanks, " + who + ". We got your message and will reply to " + v.ce.value.trim() + " within one business day.";
    }
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
  window.addEventListener("pageshow", function (e) {
    if (!e.persisted) return;
    var b = lf.querySelector(".submit");
    b.style.minHeight = "";
    b.disabled = false;
    b.classList.remove("is-loading");
    b.removeAttribute("aria-busy");
  });
  $("#lx").onclick = lclose;
  $("#lc").onclick = function () { location.href = "app.html"; };
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
    TasklyAuth.resetPassword(i.value.trim());
    st.textContent =
      "If an account exists for " +
      i.value.trim() +
      ", we sent a password reset link.";
  };
  lf.addEventListener("submit", function (e) {
    e.preventDefault();
    var v = lf.elements;
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
    var lb = lf.querySelector(".submit"),
      lem = v.le.value.trim();
    lb.style.minHeight = lb.offsetHeight + "px"; /* keep the button size while the label is replaced by the spinner */
    var lstop = function () {
      lb.style.minHeight = "";
      lb.disabled = false;
      lb.classList.remove("is-loading");
      lb.removeAttribute("aria-busy");
    };
    lb.disabled = true;
    lb.classList.add("is-loading"); /* spinner on the button until the dashboard has loaded */
    lb.setAttribute("aria-busy", "true");
    TasklyAuth.signIn(lem, v.lp.value).then(function (r) {
      if (r.error) {
        lstop();
        var msg = TasklyAuth.friendly(r.error);
        if (/confirm your email/i.test(msg)) {
          lerr(v.le, msg);
          $("#lstatus").innerHTML = "";
          var rb = document.createElement("button");
          rb.type = "button";
          rb.className = "link";
          rb.textContent = "Resend confirmation email";
          rb.onclick = function () {
            TasklyAuth.resend(lem);
            $("#lstatus").textContent = "Confirmation email sent to " + lem + ".";
          };
          $("#lstatus").appendChild(rb);
        } else lerr(/password|credentials/i.test(msg) ? v.lp : v.le, msg);
        return;
      }
      if (!TasklyStore.login(lem)) {
        lstop();
        TasklyAuth.signOut();
        lerr(v.le, "This account is suspended. Contact support.");
        v.le.focus();
        return;
      }
      /* logged in: no pop-up, the button keeps spinning while the dashboard loads */
      location.href = "app.html";
    });
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
      TasklyAuth.signOut();
      applyAuth();
    });
  });
  $$("[data-google]").forEach(function (b) {
    b.addEventListener("click", function () {
      b.disabled = true;
      TasklyAuth.google().then(function (r) {
        if (r && r.error) {
          b.disabled = false;
          var t = b.closest("form").querySelector(".ok");
          if (t) t.textContent = TasklyAuth.friendly(r.error);
        }
      });
    });
  });
  /* fired by auth.js when a verified session exists (Google return, email-link return, password login) */
  window.addEventListener("taskly-auth", function (e) {
    if (!TasklyStore.login(e.detail.email)) {
      TasklyAuth.signOut();
      return;
    }
    setUser(e.detail.email, e.detail.name);
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
/* desktop: one scroll gesture = one section (phones keep normal smooth scrolling) */
(function () {
  var ids = ["home", "features", "about", "feedback", "contact", "developers"];
  var secs = [];
  /* the developers section is hidden until a developer is added, so the list is rebuilt on every wheel event */
  function refresh() {
    secs = ids.map(function (id) { return document.getElementById(id); }).filter(function (s) {
      return s && s.getClientRects().length;
    });
  }
  refresh();
  if (secs.length < 5) return;
  var desktop = matchMedia("(min-width:768px)");
  var reduce = matchMedia("(prefers-reduced-motion:reduce)");
  var busyUntil = 0, last = 0;
  /* true when the pointer is over something (e.g. a long textarea) that can still scroll that way */
  function inner(t, dir) {
    for (; t && t.nodeType === 1 && t !== document.body; t = t.parentNode) {
      if (t.scrollHeight > t.clientHeight + 1 && /(auto|scroll)/.test(getComputedStyle(t).overflowY)) {
        if (dir > 0 ? t.scrollTop + t.clientHeight < t.scrollHeight - 1 : t.scrollTop > 0) return true;
      }
    }
    return false;
  }
  function current() {
    var mid = innerHeight / 2, i;
    for (i = 0; i < secs.length; i++) {
      var r = secs[i].getBoundingClientRect();
      if (r.top <= mid && r.bottom > mid) return i;
    }
    return 0;
  }
  addEventListener(
    "wheel",
    function (e) {
      if (!desktop.matches || e.ctrlKey || Math.abs(e.deltaY) < Math.abs(e.deltaX)) return;
      if (document.querySelector(".modal:not([hidden])")) return;
      refresh();
      var i = current(), dir = e.deltaY > 0 ? 1 : -1, r = secs[i].getBoundingClientRect();
      if (inner(e.target, dir)) return;
      /* a section taller than the screen scrolls normally until its edge */
      if (dir > 0 && r.bottom > innerHeight + 2) return;
      if (dir < 0 && r.top < -2) return;
      e.preventDefault();
      var now = Date.now(), gap = now - last;
      last = now;
      if (now < busyUntil || gap < 80) return;
      var next = secs[i + dir];
      if (!next) return;
      busyUntil = now + 900;
      next.scrollIntoView({ behavior: reduce.matches ? "auto" : "smooth" });
    },
    { passive: false },
  );
})();

/* feedback: submit card + slider card */
(function () {
  var form = document.getElementById("fbform");
  if (!form) return;
  var $ = function (id) { return document.getElementById(id); };
  var LIMIT = 1000, SHORT = 260, AUTOPLAY = 6000;
  var STAR = "M10 1.5l2.5 5.4 5.9.7-4.4 4 1.2 5.8L10 14.5l-5.2 2.9L6 11.6 1.6 7.6l5.9-.7z";
  var reduce = matchMedia("(prefers-reduced-motion:reduce)").matches;
  var el = form.elements,
    nameWrap = $("fbname"),
    counter = $("fbcount"),
    status = $("fbstatus"),
    rateErr = $("fbrerr"),
    btn = form.querySelector(".submit"),
    card = $("fbview"),
    track = $("fbtrack"),
    dots = $("fbdots"),
    nav = $("fbnav"),
    prog = $("fbprog"),
    curEl = $("fbcur"),
    totEl = $("fbtot");
  var items = [], timer = null, hold = false, visible = false, holdT = 0, raf = 0;

  /* ---------- slider (all user text goes in with textContent, never innerHTML) ---------- */
  function stars(n) {
    n = Math.min(5, Math.max(1, parseInt(n, 10) || 5));
    var d = document.createElement("div"), h = "";
    d.className = "fb-stars";
    d.setAttribute("role", "img");
    d.setAttribute("aria-label", n + " out of 5 stars");
    for (var i = 1; i <= 5; i++)
      h += '<svg viewBox="0 0 20 20" class="' + (i <= n ? "" : "off") + '" aria-hidden="true"><path d="' + STAR + '"/></svg>';
    d.innerHTML = h;
    return d;
  }
  function slide(it) {
    var f = document.createElement("figure"),
      q = document.createElement("blockquote"),
      c = document.createElement("figcaption"),
      text = String(it.text || "");
    f.className = "fb-slide";
    q.className = "fb-text";
    c.className = "fb-by";
    var top = document.createElement("div");
    top.className = "fb-top";
    top.appendChild(stars(it.rating));
    var num = document.createElement("span");
    num.className = "fb-num";
    num.textContent = (Math.min(5, Math.max(1, parseInt(it.rating, 10) || 5))).toFixed(1);
    top.appendChild(num);
    f.appendChild(top);
    f.appendChild(q);
    if (text.length > SHORT) {
      var open = false, more = document.createElement("button");
      more.type = "button";
      more.className = "fb-more";
      var paint = function () {
        q.textContent = open ? text : text.slice(0, SHORT).replace(/\s+\S*$/, "") + "…";
        more.textContent = open ? "Show less" : "Read more";
        more.setAttribute("aria-expanded", open);
      };
      more.onclick = function () { open = !open; paint(); play(); };
      paint();
      f.appendChild(more);
    } else q.textContent = text;
    var nm = String(it.name || "").trim() || "Anonymous";
    var av = document.createElement("span");
    av.className = "fb-av";
    av.setAttribute("aria-hidden", "true");
    av.textContent = nm === "Anonymous" ? "?" : nm.charAt(0).toUpperCase();
    av.style.setProperty("--h", (nm.charCodeAt(0) * 37) % 60 + 240);
    var who = document.createElement("span");
    who.className = "fb-name";
    who.textContent = nm;
    var vt = document.createElement("small");
    vt.textContent = "Taskly user";
    var wb = document.createElement("span");
    wb.className = "fb-who";
    wb.appendChild(who);
    wb.appendChild(vt);
    c.appendChild(av);
    c.appendChild(wb);
    f.appendChild(c);
    return f;
  }
  function note(msg) {
    var f = document.createElement("figure"), q = document.createElement("blockquote");
    f.className = "fb-slide fb-empty";
    q.className = "fb-text";
    q.textContent = msg;
    f.appendChild(q);
    return f;
  }
  function count() { return track.children.length; }
  function index() { return Math.round(track.scrollLeft / (track.clientWidth || 1)); }
  function mark() {
    var i = index();
    [].forEach.call(dots.children, function (d, k) { d.setAttribute("aria-current", k === i); });
    [].forEach.call(track.children, function (s, k) { s.classList.toggle("is-active", k === i); });
    var n = count();
    if (curEl) { curEl.textContent = pad(Math.min(i + 1, n)); totEl.textContent = pad(n); }
  }
  function pad(n) { return (n < 10 ? "0" : "") + n; }
  function bar() {
    if (!prog) return;
    prog.classList.remove("run");
    void prog.offsetWidth;
    if (timer) prog.classList.add("run");
  }
  function summary() {
    var sum = $("fbsum");
    if (!items.length) { sum.hidden = true; return; }
    var t = 0;
    items.forEach(function (x) { t += Math.min(5, Math.max(1, parseInt(x.rating, 10) || 5)); });
    var avg = t / items.length;
    $("fbavg").textContent = avg.toFixed(1);
    $("fbtotal").textContent = items.length + (items.length === 1 ? " review" : " reviews");
    var st = stars(Math.round(avg));
    $("fbavgst").innerHTML = st.innerHTML;
    sum.hidden = false;
  }
  var tgt = null, tgtT = 0;
  function at() { return tgt === null ? index() : tgt; }
  function go(i) {
    var n = count();
    if (!n) return;
    i = (i + n) % n;
    tgt = i;
    clearTimeout(tgtT);
    tgtT = setTimeout(function () { tgt = null; }, 700);
    track.scrollTo({ left: i * track.clientWidth, behavior: reduce ? "auto" : "smooth" });
  }
  function render(emptyMsg) {
    var list = items;
    track.textContent = "";
    dots.textContent = "";
    if (!list.length) {
      track.appendChild(note(emptyMsg || "No feedback yet. Yours could be the first."));
      nav.hidden = true;
      prog.hidden = true;
      summary();
      mark();
      return;
    }
    list.forEach(function (it, i) {
      track.appendChild(slide(it));
      var d = document.createElement("button");
      d.type = "button";
      d.setAttribute("aria-label", "Show feedback " + (i + 1));
      d.onclick = function () { go(i); play(); };
      dots.appendChild(d);
    });
    nav.hidden = list.length < 2;
    prog.hidden = list.length < 2;
    track.scrollLeft = 0;
    summary();
    mark();
  }
  function play() {
    clearInterval(timer);
    timer = null;
    if (prog) prog.classList.remove("run");
    var expanded = track.querySelector('.fb-more[aria-expanded="true"]');
    if (reduce || count() < 2 || hold || expanded || !visible || document.hidden) return;
    timer = setInterval(function () { go(at() + 1); bar(); }, AUTOPLAY);
    bar();
  }
  function pause(ms) {
    hold = true;
    clearTimeout(holdT);
    play();
    if (ms) holdT = setTimeout(function () { hold = false; play(); }, ms);
  }
  function resume() { clearTimeout(holdT); hold = false; play(); }
  track.addEventListener("scroll", function () {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(mark);
  });
  $("fbprev").onclick = function () { go(at() - 1); play(); };
  $("fbnext").onclick = function () { go(at() + 1); play(); };
  card.addEventListener("mouseenter", function () { pause(); });
  card.addEventListener("mouseleave", resume);
  card.addEventListener("focusin", function () { pause(); });
  card.addEventListener("focusout", resume);
  card.addEventListener("touchstart", function () { pause(10000); }, { passive: true });
  document.addEventListener("visibilitychange", play);
  card.addEventListener("pointermove", function (e) {
    var r = card.getBoundingClientRect();
    card.style.setProperty("--mx", e.clientX - r.left + "px");
    card.style.setProperty("--my", e.clientY - r.top + "px");
  });
  /* desktop: drag the slider with the mouse (touch already swipes natively) */
  (function () {
    var down = false, sx = 0, sl = 0, moved = false;
    track.addEventListener("pointerdown", function (e) {
      if (e.pointerType !== "mouse" || e.button !== 0 || e.target.closest("button")) return;
      down = true; moved = false; sx = e.clientX; sl = track.scrollLeft;
    });
    window.addEventListener("pointermove", function (e) {
      if (!down) return;
      var dx = e.clientX - sx;
      if (Math.abs(dx) > 4 && !moved) { moved = true; track.classList.add("drag"); }
      if (moved) track.scrollLeft = sl - dx;
    });
    window.addEventListener("pointerup", function (e) {
      if (!down) return;
      down = false;
      track.classList.remove("drag");
      if (moved) go(Math.round(track.scrollLeft / (track.clientWidth || 1)));
    });
  })();
  var CAP = ["", "We'll do better", "Could be better", "Pretty good", "Really good", "Absolutely love it"];
  [].forEach.call(form.querySelectorAll('input[name="rating"]'), function (r) {
    r.addEventListener("change", function () { $("fbcap").textContent = CAP[+r.value] || ""; $("fbcap").className = "rate-cap on"; });
  });
  if ("IntersectionObserver" in window)
    new IntersectionObserver(function (es) {
      visible = es[0].isIntersecting;
      play();
    }, { threshold: 0.4 }).observe(card);
  else visible = true;

  render("Loading feedback…");
  fetch("/api?public=1", { cache: "no-store" })
    .then(function (r) { if (!r.ok) throw 0; return r.json(); })
    .then(function (d) {
      items = (d.items || []).filter(function (x) { return x && typeof x.text === "string" && x.text; }).slice(0, 12);
      render();
      play();
    })
    .catch(function () { render(); });

  /* ---------- form ---------- */
  function anon() { return el.who.value === "anon"; }
  function who() {
    var a = anon();
    nameWrap.hidden = a;
    el.fname.disabled = a;
    if (a) {
      el.fname.removeAttribute("aria-invalid");
      nameWrap.querySelector(".err").textContent = "";
    }
  }
  [].forEach.call(form.querySelectorAll('input[name="who"]'), function (r) {
    r.addEventListener("change", who);
  });
  [].forEach.call(form.querySelectorAll('input[name="rating"]'), function (r) {
    r.addEventListener("change", function () { rateErr.textContent = ""; });
  });
  el.ftext.addEventListener("input", function () {
    var n = el.ftext.value.length;
    counter.textContent = n;
    counter.parentNode.classList.toggle("max", n >= LIMIT);
  });
  form.addEventListener("submit", function (e) {
    e.preventDefault();
    status.className = "ok";
    status.textContent = "";
    var ok = true;
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
    var rating = parseInt(el.rating.value, 10) || 0;
    rateErr.textContent = rating ? "" : "Choose a star rating.";
    if (!rating) {
      form.querySelector('input[name="rating"]').focus();
      ok = false;
    }
    var name = anon() ? "" : el.fname.value.trim();
    if (!anon()) chk(el.fname, "Enter your name.", name.length < 2);
    var text = el.ftext.value.trim().slice(0, LIMIT);
    chk(el.ftext, "Write a few words of feedback.", text.length < 3);
    if (!ok) return;
    btn.disabled = true;
    status.textContent = "Sending…";
    TasklyStore.addFeedback("", name, rating, text, function (sent) {
      btn.disabled = false;
      if (!sent) {
        status.className = "ok bad";
        status.textContent = "We couldn't send your feedback. Please try again.";
        return;
      }
      status.textContent = "";
      form.reset();
      who();
      counter.textContent = "0";
      $("fbcap").textContent = "Tap a star to rate";
      $("fbcap").className = "rate-cap";
      counter.parentNode.classList.remove("max");
      form.style.minHeight = form.offsetHeight + "px";
      form.classList.add("done");
      play();
    });
  });
  $("fbagain").onclick = function () {
    form.classList.remove("done");
    form.style.minHeight = "";
    (anon() ? el.ftext : el.fname).focus();
  };
  who();
})();
