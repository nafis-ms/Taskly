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
  var S = { todos: [], history: [], reminders: [], schedule: {} };

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
  }
  function complete(id, li) {
    var t = S.todos.filter(function (x) {
      return x.id === id;
    })[0];
    if (!t) return;
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
  function renderSchedule() {
    var ul = $("#schList"),
      items = day()
        .slice()
        .sort(function (a, b) {
          return a.start < b.start ? -1 : a.start > b.start ? 1 : 0;
        });
    ul.textContent = "";
    items.forEach(function (b, i) {
      var clash = items.filter(function (o, j) {
        return j !== i && o.start < b.end && b.start < o.end;
      })[0];
      var li = h("li", "item" + (clash ? " warn" : ""));
      li.appendChild(h("div", "when", t12(b.start) + " – " + t12(b.end)));
      var body = h("div", "body");
      body.appendChild(h("div", "t", b.title));
      if (clash) body.appendChild(h("div", "m", "Overlaps with " + clash.title));
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
      li.appendChild(body);
      li.appendChild(d);
      ul.appendChild(li);
    });
    $("#schEmpty").hidden = items.length > 0;
  }
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

  /* ---------- start ---------- */
  load();
  renderTodos();
  renderHistory();
  renderSchedule();
  notifyUi();
  checkReminders();
  setInterval(checkReminders, 30000);
  document.addEventListener("visibilitychange", function () {
    if (!document.hidden) checkReminders();
  });
  var hash = location.hash.slice(1);
  if (["todo", "reminders", "schedule", "history"].indexOf(hash) > -1) show(hash);
})();