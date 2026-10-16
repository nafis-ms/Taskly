(function () {
  var user = null,
    uname = "";
  try {
    user = localStorage.getItem("taskly:user");
  } catch (e) {}
  if (user) {
    try {
      var uo = JSON.parse(user);
      if (uo && typeof uo === "object") uname = uo.name || String(uo.email || "").split("@")[0];
      else uname = String(user).split("@")[0];
    } catch (e) {
      uname = String(user).split("@")[0];
    }
  }
  if (!user) {
    location.replace("index.html");
    return;
  }
  var $ = function (s, c) {
      return (c || document).querySelector(s);
    },
    $$ = function (s, c) {
      return [].slice.call((c || document).querySelectorAll(s));
    };
  var reduce = matchMedia("(prefers-reduced-motion:reduce)").matches;
  var KEY = "taskly:data:v1";
  var S = { todos: [], history: [], reminders: [], schedule: {}, weekly: {}, checks: {} };

  function load() {
    try {
      var raw = localStorage.getItem(KEY);
      if (raw) {
        var d = JSON.parse(raw);
        for (var k in S) if (d[k]) S[k] = d[k];
      }
    } catch (e) {}
  }
  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(S));
    } catch (e) {}
  }
  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }
  function h(tag, cls, text) {
    var el = document.createElement(tag);
    if (cls) el.className = cls;
    if (text != null) el.textContent = text;
    return el;
  }
  function fmt(d) {
    return new Date(d).toLocaleString([], {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  }
  function pad(n) {
    return (n < 10 ? "0" : "") + n;
  }
  function ymd(d) {
    return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
  }
  function setErr(input, msg) {
    var e = input.closest("label, fieldset").querySelector(".err");
    e.textContent = msg || "";
    if (msg) input.setAttribute("aria-invalid", "true");
    else input.removeAttribute("aria-invalid");
    return !msg;
  }

  /* ---------- tabs ---------- */
  var tabs = $$("[data-tab]");
  function show(name, focus) {
    tabs.forEach(function (t) {
      var on = t.dataset.tab === name;
      t.setAttribute("aria-selected", on);
      t.tabIndex = on ? 0 : -1;
      $("#p-" + t.dataset.tab).hidden = !on;
      if (on && focus) t.focus();
    });
    $(".app").classList.toggle("wide", name === "dashboard");
    if (name === "dashboard") renderDash();
    try {
      history.replaceState(null, "", "#" + name);
    } catch (e) {}
  }
  tabs.forEach(function (t, i) {
    t.addEventListener("click", function () {
      show(t.dataset.tab);
      if (!reduce) {
        t.classList.remove("bounce");
        void t.offsetWidth;
        t.classList.add("bounce");
      }
    });
    t.addEventListener("animationend", function () {
      t.classList.remove("bounce");
    });
    t.addEventListener("keydown", function (e) {
      var n = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
      if (!n) return;
      e.preventDefault();
      show(tabs[(i + n + tabs.length) % tabs.length].dataset.tab, true);
    });
  });


  $("#logoutBtn").addEventListener("click", function () {
    try {
      localStorage.removeItem("taskly:user");
    } catch (e) {}
    location.href = "index.html";
  });

  /* ---------- toasts ---------- */
  function toast(msg) {
    var t = h("div", "toast");
    t.appendChild(h("span", "", msg));
    var b = h("button", "", "Dismiss");
    b.type = "button";
    b.onclick = function () {
      t.remove();
    };
    t.appendChild(b);
    $("#toasts").appendChild(t);
    setTimeout(function () {
      t.remove();
    }, 12000);
  }

  /* ---------- To-Do ---------- */
  function renderTodos() {
    var ul = $("#todoList");
    ul.textContent = "";
    S.todos.forEach(function (t) {
      var li = h("li", "item");
      var c = h("button", "check");
      c.type = "button";
      c.setAttribute("aria-label", "Complete: " + t.title);
      c.onclick = function () {
        complete(t.id, li);
      };
      var body = h("div", "body");
      body.appendChild(h("div", "t", t.title));
      var d = h("button", "del", "×");
      d.type = "button";
      d.setAttribute("aria-label", "Delete: " + t.title);
      d.onclick = function () {
        S.todos = S.todos.filter(function (x) {
          return x.id !== t.id;
        });
        save();
        renderTodos();
      };
      li.appendChild(c);
      li.appendChild(body);
      li.appendChild(d);
      ul.appendChild(li);
    });
    $("#todoEmpty").hidden = S.todos.length > 0;
    renderDash();
  }
  function complete(id, li) {
    var t = S.todos.filter(function (x) {
      return x.id === id;
    })[0];
    if (!t || li.classList.contains("leaving")) return;
    function move() {
      S.todos = S.todos.filter(function (x) {
        return x.id !== id;
      });
      S.history.push({ id: t.id, title: t.title, doneAt: new Date().toISOString() });
      save();
      renderTodos();
      renderHistory();
    }
    if (reduce) return move();
    li.classList.add("leaving");
    setTimeout(move, 250);
  }
  $("#todoForm").addEventListener("submit", function (e) {
    e.preventDefault();
    var i = $("#todoInput"),
      v = i.value.trim(),
      err = $("#todoErr");
    if (!v) {
      err.textContent = "Type a task first.";
      i.setAttribute("aria-invalid", "true");
      i.focus();
      return;
    }
    err.textContent = "";
    i.removeAttribute("aria-invalid");
    S.todos.push({ id: uid(), title: v });
    i.value = "";
    save();
    renderTodos();
    i.focus();
  });

  /* ---------- History ---------- */
  function renderHistory() {
    var ul = $("#histList");
    ul.textContent = "";
    S.history
      .slice()
      .sort(function (a, b) {
        return new Date(b.doneAt) - new Date(a.doneAt);
      })
      .forEach(function (x) {
        var li = h("li", "item");
        var body = h("div", "body");
        body.appendChild(h("div", "t", x.title));
        body.appendChild(h("div", "m", "Completed " + fmt(x.doneAt)));
        li.appendChild(body);
        ul.appendChild(li);
      });
    $("#histEmpty").hidden = S.history.length > 0;
  }

  /* ---------- Reminders ---------- */
  var UNIT = { minutes: 60000, hours: 3600000, days: 86400000 };
  function remindAt(r) {
    return new Date(r.due).getTime() - r.lead * UNIT[r.unit];
  }
  function renderReminders() {
    var ul = $("#remList"),
      now = Date.now();
    ul.textContent = "";
    S.reminders
      .slice()
      .sort(function (a, b) {
        return new Date(a.due) - new Date(b.due);
      })
      .forEach(function (r) {
        var due = new Date(r.due).getTime(),
          li = h("li", "item"),
          body = h("div", "body"),
          chip;
        if (now > due) chip = h("span", "chip late", "Overdue");
        else if (now >= remindAt(r)) chip = h("span", "chip now", "Due soon");
        else chip = h("span", "chip", "Scheduled");
        var top = h("div", "t", r.title + " ");
        top.appendChild(chip);
        body.appendChild(top);
        body.appendChild(h("div", "m", "Deadline: " + fmt(r.due)));
        body.appendChild(
          h(
            "div",
            "m",
            "Reminder: " +
              fmt(remindAt(r)) +
              " (" +
              r.lead +
              " " +
              (r.lead === 1 ? r.unit.slice(0, -1) : r.unit) +
              " before)",
          ),
        );
        var done = h("button", "btn small ghost", "Done");
        done.type = "button";
        done.setAttribute("aria-label", "Mark done: " + r.title);
        done.onclick = function () {
          S.reminders = S.reminders.filter(function (x) {
            return x.id !== r.id;
          });
          save();
          renderReminders();
        };
        li.appendChild(body);
        li.appendChild(done);
        ul.appendChild(li);
      });
    $("#remEmpty").hidden = S.reminders.length > 0;
    renderDash();
  }
  function checkReminders() {
    var now = Date.now(),
      fired = false;
    S.reminders.forEach(function (r) {
      if (!r.notified && now >= remindAt(r)) {
        r.notified = true;
        fired = true;
        var msg =
          now > new Date(r.due).getTime() ?
            r.title + " was due " + fmt(r.due) + "."
          : "Reminder: " + r.title + " is due " + fmt(r.due) + ".";
        toast(msg);
        try {
          if (window.Notification && Notification.permission === "granted")
            new Notification("Taskly", { body: msg });
        } catch (e) {}
      }
    });
    if (fired) save();
    renderReminders();
  }
  function notifyUi() {
    var n = $("#notice"),
      b = $("#notifyBtn"),
      t = $("#noticeText");
    if (!window.Notification) {
      n.hidden = true;
      return;
    }
    var p = Notification.permission;
    n.hidden = p === "granted";
    b.hidden = p !== "default";
    t.textContent =
      p === "denied" ?
        "Notifications are blocked in your browser, so reminders will only show while this page is open."
      : "Turn on notifications to get reminders even when this tab is in the background.";
  }
  $("#notifyBtn").onclick = function () {
    try {
      Notification.requestPermission().then(notifyUi);
    } catch (e) {
      notifyUi();
    }
  };
  $("#remForm").addEventListener("submit", function (e) {
    e.preventDefault();
    var f = e.target,
      v = f.elements,
      ok = true,
      first;
    function chk(i, msg) {
      var good = setErr(i, msg);
      if (!good && ok) first = i;
      ok = ok && good;
    }
    chk(v.title, v.title.value.trim() ? "" : "Enter the task.");
    chk(v.date, v.date.value ? "" : "Pick a deadline date.");
    chk(v.time, v.time.value ? "" : "Pick a deadline time.");
    var lead = parseInt(v.lead.value, 10);
    chk(v.lead, lead >= 1 ? "" : "Enter a number of 1 or more.");
    var due = v.date.value && v.time.value ? new Date(v.date.value + "T" + v.time.value) : null;
    if (ok && due && due.getTime() <= Date.now()) chk(v.date, "The deadline must be in the future.");
    if (!ok) {
      first.focus();
      return;
    }
    var r = {
      id: uid(),
      title: v.title.value.trim(),
      due: due.toISOString(),
      lead: lead,
      unit: v.unit.value,
      notified: false,
    };
    S.reminders.push(r);
    save();
    f.reset();
    v.lead.value = 2;
    v.unit.value = "days";
    if (window.Notification && Notification.permission === "default") notifyUi();
    checkReminders();
    toast("Reminder set for " + fmt(remindAt(r)) + ".");
  });

  /* ---------- Schedule ---------- */
  var sd = $("#schDate");
  sd.value = ymd(new Date());
  function day() {
    return S.schedule[sd.value] || [];
  }
  function t12(t) {
    var p = t.split(":"),
      d = new Date();
    d.setHours(+p[0], +p[1], 0, 0);
    return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  }
  var DN = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
    DS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
    WORDER = [1, 2, 3, 4, 5, 6, 0];
  function mins(t) {
    var p = t.split(":");
    return +p[0] * 60 + +p[1];
  }
  function tshort(t) {
    var p = t.split(":"),
      hh = +p[0],
      mm = +p[1],
      a = hh >= 12 ? "pm" : "am";
    hh = hh % 12 || 12;
    return hh + ":" + pad(mm) + a;
  }
  /* everything planned for one date: one-off blocks + the weekly routine for that weekday */
  function dayItems(ds) {
    var dow = new Date(ds + "T00:00:00").getDay(),
      list = [];
    (S.schedule[ds] || []).forEach(function (b) {
      list.push({ id: b.id, title: b.title, start: b.start, end: b.end, src: "day" });
    });
    (S.weekly[dow] || []).forEach(function (b) {
      list.push({ id: b.id, title: b.title, start: b.start, end: b.end, src: "week" });
    });
    return list.sort(function (a, b) {
      return a.start < b.start ? -1 : a.start > b.start ? 1 : a.end < b.end ? -1 : 1;
    });
  }
  function renderSchedule() {
    var ul = $("#schList"),
      items = dayItems(sd.value);
    ul.textContent = "";
    items.forEach(function (b, i) {
      var clash = items.filter(function (o, j) {
        return j !== i && o.start < b.end && b.start < o.end;
      })[0];
      var li = h("li", "item" + (clash ? " warn" : ""));
      li.appendChild(h("div", "when", t12(b.start) + " – " + t12(b.end)));
      var body = h("div", "body");
      var tt = h("div", "t", b.title);
      if (b.src === "week") {
        tt.appendChild(document.createTextNode(" "));
        tt.appendChild(h("span", "chip", "Routine"));
      }
      body.appendChild(tt);
      if (clash) body.appendChild(h("div", "m", "Overlaps with " + clash.title));
      li.appendChild(body);
      if (b.src === "day") {
        var d = h("button", "del", "×");
        d.type = "button";
        d.setAttribute("aria-label", "Remove: " + b.title);
        d.onclick = function () {
          S.schedule[sd.value] = day().filter(function (x) {
            return x.id !== b.id;
          });
          if (!S.schedule[sd.value].length) delete S.schedule[sd.value];
          save();
          renderSchedule();
        };
        li.appendChild(d);
      }
      ul.appendChild(li);
    });
    $("#schEmpty").hidden = items.length > 0;
    renderDash();
  }

  /* ---------- Weekly routine (editor) ---------- */
  var wkDays = $("#wkDays");
  WORDER.forEach(function (d) {
    var w = h("span", "daychip"),
      i = document.createElement("input");
    i.type = "checkbox";
    i.value = d;
    i.id = "wd" + d;
    var l = h("label", "", DS[d]);
    l.htmlFor = i.id;
    w.appendChild(i);
    w.appendChild(l);
    wkDays.appendChild(w);
  });
  function renderWeeklyList() {
    var box = $("#wkList"),
      any = false;
    box.textContent = "";
    WORDER.forEach(function (d) {
      var arr = (S.weekly[d] || []).slice().sort(function (a, b) {
        return a.start < b.start ? -1 : a.start > b.start ? 1 : 0;
      });
      if (!arr.length) return;
      any = true;
      var wrap = h("div", "wk-day");
      wrap.appendChild(h("h4", "", DN[d]));
      var ul = h("ul", "list");
      arr.forEach(function (b) {
        var li = h("li", "item");
        li.appendChild(h("div", "when", t12(b.start) + " – " + t12(b.end)));
        var body = h("div", "body");
        body.appendChild(h("div", "t", b.title));
        var x = h("button", "del", "×");
        x.type = "button";
        x.setAttribute("aria-label", "Remove " + b.title + " on " + DN[d]);
        x.onclick = function () {
          S.weekly[d] = (S.weekly[d] || []).filter(function (o) {
            return o.id !== b.id;
          });
          if (!S.weekly[d].length) delete S.weekly[d];
          save();
          renderWeeklyList();
          renderSchedule();
        };
        li.appendChild(body);
        li.appendChild(x);
        ul.appendChild(li);
      });
      wrap.appendChild(ul);
      box.appendChild(wrap);
    });
    $("#wkEmpty").hidden = any;
  }
  $("#wkForm").addEventListener("submit", function (e) {
    e.preventDefault();
    var f = e.target,
      v = f.elements,
      ok = true,
      first;
    function chk(i, msg) {
      var good = setErr(i, msg);
      if (!good && ok) first = i;
      ok = ok && good;
    }
    chk(v.title, v.title.value.trim() ? "" : "Enter the routine name.");
    chk(v.start, v.start.value ? "" : "Pick a start time.");
    chk(v.end, v.end.value ? "" : "Pick an end time.");
    if (ok && v.end.value <= v.start.value) chk(v.end, "End time must be after the start time.");
    var picked = $$("input[type=checkbox]:checked", wkDays);
    $("#wkDaysErr").textContent = picked.length ? "" : "Pick at least one day.";
    if (!picked.length && ok) {
      ok = false;
      first = picked[0] || wkDays.querySelector("input");
    }
    if (!ok) {
      first.focus();
      return;
    }
    picked.forEach(function (c) {
      (S.weekly[c.value] = S.weekly[c.value] || []).push({
        id: uid(),
        title: v.title.value.trim(),
        start: v.start.value,
        end: v.end.value,
      });
    });
    save();
    f.reset();
    renderWeeklyList();
    renderSchedule();
    v.title.focus();
  });
  sd.addEventListener("change", function () {
    if (!sd.value) sd.value = ymd(new Date());
    renderSchedule();
  });
  $("#schToday").onclick = function () {
    sd.value = ymd(new Date());
    renderSchedule();
  };
  $("#schForm").addEventListener("submit", function (e) {
    e.preventDefault();
    var f = e.target,
      v = f.elements,
      ok = true,
      first;
    function chk(i, msg) {
      var good = setErr(i, msg);
      if (!good && ok) first = i;
      ok = ok && good;
    }
    chk(v.title, v.title.value.trim() ? "" : "Enter the work you plan to do.");
    chk(v.start, v.start.value ? "" : "Pick a start time.");
    chk(v.end, v.end.value ? "" : "Pick an end time.");
    if (ok && v.end.value <= v.start.value) chk(v.end, "End time must be after the start time.");
    if (!ok) {
      first.focus();
      return;
    }
    (S.schedule[sd.value] = day()).push({
      id: uid(),
      title: v.title.value.trim(),
      start: v.start.value,
      end: v.end.value,
    });
    save();
    f.reset();
    renderSchedule();
    v.title.focus();
  });

  /* ---------- dark mode (same behavior as the landing page) ---------- */
  var tb = $("#themeBtn"),
    root = document.documentElement,
    cs = $('meta[name="color-scheme"]');
  function theme(d, saveIt) {
    if (d) root.setAttribute("data-theme", "dark");
    else root.removeAttribute("data-theme");
    tb.setAttribute("aria-pressed", d);
    tb.setAttribute("aria-label", d ? "Switch to light mode" : "Switch to dark mode");
    if (cs) cs.setAttribute("content", d ? "dark" : "light");
    if (saveIt) {
      try {
        localStorage.setItem("theme", d ? "dark" : "light");
      } catch (e) {}
    }
  }
  theme(root.getAttribute("data-theme") === "dark", false);
  tb.addEventListener("click", function () {
    theme(root.getAttribute("data-theme") !== "dark", true);
  });

  $("#uname").textContent = "Hi, " + uname;


  /* ---------- Dashboard ---------- */
  var NS = "http://www.w3.org/2000/svg",
    CX = 140,
    CY = 140,
    R_TRACK = 88,
    R_EL = 106,
    C_EL = 2 * Math.PI * R_EL,
    clk24 = false,
    lastDs = "",
    plannedPct = 0,
    donePct = 0;
  try {
    clk24 = localStorage.getItem("taskly:clock24") === "1";
  } catch (e) {}
  var niceName = uname ? uname.charAt(0).toUpperCase() + uname.slice(1) : "there";

  function isDone(ds, id) {
    return !!(S.checks[ds] && S.checks[ds][id]);
  }
  function setDone(ds, id, v) {
    if (v) (S.checks[ds] = S.checks[ds] || {})[id] = true;
    else if (S.checks[ds]) {
      delete S.checks[ds][id];
      if (!Object.keys(S.checks[ds]).length) delete S.checks[ds];
    }
    save();
    renderDash();
  }
  function rel(ms) {
    var m = Math.floor(Math.abs(ms) / 60000),
      d = Math.floor(m / 1440),
      hr = Math.floor((m % 1440) / 60),
      mi = m % 60,
      t = d ? d + "d " + hr + "h" : hr ? hr + "h " + mi + "m" : Math.max(mi, 1) + "m";
    return ms < 0 ? t + " overdue" : "in " + t;
  }
  function polar(r, deg) {
    var a = (deg * Math.PI) / 180;
    return [CX + r * Math.sin(a), CY - r * Math.cos(a)];
  }
  function arcPath(r, a1, a2) {
    if (a2 - a1 >= 360) a2 = a1 + 359.99;
    var p1 = polar(r, a1),
      p2 = polar(r, a2);
    return "M" + p1[0].toFixed(2) + " " + p1[1].toFixed(2) + " A" + r + " " + r + " 0 " + (a2 - a1 > 180 ? 1 : 0) + " 1 " + p2[0].toFixed(2) + " " + p2[1].toFixed(2);
  }
  function svg(tag, attrs) {
    var el = document.createElementNS(NS, tag);
    for (var k in attrs) el.setAttribute(k, attrs[k]);
    return el;
  }
  function fill(el, sig, build) {
    if (el._sig === sig) return;
    el._sig = sig;
    el.textContent = "";
    build(el);
  }
  function union(list) {
    var iv = list
        .map(function (b) {
          return [mins(b.start), mins(b.end)];
        })
        .sort(function (a, b) {
          return a[0] - b[0];
        }),
      total = 0,
      cur = null;
    iv.forEach(function (x) {
      if (!cur) cur = x.slice();
      else if (x[0] <= cur[1]) cur[1] = Math.max(cur[1], x[1]);
      else {
        total += cur[1] - cur[0];
        cur = x.slice();
      }
    });
    if (cur) total += cur[1] - cur[0];
    return total;
  }
  function go(name) {
    show(name);
    window.scrollTo(0, 0);
  }
  $$("[data-goto]").forEach(function (b) {
    b.addEventListener("click", function () {
      go(b.dataset.goto);
    });
  });

  /* ring ticks (static) */
  (function () {
    var g = $("#rTicks");
    for (var i = 0; i < 24; i++) {
      var major = i % 6 === 0,
        a = polar(major ? 112 : 113, i * 15),
        b = polar(major ? 119 : 116, i * 15);
      g.appendChild(svg("line", { x1: a[0], y1: a[1], x2: b[0], y2: b[1], class: "r-tick" + (major ? " maj" : "") }));
    }
    [["12a", 0], ["6a", 90], ["12p", 180], ["6p", 270]].forEach(function (l) {
      var p = polar(129, l[1]),
        t = svg("text", { x: p[0], y: p[1], class: "r-hr", "text-anchor": "middle", "dominant-baseline": "central" });
      t.textContent = l[0];
      g.appendChild(t);
    });
  })();

  function tick() {
    var n = new Date(),
      ds = ymd(n),
      hh = n.getHours(),
      sec = hh * 3600 + n.getMinutes() * 60 + n.getSeconds(),
      pct = (sec / 86400) * 100,
      left = 86400 - sec;
    if (ds !== lastDs) {
      lastDs = ds;
      renderDash();
    }
    var h12 = clk24 ? hh : hh % 12 || 12;
    $("#tH").textContent = clk24 ? pad(h12) : String(h12);
    $("#tM").textContent = pad(n.getMinutes());
    $("#tS").textContent = pad(n.getSeconds());
    $("#tA").textContent = clk24 ? "" : hh >= 12 ? "PM" : "AM";
    $("#dDay").textContent = n.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric", year: "numeric" });
    $("#dLeft").textContent = Math.floor(left / 3600) + "h " + pad(Math.floor((left % 3600) / 60)) + "m left today";
    $("#dDate").textContent = n.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" });
    var g = hh < 5 ? "Good night" : hh < 12 ? "Good morning" : hh < 17 ? "Good afternoon" : hh < 21 ? "Good evening" : "Good night";
    var gEl = $("#dGreet");
    if (gEl._g !== g) {
      gEl._g = g;
      gEl.textContent = "";
      gEl.appendChild(document.createTextNode(g + ", "));
      gEl.appendChild(h("span", "nm", niceName));
      gEl.appendChild(document.createTextNode("."));
    }
    /* ring: elapsed arc, needle, centre text */
    var ptxt = pct.toFixed(1) + "%";
    $("#rEl").setAttribute("stroke-dasharray", ((C_EL * pct) / 100).toFixed(2) + " " + C_EL.toFixed(2));
    var np = polar(R_TRACK, pct * 3.6);
    $("#rNeedle").setAttribute("cx", np[0].toFixed(2));
    $("#rNeedle").setAttribute("cy", np[1].toFixed(2));
    $("#rPct").textContent = ptxt;
    $("#sEl").textContent = ptxt;
  }
  $("#clkToggle").addEventListener("click", function () {
    clk24 = !clk24;
    try {
      localStorage.setItem("taskly:clock24", clk24 ? "1" : "0");
    } catch (e) {}
    tick();
  });

  function drow(cls) {
    return h("div", "drow" + (cls ? " " + cls : ""));
  }
  function checkbox(on, label, fn) {
    var l = h("label", "cb"),
      i = document.createElement("input");
    i.type = "checkbox";
    i.checked = on;
    i.setAttribute("aria-label", label);
    i.addEventListener("change", function () {
      fn(i.checked);
    });
    l.appendChild(i);
    l.appendChild(h("span", "box"));
    return l;
  }

  function renderDash() {
    if (!$("#dGreet")) return;
    var now = new Date(),
      ds = ymd(now),
      nowM = now.getHours() * 60 + now.getMinutes(),
      items = dayItems(ds),
      doneN = items.filter(function (b) {
        return isDone(ds, b.id);
      }).length,
      leftN = items.filter(function (b) {
        return !isDone(ds, b.id) && mins(b.end) > nowM;
      }).length,
      sortedRem = S.reminders.slice().sort(function (a, b) {
        return new Date(a.due) - new Date(b.due);
      }),
      nextRem =
        sortedRem.filter(function (r) {
          return new Date(r.due).getTime() > Date.now();
        })[0] || sortedRem[0],
      ups = nextRem ? [nextRem] : [];

    /* welcome summary + chips */
    var parts = [];
    if (S.todos.length) parts.push(S.todos.length + (S.todos.length === 1 ? " task" : " tasks") + " to do");
    if (leftN) parts.push(leftN + (leftN === 1 ? " block" : " blocks") + " left in today's schedule");
    if (S.reminders.length) parts.push(S.reminders.length + (S.reminders.length === 1 ? " reminder" : " reminders") + " on the way");
    $("#dSummary").textContent = parts.length ? "You have " + parts.join(", ").replace(/, ([^,]*)$/, parts.length > 1 ? " and $1" : "$1") + "." : "Your day is clear. Add a task, reminder or time block to get started.";
    fill($("#dChips"), [S.todos.length, S.reminders.length, doneN, items.length].join("|"), function (c) {
      c.appendChild(h("span", "dchip", S.todos.length + " to-do"));
      c.appendChild(h("span", "dchip", S.reminders.length + " reminders"));
      c.appendChild(h("span", "dchip", doneN + "/" + items.length + " done today"));
    });

    /* reminder: one card, hidden when there is none */
    $("#cRem").hidden = !ups.length;
    fill($("#dRemList"), JSON.stringify(ups.map(function (r) {
      return [r.id, rel(new Date(r.due).getTime() - Date.now()), Date.now() >= remindAt(r)];
    })), function (box) {
      if (!ups.length) {
        box.appendChild(h("p", "dempty", "No reminders coming up. Set one from the Reminders tab."));
        return;
      }
      ups.forEach(function (r) {
        var due = new Date(r.due).getTime(),
          row = drow(due < Date.now() ? "late" : ""),
          body = h("div", "dbody"),
          t = h("div", "tt", r.title + " "),
          chip;
        if (Date.now() > due) chip = h("span", "chip late", "Overdue");
        else if (Date.now() >= remindAt(r)) chip = h("span", "chip now", "Due soon");
        else chip = h("span", "chip", "Scheduled");
        t.appendChild(chip);
        body.appendChild(t);
        body.appendChild(h("div", "mm", rel(due - Date.now()) + " · " + fmt(r.due)));
        row.appendChild(body);
        box.appendChild(row);
      });
    });

    /* to-do: only shown when there is something to do */
    var tc = $("#cTodo");
    tc.hidden = !S.todos.length;
    fill($("#dTodoList"), JSON.stringify(S.todos.map(function (t) { return [t.id, t.title]; })), function (box) {
      S.todos.slice(0, 6).forEach(function (t) {
        var row = drow(),
          c = h("button", "check");
        c.type = "button";
        c.setAttribute("aria-label", "Complete: " + t.title);
        c.onclick = function () {
          complete(t.id, row);
        };
        var body = h("div", "dbody");
        body.appendChild(h("div", "tt", t.title));
        row.appendChild(c);
        row.appendChild(body);
        box.appendChild(row);
      });
      if (S.todos.length > 6) {
        var more = h("button", "dlink", "+" + (S.todos.length - 6) + " more");
        more.type = "button";
        more.onclick = function () {
          go("todo");
        };
        box.appendChild(more);
      }
    });

    /* today's schedule with checkboxes */
    var cur = items.filter(function (b) {
      return mins(b.start) <= nowM && nowM < mins(b.end);
    }).map(function (b) { return b.id; });
    fill($("#dToday"), JSON.stringify(items.map(function (b) {
      return [b.id, b.title, b.start, b.end, b.src, isDone(ds, b.id), cur.indexOf(b.id) > -1];
    })), function (box) {
      if (!items.length) {
        box.appendChild(h("p", "wr-free", "Nothing planned today. Add time blocks or a weekly routine in the Schedule tab."));
        return;
      }
      var tot = union(items),
        head = h("div", "wr-head");
      head.appendChild(h("b", "", DN[now.getDay()] + " · Today"));
      head.appendChild(h("span", "", items.length + (items.length === 1 ? " block · " : " blocks · ") + Math.floor(tot / 60) + "h " + pad(tot % 60) + "m planned"));
      box.appendChild(head);
      var ul = h("ul", "wr-list");
      items.forEach(function (b) {
        ul.appendChild(wrRow(b, ds, cur.indexOf(b.id) > -1));
      });
      box.appendChild(ul);
    });
    $("#cToday").hidden = !items.length;
    $("#tProg").textContent = items.length ? doneN + " of " + items.length + " done" : "";
    $("#tBar").style.width = items.length ? (doneN / items.length) * 100 + "%" : "0%";

    /* 24h ring: planned + completed arcs and stats */
    var doneList = items.filter(function (b) { return isDone(ds, b.id); });
    plannedPct = (union(items) / 1440) * 100;
    donePct = (union(doneList) / 1440) * 100;
    $("#sPl").textContent = plannedPct.toFixed(1) + "%";
    $("#sDn").textContent = donePct.toFixed(1) + "%";
    fill($("#rBlocks"), JSON.stringify(items.map(function (b) { return [b.start, b.end, isDone(ds, b.id)]; })), function (g) {
      items.forEach(function (b) {
        var d = isDone(ds, b.id);
        g.appendChild(svg("path", { d: arcPath(R_TRACK, mins(b.start) * 0.25, mins(b.end) * 0.25), class: "r-arc " + (d ? "r-done" : "r-plan") }));
      });
    });

    /* weekly routine: the recurring weekly plan only, Mon to Sun */
    var mon = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7)),
      days = [];
    for (var i = 0; i < 7; i++) {
      var dt = new Date(mon.getFullYear(), mon.getMonth(), mon.getDate() + i);
      days.push({
        ds: ymd(dt),
        date: dt,
        items: (S.weekly[dt.getDay()] || []).slice().sort(function (a, b) {
          return a.start < b.start ? -1 : a.start > b.start ? 1 : a.end < b.end ? -1 : 1;
        })
      });
    }
    $("#wrRange").textContent = "Repeats every week";
    fill($("#dWeek"), JSON.stringify([ds, days.map(function (d) {
      return d.items.map(function (b) { return [b.id, b.title, b.start, b.end]; });
    })]), function (box) {
      var grid = h("div", "wk");
      days.forEach(function (d) {
        var row = h("div", "wk-day" + (d.ds === ds ? " today" : "")),
          lab = h("div", "wk-lab", DS[d.date.getDay()]),
          body = h("div", "wk-body");
        if (d.items.length) {
          d.items.forEach(function (b) {
            var ln = h("div", "wk-line");
            ln.appendChild(h("span", "wk-t", tshort(b.start) + " – " + tshort(b.end)));
            ln.appendChild(h("span", "wk-title", b.title));
            body.appendChild(ln);
          });
        } else {
          for (var j = 0; j < 3; j++) body.appendChild(h("div", "wk-line blank"));
        }
        row.appendChild(lab);
        row.appendChild(body);
        grid.appendChild(row);
      });
      box.appendChild(grid);
    });
  }

  /* one timeline row (used by Today's schedule) */
  function wrRow(b, key, on) {
    var dn = isDone(key, b.id),
      li = h("li", "wr-row " + (b.src === "week" ? "rt" : "one") + (dn ? " is-done" : "") + (on && !dn ? " now" : "")),
      tm = h("div", "wr-t"),
      mm = mins(b.end) - mins(b.start),
      main = h("div", "wr-main"),
      t = h("div", "wr-title", b.title + " ");
    tm.appendChild(h("b", "", tshort(b.start)));
    tm.appendChild(h("span", "", tshort(b.end)));
    if (on && !dn) t.appendChild(h("span", "chip now", "Now"));
    main.appendChild(t);
    main.appendChild(h("div", "wr-meta", (mm < 60 ? mm + " min" : mm % 60 ? Math.floor(mm / 60) + "h " + (mm % 60) + "m" : mm / 60 + " hr") + (b.src === "week" ? " · Routine" : " · One-off")));
    li.appendChild(tm);
    li.appendChild(h("i", "wr-bar"));
    li.appendChild(main);
    li.appendChild(checkbox(dn, "Mark done: " + b.title, function (v) {
      setDone(key, b.id, v);
    }));
    return li;
  }

  /* robot: hide the placeholder once the scene has loaded */
  (function () {
    var r = $("#robot"),
      c = $("#cRobot");
    if (!r) return;
    function ok() {
      c.classList.add("loaded");
    }
    r.addEventListener("load-complete", ok);
    r.addEventListener("load-start", function () {});
    setTimeout(function () {
      if (!c.classList.contains("loaded") && window.customElements && customElements.get("spline-viewer") === undefined)
        $("#robotPh").textContent = "The robot needs an internet connection to appear.";
    }, 8000);
  })();

  /* ---------- start ---------- */
  load();
  renderTodos();
  renderHistory();
  renderWeeklyList();
  renderSchedule();
  notifyUi();
  checkReminders();
  tick();
  setInterval(tick, 1000);
  setInterval(renderDash, 60000);
  setInterval(checkReminders, 30000);
  document.addEventListener("visibilitychange", function () {
    if (!document.hidden) checkReminders();
  });
  var hash = location.hash.slice(1);
  show(["dashboard", "todo", "reminders", "schedule", "history"].indexOf(hash) > -1 ? hash : "dashboard");
})();