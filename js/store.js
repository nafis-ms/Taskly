/* Taskly shared data layer (localStorage; feedback goes online via /api). Used by the landing page, the app and admin.html */
var TasklyStore = (function () {
  function g(k, d) { try { return JSON.parse(localStorage.getItem(k)) || d; } catch (e) { return d; } }
  function s(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  function hash(pw) {
    var t = "taskly|" + pw, h1 = 0xdeadbeef, h2 = 0x41c6ce57;
    for (var i = 0; i < t.length; i++) { var c = t.charCodeAt(i); h1 = Math.imul(h1 ^ c, 2654435761); h2 = Math.imul(h2 ^ c, 1597334677); }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return (h2 >>> 0).toString(16) + (h1 >>> 0).toString(16);
  }
  var day = function (t) { return new Date(t || Date.now()).toISOString().slice(0, 10); };
  var S = {
    hash: hash, day: day, get: g, set: s,
    accounts: function () { return g("taskly:accounts", {}); },
    saveAccounts: function (a) { s("taskly:accounts", a); },
    signup: function (email, name) {
      var a = S.accounts(), k = email.toLowerCase();
      a[k] = a[k] || { email: email, created: Date.now(), days: [] };
      if (name) a[k].name = name;
      S.saveAccounts(a);
    },
    /* returns false when the account is suspended */
    login: function (email) {
      var a = S.accounts(), k = email.toLowerCase();
      if (a[k] && a[k].suspended) return false;
      if (!a[k]) a[k] = { email: email, created: Date.now(), days: [] };
      S.saveAccounts(a);
      return true;
    },
    touch: function (email, stats) {
      var a = S.accounts(), k = email.toLowerCase(), u = a[k];
      if (!u) u = a[k] = { email: email, created: Date.now(), days: [] };
      u.last = Date.now();
      var d = day();
      if (u.days.indexOf(d) < 0) u.days = u.days.concat(d).slice(-60);
      for (var x in stats || {}) u[x] = stats[x];
      S.saveAccounts(a);
      return !u.suspended;
    },
    chat: function () { return g("taskly:chat", {}); },
    send: function (email, from, text) {
      var c = S.chat(), k = email.toLowerCase();
      (c[k] = c[k] || []).push({ from: from, text: text, ts: Date.now(), read: false });
      s("taskly:chat", c);
    },
    markRead: function (email, reader) {
      var c = S.chat(), k = email.toLowerCase();
      (c[k] || []).forEach(function (m) { if (m.from !== reader) m.read = true; });
      s("taskly:chat", c);
    },
    unread: function (email, reader) {
      return (S.chat()[email.toLowerCase()] || []).filter(function (m) { return m.from !== reader && !m.read; }).length;
    },
    feedback: function () { return g("taskly:feedback", []); },
    addFeedback: function (email, name, rating, text, cb) {
      fetch("/api", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email, name: name, rating: rating, text: text }) })
        .then(function (r) { if (!r.ok) throw 0; cb && cb(true); })
        .catch(function () { cb && cb(false); });
    },
    /* admin: pull the online inbox into the local cache that admin.html renders from */
    adminKey: function () { try { return sessionStorage.getItem("taskly:key") || ""; } catch (e) { return ""; } },
    pullFeedback: function (cb) {
      fetch("/api", { headers: { "x-admin-key": S.adminKey() }, cache: "no-store" })
        .then(function (r) { if (!r.ok) throw 0; return r.json(); })
        .then(function (d) { s("taskly:feedback", d.items || []); cb && cb(true); })
        .catch(function () { cb && cb(false); });
    },
    feedbackAct: function (id, method, cb, status) {
      fetch("/api?id=" + encodeURIComponent(id) + (status ? "&status=" + status : ""), { method: method, headers: { "x-admin-key": S.adminKey() } })
        .then(function (r) {
          if (r.ok) return S.pullFeedback(function (g) { cb && cb(g, g ? "" : "Saved, but the list could not be refreshed."); });
          return r.json().catch(function () { return {}; }).then(function (d) {
            cb && cb(false, r.status === 401 ? "Session expired. Log out and log in again." : (d.detail || d.error || "Server error " + r.status));
          });
        }).catch(function () { cb && cb(false, "Can't reach the server."); });
    },
    /* admin login = ask the server (ADMIN_PASSWORD on Vercel); cb gets the HTTP status, 0 if unreachable */
    adminLogin: function (pw, cb) {
      fetch("/api", { headers: { "x-admin-key": pw }, cache: "no-store" })
        .then(function (r) { cb(r.status); }).catch(function () { cb(0); });
    },
    adminAddFeedback: function (name, rating, text, cb) {
      fetch("/api", { method: "POST", headers: { "Content-Type": "application/json", "x-admin-key": S.adminKey() },
        body: JSON.stringify({ email: "", name: name, rating: rating, text: text, status: "kept" }) })
        .then(function (r) { if (!r.ok) throw 0; S.pullFeedback(cb); }).catch(function () { cb && cb(false); });
    }
  };
  return S;
})();
