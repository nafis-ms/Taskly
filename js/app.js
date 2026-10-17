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
  var S = { todos: [], history: [], reminders: [], schedule: {}, weekly: {}, checks: {}, day: "", remHistory: [] };

  function load() {
    try {
      var raw = localStorage.getItem(KEY);
      if (raw) {
        var d = JSON.parse(raw);
        for (var k in S) if (d[k]) S[k] = d[k];
      }
    } catch (e) {}
    /* older saves: tasks had no date or done flag */
    var t0 = new Date(),
      today0 = t0.getFullYear() + "-" + ("0" + (t0.getMonth() + 1)).slice(-2) + "-" + ("0" + t0.getDate()).slice(-2);
    S.todos.forEach(function (t) {
      if (!t.date) t.date = today0;
      if (t.done == null) t.done = false;
    });
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
    $(".app").classList.toggle("wide", name === "dashboard" || name === "todo" || name === "reminders" || name === "history");
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
    var go = function () {
      location.href = "index.html";
    };
    if (window.TasklyAuth) TasklyAuth.signOut().then(go, go);
    else go();
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
  function todayStr() {
    return ymd(new Date());
  }
  function plusDays(n) {
    var d = new Date();
    return ymd(new Date(d.getFullYear(), d.getMonth(), d.getDate() + n));
  }
  function dayLabel(ds) {
    if (ds === todayStr()) return "Today";
    if (ds === plusDays(1)) return "Tomorrow";
    if (ds === plusDays(-1)) return "Yesterday";
    return new Date(ds + "T00:00:00").toLocaleDateString([], { month: "short", day: "numeric" });
  }
  /* tasks still to do today (not done, due today or earlier) */
  function openTodos() {
    var d = todayStr();
    return S.todos.filter(function (t) {
      return !t.done && t.date <= d;
    });
  }
  function toggleTodo(id, on) {
    S.todos.forEach(function (t) {
      if (t.id === id) t.done = on;
    });
    save();
    renderTodos();
  }
  function renderTodos() {
    var ul = $("#todoList"),
      d = todayStr(),
      order = S.todos.map(function (t, i) {
        return { t: t, i: i };
      });
    /* open tasks first (by date), completed tasks at the bottom */
    order.sort(function (a, b) {
      if (!!a.t.done !== !!b.t.done) return a.t.done ? 1 : -1;
      if (a.t.date !== b.t.date) return a.t.date < b.t.date ? -1 : 1;
      return a.i - b.i;
    });
    ul.textContent = "";
    var upUl = $("#upList"),
      upN = 0;
    upUl.textContent = "";
    order.forEach(function (o) {
      var t = o.t,
        up = t.date > d,
        li = h("li", "item" + (t.done ? " is-done" : "")),
        body = h("div", "body"),
        tt = h("div", "t", t.title);
      if (t.date !== d) {
        tt.appendChild(document.createTextNode(" "));
        tt.appendChild(h("span", "chip" + (t.date < d ? " late" : ""), t.date < d ? "From " + dayLabel(t.date) : dayLabel(t.date)));
      }
      body.appendChild(tt);
      var x = h("button", "del", "×");
      x.type = "button";
      x.setAttribute("aria-label", "Delete: " + t.title);
      x.onclick = function () {
        S.todos = S.todos.filter(function (y) {
          return y.id !== t.id;
        });
        save();
        renderTodos();
      };
      if (!up)
        li.appendChild(checkbox(!!t.done, "Mark done: " + t.title, function (v) {
          toggleTodo(t.id, v);
        }));
      li.appendChild(body);
      li.appendChild(x);
      if (up) {
        upN++;
        upUl.appendChild(li);
      } else ul.appendChild(li);
    });
    var left = openTodos().length,
      shown = S.todos.length - upN;
    $("#todoCount").textContent = shown ? left + " left" : "";
    $("#todoEmpty").hidden = shown > 0;
    $("#cUp").hidden = !upN;
    $("#upCount").textContent = upN + (upN === 1 ? " task" : " tasks");
    renderDash();
  }

  /* optional date: Today is the default, Pick a date reveals a date field */
  function whenValue() {
    var r = $("input[name=todoWhen]:checked").value;
    if (r === "tomorrow") return plusDays(1);
    if (r === "pick") return $("#todoDate").value;
    return todayStr();
  }
  $$("input[name=todoWhen]").forEach(function (r) {
    r.addEventListener("change", function () {
      var pick = $("input[name=todoWhen]:checked").value === "pick",
        di = $("#todoDate");
      di.hidden = !pick;
      if (pick) {
        di.min = todayStr();
        if (!di.value) di.value = plusDays(2);
        di.focus();
      }
    });
  });
  $("#todoForm").addEventListener("submit", function (e) {
    e.preventDefault();
    var i = $("#todoInput"),
      v = i.value.trim(),
      err = $("#todoErr"),
      when = whenValue();
    if (!v) {
      err.textContent = "Type a task first.";
      i.setAttribute("aria-invalid", "true");
      i.focus();
      return;
    }
    if (!when || when < todayStr()) {
      err.textContent = "Pick today or a day coming up.";
      $("#todoDate").focus();
      return;
    }
    err.textContent = "";
    i.removeAttribute("aria-invalid");
    S.todos.push({ id: uid(), title: v, date: when, done: false });
    i.value = "";
    $("input[name=todoWhen][value=today]").checked = true;
    $("#todoDate").hidden = true;
    $("#todoDate").value = "";
    save();
    renderTodos();
    i.focus();
  });

  /* ---------- Day reset ---------- */
  var resetOpen = false;
  function checkDayReset() {
    var d = todayStr();
    if (!S.day) {
      S.day = d;
      save();
      return;
    }
    if (S.day === d || resetOpen) return;
    var old = S.todos.filter(function (t) {
      return t.date < d;
    });
    if (!old.length) {
      S.day = d;
      save();
      return;
    }
    var done = old.filter(function (t) {
      return t.done;
    }).length;
    resetOpen = true;
    $("#rmMsg").textContent =
      "Reset moves " + old.length + (old.length === 1 ? " task" : " tasks") + " from earlier days (" + done + " completed, " + (old.length - done) + " not completed) into History. Want to reset the TO-DO or keep it?";
    $("#resetModal").hidden = false;
    $("#rmReset").focus();
  }
  function closeReset() {
    $("#resetModal").hidden = true;
    resetOpen = false;
    S.day = todayStr();
    save();
    renderTodos();
    renderHistory();
  }
  $("#rmReset").addEventListener("click", function () {
    var d = todayStr();
    S.todos = S.todos.filter(function (t) {
      if (t.date >= d) return true;
      S.history.push({ id: t.id, title: t.title, date: t.date, status: t.done ? "done" : "missed" });
      return false;
    });
    closeReset();
  });
  $("#rmKeep").addEventListener("click", closeReset);

  /* ---------- History ---------- */
  function renderHistory() {
    var ul = $("#histList"),
      groups = {};
    ul.textContent = "";
    S.history.forEach(function (x) {
      var k = x.date || (x.doneAt ? ymd(new Date(x.doneAt)) : "");
      (groups[k] = groups[k] || []).push(x);
    });
    Object.keys(groups)
      .sort()
      .reverse()
      .forEach(function (k) {
        var hd = h("li", "hgroup", k ? new Date(k + "T00:00:00").toLocaleDateString([], { weekday: "short", month: "short", day: "numeric", year: "numeric" }) : "Earlier");
        ul.appendChild(hd);
        groups[k].forEach(function (x) {
          var ok = (x.status || "done") === "done",
            li = h("li", "item"),
            body = h("div", "body");
          body.appendChild(h("div", "t", x.title));
          li.appendChild(body);
          li.appendChild(h("span", "chip" + (ok ? "" : " late"), ok ? "Completed" : "Not completed"));
          ul.appendChild(li);
        });
      });
    $("#histEmpty").hidden = S.history.length > 0;
    $("#hTodoCount").textContent = S.history.length ? S.history.length + (S.history.length === 1 ? " task" : " tasks") : "";
    renderRemHistory();
  }
  function renderRemHistory() {
    var ul = $("#remHistList"),
      groups = {};
    ul.textContent = "";
    S.remHistory.forEach(function (x) {
      (groups[x.date] = groups[x.date] || []).push(x);
    });
    Object.keys(groups)
      .sort()
      .reverse()
      .forEach(function (k) {
        ul.appendChild(h("li", "hgroup", new Date(k + "T00:00:00").toLocaleDateString([], { weekday: "short", month: "short", day: "numeric", year: "numeric" })));
        groups[k].slice().reverse().forEach(function (x) {
          var li = h("li", "item"),
            body = h("div", "body");
          body.appendChild(h("div", "t", x.title));
          body.appendChild(h("div", "m", "Deadline " + new Date(x.due).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" }) + (x.repeat === "yearly" ? " · Every year" : "")));
          li.appendChild(body);
          li.appendChild(h("span", "chip", "Done"));
          ul.appendChild(li);
        });
      });
    $("#remHistEmpty").hidden = S.remHistory.length > 0;
    $("#hRemCount").textContent = S.remHistory.length ? S.remHistory.length + (S.remHistory.length === 1 ? " reminder" : " reminders") : "";
  }

  /* ---------- Reminders ---------- */
  var UNIT = { minutes: 60000, hours: 3600000, days: 86400000 };
  function remindAt(r) {
    return new Date(r.due).getTime() - r.lead * UNIT[r.unit];
  }
  function renderReminders() {
    renderMonth();
    renderDash();
  }

  /* all reminders whose deadline falls in the current month */
  function renderMonth() {
    var now = new Date(),
      y = now.getFullYear(),
      m = now.getMonth(),
      first = new Date(y, m, 1),
      dim = new Date(y, m + 1, 0).getDate(),
      lead = (first.getDay() + 6) % 7,
      byDay = {},
      list = S.reminders
        .filter(function (r) {
          var d = new Date(r.due);
          return d.getFullYear() === y && d.getMonth() === m;
        })
        .sort(function (a, b) {
          return new Date(a.due) - new Date(b.due);
        });
    list.forEach(function (r) {
      var k = new Date(r.due).getDate();
      (byDay[k] = byDay[k] || []).push(r);
    });
    $("#mTitle").textContent = now.toLocaleDateString([], { month: "long", year: "numeric" });
    $("#mCount").textContent = list.length + (list.length === 1 ? " reminder" : " reminders");

    var cal = $("#mCal"),
      i;
    cal.textContent = "";
    ["M", "T", "W", "T", "F", "S", "S"].forEach(function (w) {
      cal.appendChild(h("span", "mwd", w));
    });
    for (i = 0; i < lead; i++) cal.appendChild(h("span", "md off"));
    for (i = 1; i <= dim; i++) {
      var has = byDay[i],
        cell = h("span", "md" + (i === now.getDate() ? " today" : "") + (has ? " has" : ""), String(i));
      if (has) {
        cell.title = has.map(function (r) { return r.title; }).join(", ");
        var late = has.some(function (r) { return new Date(r.due).getTime() < Date.now(); });
        if (late) cell.classList.add("past");
      }
      cal.appendChild(cell);
    }

    var ul = $("#mList");
    ul.textContent = "";
    list.forEach(function (r) {
      var due = new Date(r.due),
        late = due.getTime() < Date.now(),
        li = h("li", "item"),
        dt = h("div", "mdate"),
        body = h("div", "body");
      dt.appendChild(h("b", "", String(due.getDate())));
      dt.appendChild(h("span", "", due.toLocaleDateString([], { weekday: "short" })));
      body.appendChild(h("div", "t", r.title));
      body.appendChild(h("div", "m", due.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) + (r.repeat === "yearly" ? " · Every year" : "")));
      body.appendChild(h("span", "mstat" + (late ? " late" : ""), late ? "Overdue" : "Upcoming"));
      li.appendChild(dt);
      li.appendChild(body);
      var done = h("button", "mdone", "✓ Done"),
        del = h("button", "mdel", "×");
      done.type = "button";
      done.setAttribute("aria-label", "Mark done: " + r.title);
      done.onclick = function () {
        S.remHistory.push({ id: uid(), title: r.title, due: r.due, date: todayStr(), repeat: r.repeat || "" });
        if (r.repeat === "yearly") {
          /* repeating: roll the deadline to next year instead of removing it */
          var d = new Date(r.due);
          d.setFullYear(d.getFullYear() + 1);
          r.due = d.toISOString();
          r.notified = false;
        } else {
          S.reminders = S.reminders.filter(function (x) {
            return x.id !== r.id;
          });
        }
        save();
        renderReminders();
        renderRemHistory();
      };
      del.type = "button";
      del.title = "Delete reminder";
      del.setAttribute("aria-label", "Delete reminder: " + r.title);
      del.onclick = function () {
        S.reminders = S.reminders.filter(function (x) {
          return x.id !== r.id;
        });
        save();
        renderReminders();
      };
      li.appendChild(done);
      li.appendChild(del);
      ul.appendChild(li);
    });
    $("#mEmpty").hidden = list.length > 0;
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
      repeat: v.repeat.value === "yearly" ? "yearly" : "",
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
  /* categories drive the robot's activity (see robot.js) */
  var CATS = {
    study: { label: "Study", icon: "\uD83D\uDCDA", doing: "Studying" },
    work: { label: "Work", icon: "\uD83D\uDCBB", doing: "Working" },
    creativity: { label: "Creativity", icon: "\uD83C\uDFA8", doing: "Being creative" },
    fitness: { label: "Fitness", icon: "\uD83C\uDFCB\uFE0F", doing: "Working out" },
    meal: { label: "Meal", icon: "\uD83C\uDF54", doing: "Having a meal" },
    household: { label: "Household", icon: "\uD83E\uDDF9", doing: "Doing household chores" },
    social: { label: "Family & Social", icon: "\uD83D\uDCAC", doing: "Chatting with family and friends" },
    payment: { label: "Payment", icon: "\uD83D\uDCB0", doing: "Handling payments" },
    appointment: { label: "Appointment", icon: "\uD83E\uDD12", doing: "At an appointment" },
    event: { label: "Event", icon: "\uD83D\uDC54", doing: "At an event" },
    sleep: { label: "Sleep", icon: "\uD83D\uDE34", doing: "Sleeping" },
    other: { label: "Other", icon: "", doing: "" },
  };
  var CAT_OLD = { gym: "fitness" }; /* categories saved by an earlier version */
  function catOf(b) {
    var c = b && b.cat ? CAT_OLD[b.cat] || b.cat : "other";
    return CATS[c] ? c : "other";
  }
  function catTag(b) {
    var c = catOf(b);
    return c === "other" ? null : h("span", "cat-tag", CATS[c].icon + " " + CATS[c].label);
  }
  /* everything planned for one date: one-off blocks + the weekly routine for that weekday */
  function dayItems(ds) {
    var dow = new Date(ds + "T00:00:00").getDay(),
      list = [];
    (S.schedule[ds] || []).forEach(function (b) {
      list.push({ id: b.id, title: b.title, start: b.start, end: b.end, cat: b.cat, src: "day" });
    });
    (S.weekly[dow] || []).forEach(function (b) {
      list.push({ id: b.id, title: b.title, start: b.start, end: b.end, cat: b.cat, src: "week" });
    });
    return list.sort(function (a, b) {
      return a.start < b.start ? -1 : a.start > b.start ? 1 : a.end < b.end ? -1 : 1;
    });
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
  /* edit an existing weekly routine: load it into the form, then "Save changes" replaces it */
  var editWk = null,
    wkSubmit = $("#wkForm button[type=submit]"),
    wkCancel = $("#wkCancel");
  function endEditWk() {
    editWk = null;
    wkSubmit.textContent = "Add to weekly routine";
    wkCancel.hidden = true;
  }
  function cancelWk() {
    endEditWk();
    $("#wkForm").reset();
    $$("input[type=checkbox]", wkDays).forEach(function (c) {
      c.checked = false;
    });
  }
  wkCancel.addEventListener("click", cancelWk);
  function startEditWeekly(d, b) {
    var v = $("#wkForm").elements;
    editWk = { id: b.id, day: d };
    v.title.value = b.title;
    v.start.value = b.start;
    v.end.value = b.end;
    v.cat.value = CATS[b.cat] ? b.cat : CAT_OLD[b.cat] || "other";
    $$("input[type=checkbox]", wkDays).forEach(function (c) {
      c.checked = +c.value === d;
    });
    $$(".err", $("#wkForm")).forEach(function (e) {
      e.textContent = "";
    });
    wkSubmit.textContent = "Save changes";
    wkCancel.hidden = false;
    $("#wkForm").scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "center" });
    v.title.focus();
  }
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
        var tt = h("div", "t", b.title);
        if (catTag(b)) tt.appendChild(catTag(b));
        body.appendChild(tt);
        var x = h("button", "del", "×");
        x.type = "button";
        x.setAttribute("aria-label", "Remove " + b.title + " on " + DN[d]);
        x.onclick = function () {
          if (editWk && editWk.id === b.id) cancelWk();
          S.weekly[d] = (S.weekly[d] || []).filter(function (o) {
            return o.id !== b.id;
          });
          if (!S.weekly[d].length) delete S.weekly[d];
          save();
          renderWeeklyList();
          renderDash();
        };
        var ed = h("button", "del edit", "\u270E");
        ed.type = "button";
        ed.setAttribute("aria-label", "Edit " + b.title + " on " + DN[d]);
        ed.onclick = function () {
          startEditWeekly(d, b);
        };
        li.appendChild(body);
        li.appendChild(ed);
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
    if (editWk) {
      S.weekly[editWk.day] = (S.weekly[editWk.day] || []).filter(function (o) {
        return o.id !== editWk.id;
      });
      if (!S.weekly[editWk.day].length) delete S.weekly[editWk.day];
    }
    var keepId = editWk ? editWk.id : null,
      keepDay = editWk ? String(editWk.day) : null,
      wasEdit = !!editWk;
    picked.forEach(function (c) {
      (S.weekly[c.value] = S.weekly[c.value] || []).push({
        id: wasEdit && c.value === keepDay ? keepId : uid(),
        title: v.title.value.trim(),
        start: v.start.value,
        end: v.end.value,
        cat: v.cat.value,
      });
    });
    save();
    f.reset();
    endEditWk();
    renderWeeklyList();
    renderDash();
    if (wasEdit) toast("Routine updated.");
    v.title.focus();
  });
  /* ---------- Schedule for one day ---------- */
  var oneForm = $("#oneForm");
  function oneMode() {
    return $("input[name=oneBy]:checked").value;
  }
  function syncSchedule() {
    var one = $("input[name=schType]:checked").value === "one",
      byDate = oneMode() === "date";
    $("#schWeekly").hidden = one;
    $("#schOne").hidden = !one;
    $("#oneDayWrap").hidden = byDate;
    $("#oneDateWrap").hidden = !byDate;
  }
  $$("input[name=schType], input[name=oneBy]").forEach(function (r) {
    r.addEventListener("change", syncSchedule);
  });
  /* edit an existing one-day plan */
  var editOne = null,
    oneSubmit = $("#oneForm button[type=submit]"),
    oneCancel = $("#oneCancel");
  function endEditOne() {
    editOne = null;
    oneSubmit.textContent = "Add to schedule";
    oneCancel.hidden = true;
  }
  function cancelOne() {
    endEditOne();
    oneForm.reset();
  }
  oneCancel.addEventListener("click", cancelOne);
  function startEditOne(ds, b) {
    var v = oneForm.elements;
    editOne = { id: b.id, ds: ds };
    $("input[name=oneBy][value=date]").checked = true;
    syncSchedule();
    v.date.value = ds;
    v.title.value = b.title;
    v.start.value = b.start;
    v.end.value = b.end;
    v.cat.value = CATS[b.cat] ? b.cat : CAT_OLD[b.cat] || "other";
    $$(".err", oneForm).forEach(function (e) {
      e.textContent = "";
    });
    oneSubmit.textContent = "Save changes";
    oneCancel.hidden = false;
    oneForm.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "center" });
    v.title.focus();
  }
  function renderOneList() {
    var box = $("#oneList"),
      today = ymd(new Date()),
      any = false;
    box.textContent = "";
    Object.keys(S.schedule)
      .filter(function (k) {
        return k >= today;
      })
      .sort()
      .forEach(function (ds) {
        var arr = (S.schedule[ds] || []).slice().sort(function (a, b) {
          return a.start < b.start ? -1 : a.start > b.start ? 1 : 0;
        });
        if (!arr.length) return;
        any = true;
        var wrap = h("div", "od-day"),
          ul = h("ul", "list");
        wrap.appendChild(
          h("h4", "", new Date(ds + "T00:00:00").toLocaleDateString([], { weekday: "long", day: "numeric", month: "short", year: "numeric" }))
        );
        arr.forEach(function (b) {
          var li = h("li", "item");
          li.appendChild(h("div", "when", t12(b.start) + " – " + t12(b.end)));
          var body = h("div", "body");
          var tt = h("div", "t", b.title);
          if (catTag(b)) tt.appendChild(catTag(b));
          body.appendChild(tt);
          var x = h("button", "del", "×");
          x.type = "button";
          x.setAttribute("aria-label", "Remove " + b.title + " on " + ds);
          x.onclick = function () {
            if (editOne && editOne.id === b.id) cancelOne();
            S.schedule[ds] = (S.schedule[ds] || []).filter(function (o) {
              return o.id !== b.id;
            });
            if (!S.schedule[ds].length) delete S.schedule[ds];
            save();
            renderOneList();
            renderDash();
          };
          var ed = h("button", "del edit", "\u270E");
          ed.type = "button";
          ed.setAttribute("aria-label", "Edit " + b.title + " on " + ds);
          ed.onclick = function () {
            startEditOne(ds, b);
          };
          li.appendChild(body);
          li.appendChild(ed);
          li.appendChild(x);
          ul.appendChild(li);
        });
        wrap.appendChild(ul);
        box.appendChild(wrap);
      });
    $("#oneEmpty").hidden = any;
  }
  oneForm.addEventListener("submit", function (e) {
    e.preventDefault();
    var v = oneForm.elements,
      ok = true,
      first,
      ds;
    function chk(i, msg) {
      var good = setErr(i, msg);
      if (!good && ok) first = i;
      ok = ok && good;
    }
    if (oneMode() === "day") {
      /* a weekday means its next occurrence (today if it is that day) */
      var t = new Date();
      t.setDate(t.getDate() + ((+v.day.value - t.getDay() + 7) % 7));
      ds = ymd(t);
    } else {
      ds = v.date.value;
      chk(v.date, !ds ? "Pick a date." : ds < ymd(new Date()) ? "Pick today or a later date." : "");
    }
    chk(v.title, v.title.value.trim() ? "" : "Enter the work you plan to do.");
    chk(v.start, v.start.value ? "" : "Pick a start time.");
    chk(v.end, v.end.value ? "" : "Pick an end time.");
    if (ok && v.end.value <= v.start.value) chk(v.end, "End time must be after the start time.");
    if (!ok) {
      first.focus();
      return;
    }
    var wasEditOne = !!editOne,
      oneId = editOne ? editOne.id : uid();
    if (editOne) {
      S.schedule[editOne.ds] = (S.schedule[editOne.ds] || []).filter(function (o) {
        return o.id !== editOne.id;
      });
      if (!S.schedule[editOne.ds].length) delete S.schedule[editOne.ds];
    }
    (S.schedule[ds] = S.schedule[ds] || []).push({
      id: oneId,
      title: v.title.value.trim(),
      start: v.start.value,
      end: v.end.value,
      cat: v.cat.value,
    });
    save();
    oneForm.reset();
    endEditOne();
    renderOneList();
    renderDash();
    toast((wasEditOne ? "Updated for " : "Scheduled for ") + new Date(ds + "T00:00:00").toLocaleDateString([], { weekday: "long", day: "numeric", month: "short" }) + ".");
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
      checkDayReset();
      renderTodos();
      renderMonth();
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


  /* ---------- settings ---------- */
  (function () {
    var EM = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
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
    function readUser() {
      var raw = null;
      try {
        raw = localStorage.getItem("taskly:user");
        var o = JSON.parse(raw);
        if (o && typeof o === "object") return o;
        return { email: String(o || "") };
      } catch (e) {
        return { email: String(raw || "") };
      }
    }
    var m = $("#settingsModal"),
      nameIn = $("#stName"),
      emIn = $("#stEmail"),
      curIn = $("#stCur"),
      newIn = $("#stNew"),
      confIn = $("#stConf"),
      themeSel = $("#stTheme"),
      fxSel = $("#stFx"),
      clockSel = $("#stClock"),
      opener = $("#settingsBtn"),
      cats = $$("#settingsModal [data-cat][role=tab]"),
      fields = $$("#settingsModal .st-item input, #settingsModal .st-item select");
    function showCat(name, focus) {
      cats.forEach(function (c) {
        var on = c.dataset.cat === name;
        c.setAttribute("aria-selected", on);
        c.tabIndex = on ? 0 : -1;
        $("#sts-" + c.dataset.cat).hidden = !on;
        if (on && focus) c.focus();
      });
      $(".st-pane").scrollTop = 0;
    }
    cats.forEach(function (c, i) {
      c.addEventListener("click", function () {
        showCat(c.dataset.cat);
      });
      c.addEventListener("keydown", function (e) {
        var n = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }[e.key];
        if (!n) return;
        e.preventDefault();
        showCat(cats[(i + n + cats.length) % cats.length].dataset.cat, true);
      });
    });
    /* an item gets the blue bar while focused or changed (like VS Code) */
    $(".st-pane").addEventListener("input", mark);
    $(".st-pane").addEventListener("change", mark);
    function mark(e) {
      var el = e.target,
        it = el.closest && el.closest(".st-item");
      if (it && "init" in el.dataset) it.classList.toggle("mod", el.value !== el.dataset.init);
      /* Save / Cancel only appear once something has been changed */
      $("#stFoot").hidden = !fields.some(function (f) {
        return f.value !== f.dataset.init;
      });
    }
    function openSet() {
      var u = readUser();
      nameIn.value = u.name || uname;
      emIn.value = u.email || "";
      curIn.value = newIn.value = confIn.value = "";
      themeSel.value = root.getAttribute("data-theme") === "dark" ? "dark" : "light";
      fxSel.value = root.getAttribute("data-fx") === "on" ? "on" : "off";
      clockSel.value = clk24 ? "24" : "12";
      fields.forEach(function (f) {
        f.dataset.init = f.value;
        setErr(f, "");
        f.closest(".st-item").classList.remove("mod");
      });
      showCat("account");
      $("#stFoot").hidden = true;
      m.hidden = false;
      nameIn.focus();
    }
    function closeSet() {
      m.hidden = true;
      opener.focus();
    }
    opener.addEventListener("click", openSet);
    $("#stCancel").addEventListener("click", closeSet);
    $("#stClose").addEventListener("click", closeSet);
    m.addEventListener("click", function (e) {
      if (e.target === m) closeSet();
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && !m.hidden) closeSet();
    });
    $("#stClear").addEventListener("click", function () {
      if (!confirm("Delete all tasks, reminders, schedule and history? This cannot be undone.")) return;
      try {
        localStorage.removeItem(KEY);
      } catch (e) {}
      location.reload();
    });
    $("#stSave").addEventListener("click", function () {
      var u = readUser(),
        oldEmail = String(u.email || ""),
        oldKey = oldEmail.toLowerCase(),
        email = emIn.value.trim(),
        newKey = email.toLowerCase(),
        cur = curIn.value,
        np = newIn.value,
        cf = confIn.value,
        pws = pwMap(),
        wantPw = !!(np || cf),
        first = null;
      function check(input, msg) {
        setErr(input, msg);
        if (msg && !first) first = input;
      }
      check(emIn, EM.test(email) ? "" : "Enter a valid email address.");
      if (wantPw) {
        check(curIn, pws[oldKey] && pwHash(cur) !== pws[oldKey] ? "Current password is incorrect." : "");
        check(newIn, np.length < 8 ? "Use at least 8 characters." : "");
        check(confIn, cf !== np ? "Passwords do not match." : "");
      } else {
        [curIn, newIn, confIn].forEach(function (i) {
          setErr(i, "");
        });
      }
      if (first) {
        showCat(first.closest(".st-sec").dataset.cat);
        first.focus();
        return;
      }

      /* account + security */
      var n = nameIn.value.trim();
      var map = {};
      try {
        map = JSON.parse(localStorage.getItem("taskly:names") || "{}") || {};
      } catch (e) {}
      if (newKey !== oldKey) {
        if (oldKey in map) {
          map[newKey] = map[oldKey];
          delete map[oldKey];
        }
        if (oldKey in pws) {
          pws[newKey] = pws[oldKey];
          delete pws[oldKey];
        }
      }
      if (n) map[newKey] = n;
      else delete map[newKey];
      if (wantPw) pws[newKey] = pwHash(np);
      try {
        localStorage.setItem("taskly:user", JSON.stringify({ email: email, name: n }));
        localStorage.setItem("taskly:names", JSON.stringify(map));
        localStorage.setItem("taskly:pw", JSON.stringify(pws));
      } catch (e) {}
      uname = n || email.split("@")[0];
      niceName = uname.charAt(0).toUpperCase() + uname.slice(1);
      $("#uname").textContent = "Hi, " + uname;

      /* appearance */
      var wantDark = themeSel.value === "dark";
      if (wantDark !== (root.getAttribute("data-theme") === "dark")) theme(wantDark, true);
      var wantFx = fxSel.value === "on";
      if (wantFx) root.setAttribute("data-fx", "on");
      else root.removeAttribute("data-fx");
      try {
        localStorage.setItem("taskly:fx", wantFx ? "1" : "0");
      } catch (e) {}
      var want24 = clockSel.value === "24";
      if (want24 !== clk24) {
        clk24 = want24;
        try {
          localStorage.setItem("taskly:clock24", clk24 ? "1" : "0");
        } catch (e) {}
      }
      tick();
      renderDash();
      m.hidden = true;
      opener.focus();
      toast(wantPw ? "Settings saved. Password updated." : "Settings saved.");
    });
  })();

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

  /* robot activity: the block running right now (not ticked done) decides the pose; none -> default pose */
  var botNow = { cat: "other", doing: "" };
  /* "Tired & sleepy": after 3+ finished tasks in a day, from 10 pm for 6 hours (until 4 am) */
  function isTiredTime(now) {
    var hr = now.getHours();
    if (hr >= 4 && hr < 22) return false;
    var day = new Date(now);
    if (hr < 4) day.setDate(day.getDate() - 1); /* after midnight: still last evening's day */
    var ds = ymd(day),
      n = S.todos.filter(function (t) {
        return t.done && t.date === ds;
      }).length;
    n += S.history.filter(function (x) {
      return (x.status || "done") === "done" && x.date === ds;
    }).length;
    n += S.checks[ds] ? Object.keys(S.checks[ds]).length : 0;
    return n >= 3;
  }
  function updateBot() {
    var now = new Date(),
      ds = ymd(now),
      nowM = now.getHours() * 60 + now.getMinutes(),
      cur = dayItems(ds).filter(function (b) {
        return catOf(b) !== "other" && mins(b.start) <= nowM && nowM < mins(b.end) && !isDone(ds, b.id);
      })[0],
      c = cur ? catOf(cur) : "other";
    var tired = c === "other" && isTiredTime(now);
    botNow = { cat: c, doing: cur ? CATS[c].doing + " until " + tshort(cur.end) : tired ? "Tired and sleepy after a busy day" : "" };
    window.__botAct = tired ? "tired" : c === "other" ? "default" : c;
    if (window.TasklyBot) window.TasklyBot.set(window.__botAct);
    return botNow;
  }

  function renderDash() {
    if (!$("#dGreet")) return;
    updateBot();
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
    var openT = openTodos();
    fill($("#dChips"), [openT.length, S.reminders.length, doneN, items.length].join("|"), function (c) {
      c.appendChild(h("span", "dchip", openT.length + " to-do"));
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
    tc.hidden = !openT.length;
    fill($("#dTodoList"), JSON.stringify(openT.map(function (t) { return [t.id, t.title]; })), function (box) {
      openT.slice(0, 6).forEach(function (t) {
        var row = drow(),
          c = checkbox(false, "Mark done: " + t.title, function (v) {
            toggleTodo(t.id, v);
          });
        var body = h("div", "dbody");
        body.appendChild(h("div", "tt", t.title));
        row.appendChild(c);
        row.appendChild(body);
        box.appendChild(row);
      });
      if (openT.length > 6) {
        var more = h("button", "dlink", "+" + (openT.length - 6) + " more");
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
        box.appendChild(h("p", "wr-free", "Nothing planned today. Add a weekly routine in the Schedule tab."));
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
    main.appendChild(h("div", "wr-meta", (mm < 60 ? mm + " min" : mm % 60 ? Math.floor(mm / 60) + "h " + (mm % 60) + "m" : mm / 60 + " hr") + (b.src === "week" ? " · Routine" : " · One-off") + (catOf(b) !== "other" ? " · " + CATS[catOf(b)].label : "")));
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
  renderMonth();
  renderWeeklyList();
  renderOneList();
  renderDash();
  notifyUi();
  checkReminders();
  tick();
  setInterval(tick, 1000);
  setInterval(renderDash, 60000);
  setInterval(updateBot, 10000);
  setInterval(checkReminders, 30000);
  document.addEventListener("visibilitychange", function () {
    if (!document.hidden) checkReminders();
  });
  var hash = location.hash.slice(1);
  show(["dashboard", "todo", "reminders", "schedule", "history"].indexOf(hash) > -1 ? hash : "dashboard");
})();
